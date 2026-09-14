/**
 * IPC channel names for the IM (instant messaging) subsystem.
 *
 * Four channels are supported: weixin, wecom, qq and email. All of them run
 * inside the OpenClaw gateway, so the main-process handlers here only persist
 * local IM config, drive OpenClaw config sync, and relay OpenClaw gateway
 * state to the renderer. There is no in-process chat gateway.
 *
 * `StatusChange` and `MessageReceived` are main-to-renderer push events; the
 * rest are `invoke` channels.
 */
export const ImIpcChannel = {
  GetConfig: 'im:config:get',
  SetConfig: 'im:config:set',
  SyncConfig: 'im:config:sync',

  StartGateway: 'im:gateway:start',
  StopGateway: 'im:gateway:stop',
  TestGateway: 'im:gateway:test',

  GetStatus: 'im:status:get',
  StatusChange: 'im:status:change',
  MessageReceived: 'im:message:received',

  GetLocalIp: 'im:getLocalIp',

  WeixinQrLoginStart: 'im:weixin:qr-login-start',
  WeixinQrLoginWait: 'im:weixin:qr-login-wait',

  ListPairingRequests: 'im:pairing:list',
  ApprovePairingCode: 'im:pairing:approve',
  RejectPairingCode: 'im:pairing:reject',

  AddWecomInstance: 'im:wecom:instance:add',
  DeleteWecomInstance: 'im:wecom:instance:delete',
  SetWecomInstanceConfig: 'im:wecom:instance:config:set',

  AddQQInstance: 'im:qq:instance:add',
  DeleteQQInstance: 'im:qq:instance:delete',
  SetQQInstanceConfig: 'im:qq:instance:config:set',

  AddEmailInstance: 'im:email:instance:add',
  DeleteEmailInstance: 'im:email:instance:delete',
  SetEmailInstanceConfig: 'im:email:instance:config:set',
} as const;

export type ImIpcChannel = typeof ImIpcChannel[keyof typeof ImIpcChannel];
