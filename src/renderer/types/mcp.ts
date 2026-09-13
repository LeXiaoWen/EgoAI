// MCP Server type definitions
export type McpTransportType = 'stdio' | 'sse' | 'http';

export const McpRegistryEntryKind = {
  Server: 'server',
  Bundle: 'bundle',
} as const;
export type McpRegistryEntryKind = typeof McpRegistryEntryKind[keyof typeof McpRegistryEntryKind];

export interface McpServerConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  transportType: McpTransportType;
  command?: string;              // stdio
  args?: string[];               // stdio
  env?: Record<string, string>;  // stdio
  url?: string;                  // sse / http
  headers?: Record<string, string>; // sse / http
  isBuiltIn: boolean;            // installed from built-in registry
  githubUrl?: string;            // GitHub repository URL
  registryId?: string;           // matching registry entry ID
  launchResolution?: McpLaunchResolution;
  createdAt: number;
  updatedAt: number;
}

export interface McpLaunchResolution {
  serverId: string;
  resolverKind: 'npx' | 'uvx' | 'python' | 'raw';
  sourceFingerprint: string;
  status: 'pending' | 'installing' | 'ready' | 'failed' | 'unsupported';
  packageName?: string;
  requestedVersion?: string;
  resolvedVersion?: string;
  installDir?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  error?: string;
  installedAt?: number;
  resolvedAt?: number;
  lastProbeAt?: number;
  lastProbeStatus?: string;
  updatedAt: number;
}

export interface McpServerFormData {
  name: string;
  description: string;
  transportType: McpTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  isBuiltIn?: boolean;
  githubUrl?: string;
  registryId?: string;
}

// Built-in MCP registry entry (pure frontend definition)
export interface McpRegistryEntry {
  id: string;                    // unique identifier, e.g. 'filesystem'
  name: string;                  // display name, English; also the zh fallback
  name_zh?: string;              // Chinese display name (remote data)
  icon?: string;                 // icon URL (remote data); falls back to the default glyph
  descriptionKey: string;        // i18n translation key for description
  description_zh?: string;       // Chinese description (remote data)
  description_en?: string;       // English description (remote data)
  category: McpCategory;         // category tag
  categoryKey: string;           // i18n translation key for category
  transportType: McpTransportType;
  command: string;               // default command, e.g. 'npx'
  defaultArgs: string[];         // default arguments
  requiredEnvKeys?: string[];    // env vars the user must fill
  optionalEnvKeys?: string[];    // optional env vars
  argPlaceholders?: string[];    // placeholder hints for args (e.g. path)
  kind?: McpRegistryEntryKind;   // defaults to a single-server registry entry
}

export type McpCategory =
  | 'search'
  | 'browser'
  | 'developer'
  | 'productivity'
  | 'design'
  | 'data-api';
