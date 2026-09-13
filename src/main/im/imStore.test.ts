import { expect,test } from 'vitest';

import { IMStore } from './imStore';

class FakeDb {
  private store: Map<string, string> = new Map();
  private mappings: Map<string, {
    im_conversation_id: string;
    platform: string;
    cowork_session_id: string;
    agent_id: string;
    openclaw_session_key: string | null;
    created_at: number;
    last_active_at: number;
  }> = new Map();
  writeCount = 0;

  pragma(_name: string) {
    // Report migrated columns as already present to skip ALTER TABLE migrations.
    return [
      { name: 'im_conversation_id', pk: 1 },
      { name: 'platform', pk: 2 },
      { name: 'agent_id', pk: 3 },
      { name: 'openclaw_session_key', pk: 0 },
    ];
  }

  prepare(sql: string) {
    return {
      run: (...params: unknown[]) => {
        if (sql.includes('INSERT') && sql.includes('im_config')) {
          this.store.set(String(params[0]), String(params[1]));
          this.writeCount++;
          return;
        }
        if (sql.includes('UPDATE im_config')) {
          // UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?
          this.store.set(String(params[2]), String(params[0]));
          this.writeCount++;
          return;
        }
        if (sql.includes('DELETE FROM im_config WHERE key = ?')) {
          this.store.delete(String(params[0]));
          this.writeCount++;
          return;
        }
        if (sql.includes('INSERT INTO im_session_mappings')) {
          const row = {
            im_conversation_id: String(params[0]),
            platform: String(params[1]),
            cowork_session_id: String(params[2]),
            agent_id: String(params[3]),
            openclaw_session_key: params[4] ? String(params[4]) : null,
            created_at: Number(params[5]),
            last_active_at: Number(params[6]),
          };
          this.mappings.set(this.mappingKey(row.im_conversation_id, row.platform, row.agent_id), row);
          this.writeCount++;
          return;
        }
        if (sql.includes('UPDATE im_session_mappings') && sql.includes('SET openclaw_session_key = ?')) {
          const key = params.length >= 5
            ? this.mappingKey(String(params[2]), String(params[3]), String(params[4]))
            : this.findMappingKey(String(params[2]), String(params[3]));
          const row = this.mappings.get(key);
          if (row) {
            row.openclaw_session_key = String(params[0]);
            row.last_active_at = Number(params[1]);
          }
          this.writeCount++;
          return;
        }
        if (sql.includes('UPDATE im_session_mappings') && sql.includes('SET cowork_session_id = ?')) {
          const key = params.length >= 7
            ? this.mappingKey(String(params[4]), String(params[5]), String(params[6]))
            : this.findMappingKey(String(params[4]), String(params[5]));
          const row = this.mappings.get(key);
          if (row) {
            row.cowork_session_id = String(params[0]);
            row.agent_id = String(params[1]);
            if (params[2]) {
              row.openclaw_session_key = String(params[2]);
            }
            row.last_active_at = Number(params[3]);
          }
          this.writeCount++;
          return;
        }
        if (sql.includes('UPDATE im_session_mappings') && sql.includes('SET last_active_at = ?')) {
          const key = params.length >= 4
            ? this.mappingKey(String(params[1]), String(params[2]), String(params[3]))
            : this.findMappingKey(String(params[1]), String(params[2]));
          const row = this.mappings.get(key);
          if (row) {
            row.last_active_at = Number(params[0]);
          }
          this.writeCount++;
          return;
        }
        if (sql.includes('DELETE FROM im_session_mappings WHERE im_conversation_id = ?')) {
          if (params.length >= 3) {
            this.mappings.delete(this.mappingKey(String(params[0]), String(params[1]), String(params[2])));
          } else {
            for (const key of Array.from(this.mappings.keys())) {
              const row = this.mappings.get(key);
              if (row?.im_conversation_id === params[0] && row.platform === params[1]) {
                this.mappings.delete(key);
              }
            }
          }
          this.writeCount++;
          return;
        }
        if (sql.includes('DELETE FROM im_session_mappings WHERE cowork_session_id = ?')) {
          const target = String(params[0]);
          for (const [key, row] of this.mappings.entries()) {
            if (row.cowork_session_id === target) {
              this.mappings.delete(key);
            }
          }
          this.writeCount++;
          return;
        }
        // CREATE TABLE, ALTER TABLE, etc: count as write
        this.writeCount++;
      },
      get: (...params: unknown[]) => {
        if (sql.includes('SELECT value FROM im_config WHERE key = ?')) {
          const value = this.store.get(String(params[0]));
          return value !== undefined ? { value } : undefined;
        }
        if (sql.includes('FROM im_session_mappings WHERE openclaw_session_key = ?')) {
          const target = String(params[0]);
          return Array.from(this.mappings.values()).find(row => row.openclaw_session_key === target);
        }
        if (sql.includes('FROM im_session_mappings') && sql.includes('im_conversation_id = ?')) {
          if (params.length >= 3) {
            return this.mappings.get(this.mappingKey(String(params[0]), String(params[1]), String(params[2])));
          }
          return this.mappings.get(this.findMappingKey(String(params[0]), String(params[1])));
        }
        if (sql.includes('FROM im_session_mappings WHERE cowork_session_id = ?')) {
          const target = String(params[0]);
          return Array.from(this.mappings.values()).find(row => row.cowork_session_id === target);
        }
        return undefined;
      },
      all: (...params: unknown[]) => {
        if (sql.includes('SELECT key, value FROM im_config WHERE key LIKE ?')) {
          const prefix = String(params[0]).replace('%', '');
          return Array.from(this.store.entries())
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({ key, value }));
        }
        return [];
      },
    };
  }

  private mappingKey(imConversationId: string, platform: string, agentId: string) {
    return `${platform}\0${imConversationId}\0${agentId}`;
  }

  private findMappingKey(imConversationId: string, platform: string): string {
    for (const [key, row] of this.mappings.entries()) {
      if (row.im_conversation_id === imConversationId && row.platform === platform) {
        return key;
      }
    }
    return this.mappingKey(imConversationId, platform, 'main');
  }

  seed(key: string, value: unknown) {
    this.store.set(key, JSON.stringify(value));
  }

  getValue(key: string) {
    return this.store.get(key);
  }
}

