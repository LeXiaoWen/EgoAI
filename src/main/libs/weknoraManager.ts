// Manages the bundled WeKnora-lite knowledge-base server as a child process:
// resolve the vendored binary, spawn it on a loopback port, poll for
// readiness, and stop it with the app. WeKnora-lite is a static Go binary
// built from WeKnora's cmd/server; unlike the dsh runtime it needs no
// installer, so this manager only assembles its env and lifecycle.

import { type ChildProcess, spawn } from 'child_process';
import * as crypto from 'crypto';
import { app } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';

// First start pays for sqlite-vec init + the migration run; the cap guards a
// wedged child, not a slow one.
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_INTERVAL_MS = 250;
// The HTTP server binds before migrations finish; re-probe after this settle
// so a child that dies mid-boot is reported as a failure instead of ready.
const READY_SETTLE_MS = 750;
const STOP_GRACE_MS = 5_000;
const LOG_RING_MAX_LINES = 400;

export type WeknoraPhase = 'stopped' | 'starting' | 'ready' | 'failed';

export interface WeknoraState {
  phase: WeknoraPhase;
  port: number | null;
  error: string | null;
}

interface WeknoraSecrets {
  // SYSTEM_AES_KEY must be exactly 32 bytes: WeKnora's utils.GetAESKey() reads
  // it straight from the env and silently disables encryption when len != 32.
  systemAesKey: string;
  jwtSecret: string;
}

export class WeknoraManager {
  private child: ChildProcess | null = null;
  private generation = 0;
  private state: WeknoraState = { phase: 'stopped', port: null, error: null };
  private readonly logRing: string[] = [];
  private quitHookInstalled = false;
  private startPromise: Promise<WeknoraState> | null = null;

  getState(): WeknoraState {
    return { ...this.state };
  }

  getWebUrl(): string | null {
    return this.state.phase === 'ready' && this.state.port ? `http://127.0.0.1:${this.state.port}` : null;
  }

  getPort(): number | null {
    return this.state.port;
  }

  getRecentLogs(): string[] {
    return [...this.logRing];
  }

  // Entry point of the stdio MCP server OpenClaw spawns to talk to WeKnora.
  getMcpServerEntryPath(): string {
    return path.join(this.resolveResourcesRoot(), 'mcp-server', 'run_server.py');
  }

