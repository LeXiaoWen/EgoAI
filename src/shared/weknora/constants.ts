export const WeknoraIpcChannel = {
  GetWebUrl: 'weknora:getWebUrl',
} as const;
export type WeknoraIpcChannel = typeof WeknoraIpcChannel[keyof typeof WeknoraIpcChannel];