function createStore(db: FakeDb) {
  return new IMStore(db as unknown as ConstructorParameters<typeof IMStore>[0]);
}

test('IMStore persists conversation reply routes by platform and conversation ID', () => {
  const db = new FakeDb();
  const store = createStore(db);

  expect(store.getConversationReplyRoute('wecom', '__default__:conv-1')).toBe(null);

  store.setConversationReplyRoute('wecom', '__default__:conv-1', {
    channel: 'wecom',
    to: 'group:cid-42',
    accountId: '__default__',
  });

  expect(store.getConversationReplyRoute('wecom', '__default__:conv-1')).toEqual({
    channel: 'wecom',
    to: 'group:cid-42',
    accountId: '__default__',
  });
  expect(store.getConversationReplyRoute('weixin', '__default__:conv-1')).toBe(null);
  expect(db.writeCount >= 2).toBeTruthy();
});

test('IMStore persists OpenClaw session keys in IM session mappings', () => {
  const db = new FakeDb();
  const store = createStore(db);

  store.createSessionMapping(
    'bot-1:direct:user-1',
    'weixin',
    'cowork-1',
    'main',
    'agent:main:openclaw-weixin:bot-1:direct:user-1',
  );

  expect(store.getSessionMapping('bot-1:direct:user-1', 'weixin')).toMatchObject({
    imConversationId: 'bot-1:direct:user-1',
    platform: 'weixin',
    coworkSessionId: 'cowork-1',
    agentId: 'main',
    openClawSessionKey: 'agent:main:openclaw-weixin:bot-1:direct:user-1',
  });
  expect(store.getSessionMappingByCoworkSessionId('cowork-1')?.openClawSessionKey)
    .toBe('agent:main:openclaw-weixin:bot-1:direct:user-1');

  store.updateSessionOpenClawSessionKey(
    'bot-1:direct:user-1',
    'weixin',
    'agent:main:openclaw-weixin:bot-1:direct:user-2',
  );

  expect(store.getSessionMapping('bot-1:direct:user-1', 'weixin')?.openClawSessionKey)
    .toBe('agent:main:openclaw-weixin:bot-1:direct:user-2');

  store.updateSessionMappingTarget(
    'bot-1:direct:user-1',
    'weixin',
    'cowork-2',
    'agent-2',
    'agent:agent-2:openclaw-weixin:bot-1:direct:user-1',
  );

  expect(store.getSessionMapping('bot-1:direct:user-1', 'weixin')).toMatchObject({
    coworkSessionId: 'cowork-2',
    agentId: 'agent-2',
    openClawSessionKey: 'agent:agent-2:openclaw-weixin:bot-1:direct:user-1',
  });
});

test('IMStore distinguishes the same conversation under different agents', () => {
  const db = new FakeDb();
  const store = createStore(db);

  store.createSessionMapping(
    'group:cid-sanitized',
    'weixin',
    'cowork-main',
    'main',
    'agent:main:openclaw-weixin:group:cid-sanitized',
  );
  store.createSessionMapping(
    'group:cid-sanitized',
    'weixin',
    'cowork-agent',
    'agent-2',
    'agent:agent-2:openclaw-weixin:group:cid-sanitized',
  );

  expect(store.getSessionMapping('group:cid-sanitized', 'weixin', 'main')).toMatchObject({
    coworkSessionId: 'cowork-main',
    agentId: 'main',
  });
  expect(store.getSessionMapping('group:cid-sanitized', 'weixin', 'agent-2')).toMatchObject({
    coworkSessionId: 'cowork-agent',
    agentId: 'agent-2',
  });
  expect(
    store.getSessionMappingByOpenClawSessionKey('agent:agent-2:openclaw-weixin:group:cid-sanitized'),
  ).toMatchObject({
    coworkSessionId: 'cowork-agent',
    agentId: 'agent-2',
  });
});

