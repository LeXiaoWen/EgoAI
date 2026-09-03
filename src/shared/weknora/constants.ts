export const WeknoraIpcChannel = {
  GetWebUrl: 'weknora:getWebUrl',
  KbList: 'weknora:kbList',
  KbCreate: 'weknora:kbCreate',
  KbDelete: 'weknora:kbDelete',
  DocList: 'weknora:docList',
  DocGet: 'weknora:docGet',
  DocDelete: 'weknora:docDelete',
  DocUpload: 'weknora:docUpload',
  SearchHybrid: 'weknora:searchHybrid',
  OpenFile: 'weknora:openFile',
} as const;
export type WeknoraIpcChannel = typeof WeknoraIpcChannel[keyof typeof WeknoraIpcChannel];