  // Dev reads the tree under app.getAppPath(); packaged reads the unpacked
  // extraResources directory next to the asar.
  private resolveResourcesRoot(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'weknora')
      : path.join(app.getAppPath(), 'resources', 'weknora');
  }

  private resolveBinaryPath(): string {
    return path.join(this.resolveResourcesRoot(), 'WeKnora-lite');
  }

  private getDataDir(): string {
    return path.join(app.getPath('userData'), 'weknora');
  }

  private getSecretsPath(): string {
    return path.join(this.getDataDir(), 'secrets.json');
  }

  async start(): Promise<WeknoraState> {
    if (this.state.phase === 'ready' && this.child) return this.getState();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.generation += 1;
    this.child = null;
    if (child) {
      await this.terminateChild(child);
    }
    if (this.state.phase !== 'failed') {
      this.setState({ phase: 'stopped', port: null, error: null });
    }
  }

  private async doStart(): Promise<WeknoraState> {
    if (!app.isReady()) {
      await app.whenReady();
    }
    await this.stop();
    this.logRing.length = 0;
    const generation = this.generation;

    const resourcesRoot = this.resolveResourcesRoot();
    const binaryPath = this.resolveBinaryPath();
    if (!fs.existsSync(binaryPath)) {
      console.error(`[WeKnora] Binary not found at ${binaryPath}`);
      this.setState({ phase: 'failed', port: null, error: 'Binary missing' });
      return this.getState();
    }

    this.setState({ phase: 'starting', port: null, error: null });

    const dataDir = this.getDataDir();
    fs.mkdirSync(path.join(dataDir, 'data'), { recursive: true });
    const secrets = this.loadOrCreateSecrets();
    const port = await allocateLoopbackPort();

    // cwd must contain config/config.yaml and migrations/sqlite, both resolved
    // relative to the working directory by WeKnora's loader.
    const env = buildSpawnEnv(resourcesRoot, dataDir, secrets, port);

    console.log(`[WeKnora] Starting on 127.0.0.1:${port} (cwd=${resourcesRoot})`);
    let child: ChildProcess;
    try {
      child = spawn(binaryPath, [], {
        cwd: resourcesRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(process.platform === 'win32' ? { windowsHide: true } : {}),
      });
    } catch (error) {
      console.error('[WeKnora] Failed to spawn server', error);
      this.setState({ phase: 'failed', port: null, error: 'Spawn failed' });
      return this.getState();
    }

    this.child = child;
    this.installQuitHook();
    this.wireChildStreams(child, generation);

    const ready = await this.waitForReady(port, generation);
    if (this.generation !== generation) return this.getState();
    if (!ready) {
      const tail = this.child ? `. Recent output:\n${this.logRing.slice(-20).join('\n')}` : '';
      console.error(`[WeKnora] Server did not become ready${tail}`);
      await this.stop();
      this.setState({ phase: 'failed', port: null, error: 'Ready timeout' });
      return this.getState();
    }

    console.log(`[WeKnora] Ready at http://127.0.0.1:${port}`);
    this.setState({ phase: 'ready', port, error: null });
    return this.getState();
  }

  // Persists the AES/JWT secrets so a restart keeps decrypting stored
  // credentials and keeps already-issued tokens valid.
  private loadOrCreateSecrets(): WeknoraSecrets {
    const secretsPath = this.getSecretsPath();
    try {
      if (fs.existsSync(secretsPath)) {
        const parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as Partial<WeknoraSecrets>;
        if (
          typeof parsed.systemAesKey === 'string' &&
          parsed.systemAesKey.length === 32 &&
          typeof parsed.jwtSecret === 'string' &&
          parsed.jwtSecret.length > 0
        ) {
          return { systemAesKey: parsed.systemAesKey, jwtSecret: parsed.jwtSecret };
        }
      }
    } catch (error) {
      console.warn('[WeKnora] Could not read persisted secrets; regenerating', error);
    }
    const secrets: WeknoraSecrets = {
      // 24 random bytes encode to exactly 32 base64url characters, which is the
      // 32-byte ASCII length utils.GetAESKey() requires.
      systemAesKey: crypto.randomBytes(24).toString('base64url'),
      jwtSecret: crypto.randomBytes(32).toString('hex'),
    };
    try {
      fs.mkdirSync(this.getDataDir(), { recursive: true });
      fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    } catch (error) {
      console.warn('[WeKnora] Could not persist secrets', error);
    }
    return secrets;
  }

  private wireChildStreams(child: ChildProcess, generation: number): void {
    const append = (chunk: unknown) => {
      const lines = String(chunk).split(/\r?\n/).filter((line) => line.length > 0);
      this.logRing.push(...lines);
      if (this.logRing.length > LOG_RING_MAX_LINES) {
        this.logRing.splice(0, this.logRing.length - LOG_RING_MAX_LINES);
      }
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('exit', (code: number | null) => {
      if (this.generation !== generation) return;
      this.child = null;
      if (code !== 0) {
        console.error(`[WeKnora] Server exited (code=${code ?? 'null'}). Recent output:\n${this.logRing.slice(-40).join('\n')}`);
      }
      if (this.state.phase === 'ready') {
        console.warn(`[WeKnora] Server exited unexpectedly (code=${code ?? 'null'})`);
        this.setState({ phase: 'stopped', port: null, error: null });
      }
    });
  }

  private async waitForReady(port: number, generation: number): Promise<boolean> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.generation !== generation || !this.child) return false;
      if ((await probeHttpStatus(port)) === 200) {
        await delay(READY_SETTLE_MS);
        if (this.generation !== generation || !this.child) return false;
        return (await probeHttpStatus(port)) === 200;
      }
      await delay(READY_POLL_INTERVAL_MS);
    }
    return false;
  }

  private async terminateChild(child: ChildProcess): Promise<void> {
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    });
    try {
      child.kill();
    } catch {
      return;
    }
    const timedOut = await Promise.race([exited.then(() => false), delay(STOP_GRACE_MS).then(() => true)]);
    if (timedOut) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
      await Promise.race([exited, delay(1_000)]);
    }
  }

  private installQuitHook(): void {
    if (this.quitHookInstalled) return;
    this.quitHookInstalled = true;
    app.on('will-quit', () => {
      const child = this.child;
      this.generation += 1;
      this.child = null;
      if (child) {
        try {
          child.kill();
        } catch {
          // Already gone.
        }
      }
    });
  }

  private setState(patch: Partial<WeknoraState>): void {
    this.state = { ...this.state, ...patch };
  }
}

function buildSpawnEnv(
  resourcesRoot: string,
  dataDir: string,
  secrets: WeknoraSecrets,
  port: number
): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };

  // Merge .env.lite defaults on top of the ambient environment. WeKnora's
  // cmd/server does not load dotenv itself; the official run-lite target
  // exports .env.lite into the shell before exec, so we reproduce that here.
  const dotEnvPath = path.join(resourcesRoot, '.env.lite');
  try {
    Object.assign(env, parseDotEnv(fs.readFileSync(dotEnvPath, 'utf8')));
  } catch (error) {
    console.warn('[WeKnora] Could not read .env.lite; using ambient env only', error);
  }

  // Dynamic overrides.
  env.SERVER_PORT = String(port);
  env.DB_PATH = path.join(dataDir, 'data', 'weknora.db');
  env.LOCAL_STORAGE_BASE_DIR = path.join(dataDir, 'data', 'files');
  env.SYSTEM_AES_KEY = secrets.systemAesKey;
  env.JWT_SECRET = secrets.jwtSecret;
  // TENANT_AES_KEY is a legacy placeholder WeKnora never reads; drop it so it
  // cannot be mistaken for the real encryption key (SYSTEM_AES_KEY).
  delete env.TENANT_AES_KEY;
  return env;
}

function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not allocate a loopback port')));
      }
    });
  });
}

function probeHttpStatus(port: number): Promise<number> {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2_000 }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => resolve(0));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let weknoraManagerInstance: WeknoraManager | null = null;

export function getWeknoraManager(): WeknoraManager {
  if (!weknoraManagerInstance) {
    weknoraManagerInstance = new WeknoraManager();
  }
  return weknoraManagerInstance;
}