test('IMStore getConfig returns exactly the four shipped channels', () => {
  const db = new FakeDb();
  const store = createStore(db);

  expect(Object.keys(store.getConfig()).sort()).toEqual([
    'email',
    'qq',
    'settings',
    'wecom',
    'weixin',
  ]);
});

test('IMStore round-trips QQ instances through qq:{instanceId} keys', () => {
  const db = new FakeDb();
  const store = createStore(db);

  expect(store.getQQInstances()).toEqual([]);

  store.setQQInstanceConfig('qq-1', { instanceName: 'QQ 一号', appId: '123', appSecret: 's1' });
  store.setQQInstanceConfig('qq-2', { instanceName: 'QQ 二号', appId: '456', appSecret: 's2' });

  expect(store.getQQInstanceConfig('qq-1')).toMatchObject({
    instanceId: 'qq-1',
    instanceName: 'QQ 一号',
    appId: '123',
  });
  expect(db.getValue('qq:qq-1')).toBeTruthy();

  // Partial updates must merge rather than replace the stored instance.
  store.setQQInstanceConfig('qq-1', { enabled: true });
  expect(store.getQQInstanceConfig('qq-1')).toMatchObject({
    appId: '123',
    appSecret: 's1',
    enabled: true,
  });

  expect(store.getQQMultiInstanceConfig().instances).toHaveLength(2);

  store.deleteQQInstance('qq-1');
  expect(store.getQQInstanceConfig('qq-1')).toBe(null);
  expect(store.getQQMultiInstanceConfig().instances).toHaveLength(1);
});

test('IMStore migrates the legacy single WeCom config into a multi-instance record', () => {
  const db = new FakeDb();
  db.seed('wecomOpenClaw', { enabled: true, botId: 'legacy-bot', secret: 'legacy-secret' });

  const store = createStore(db);

  // The single-instance record is replaced by a generated instance, and the
  // legacy key is dropped so the migration cannot run twice.
  expect(db.getValue('wecomOpenClaw')).toBeUndefined();
  expect(store.getWecomInstances()).toHaveLength(1);
  expect(store.getWecomMultiInstanceConfig().instances[0]).toMatchObject({
    enabled: true,
    botId: 'legacy-bot',
    secret: 'legacy-secret',
  });
});

test('IMStore round-trips WeCom instances through wecom:{instanceId} keys', () => {
  const db = new FakeDb();
  const store = createStore(db);

  store.setWecomInstanceConfig('wecom-1', { instanceName: '企微一号', botId: 'b1' });
  expect(store.getWecomInstanceConfig('wecom-1')).toMatchObject({
    instanceId: 'wecom-1',
    instanceName: '企微一号',
    botId: 'b1',
  });
  expect(store.getWecomMultiInstanceConfig().instances).toHaveLength(1);

  store.deleteWecomInstance('wecom-1');
  expect(store.getWecomInstances()).toEqual([]);
});

test('IMStore stores Weixin as a single instance keyed by weixin', () => {
  const db = new FakeDb();
  const store = createStore(db);

  expect(store.getWeixinConfig()).toMatchObject({ enabled: false, accountId: '' });

  store.setWeixinConfig({ enabled: true, accountId: 'wx-account' });

  expect(store.getWeixinConfig()).toMatchObject({ enabled: true, accountId: 'wx-account' });
  expect(store.getConfig().weixin).toMatchObject({ enabled: true, accountId: 'wx-account' });
});

test('IMStore migrates the v1 single-account Email config to multi-instance', () => {
  const db = new FakeDb();
  db.seed('email', { enabled: true, email: 'bot@example.com', password: 'app-password' });

  const store = createStore(db);

  expect(store.getEmailConfig().instances).toHaveLength(1);
  expect(store.getEmailConfig().instances[0]).toMatchObject({
    instanceId: 'email-1',
    instanceName: 'Default',
    enabled: true,
    email: 'bot@example.com',
    password: 'app-password',
  });

  store.setEmailInstanceConfig('email-2', { instanceName: '第二个邮箱', email: 'b@example.com' });
  expect(store.getEmailConfig().instances).toHaveLength(2);

  store.deleteEmailInstance('email-1');
  expect(store.getEmailConfig().instances).toHaveLength(1);
  expect(store.getEmailConfig().instances[0].instanceId).toBe('email-2');
});
