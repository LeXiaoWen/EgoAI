/**
 * IM Slice
 * Redux slice for IM gateway state management
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import type {
  EmailInstanceConfig,
  IMGatewayConfig,
  IMGatewayStatus,
  QQInstanceConfig,
  QQOpenClawConfig,
  WecomInstanceConfig,
  WecomOpenClawConfig,
  WeixinOpenClawConfig,
} from '../../types/im';
import {
  DEFAULT_IM_CONFIG,
  DEFAULT_IM_STATUS,
} from '../../types/im';

export interface IMState {
  config: IMGatewayConfig;
  status: IMGatewayStatus;
  isLoading: boolean;
  error: string | null;
}

const initialState: IMState = {
  config: DEFAULT_IM_CONFIG,
  status: DEFAULT_IM_STATUS,
  isLoading: false,
  error: null,
};

const imSlice = createSlice({
  name: 'im',
  initialState,
  reducers: {
    setConfig: (state, action: PayloadAction<IMGatewayConfig>) => {
      state.config = action.payload;
    },
    /** @deprecated Use setQQInstanceConfig instead */
    setQQConfig: (state, action: PayloadAction<Partial<QQOpenClawConfig>>) => {
      // Backward compat: update first instance if exists
      const first = state.config.qq.instances[0];
      if (first) {
        Object.assign(first, action.payload);
      }
    },
    setQQInstanceConfig: (state, action: PayloadAction<{ instanceId: string; config: Partial<QQOpenClawConfig> }>) => {
      const inst = state.config.qq.instances.find(i => i.instanceId === action.payload.instanceId);
      if (inst) Object.assign(inst, action.payload.config);
    },
    addQQInstance: (state, action: PayloadAction<QQInstanceConfig>) => {
      state.config.qq.instances.push(action.payload);
    },
    removeQQInstance: (state, action: PayloadAction<string>) => {
      state.config.qq.instances = state.config.qq.instances.filter(
        i => i.instanceId !== action.payload
      );
    },
    /** @deprecated Use setWecomInstanceConfig instead */
    setWecomConfig: (state, action: PayloadAction<Partial<WecomOpenClawConfig>>) => {
      // Backward compat: update first instance if exists
      const first = state.config.wecom.instances[0];
      if (first) {
        Object.assign(first, action.payload);
      }
    },
    setWecomInstanceConfig: (state, action: PayloadAction<{ instanceId: string; config: Partial<WecomOpenClawConfig> }>) => {
      const inst = state.config.wecom.instances.find(i => i.instanceId === action.payload.instanceId);
      if (inst) Object.assign(inst, action.payload.config);
    },
    addWecomInstance: (state, action: PayloadAction<WecomInstanceConfig>) => {
      state.config.wecom.instances.push(action.payload);
    },
    removeWecomInstance: (state, action: PayloadAction<string>) => {
      state.config.wecom.instances = state.config.wecom.instances.filter(
        i => i.instanceId !== action.payload
      );
    },
    setWeixinConfig: (state, action: PayloadAction<Partial<WeixinOpenClawConfig>>) => {
      state.config.weixin = { ...state.config.weixin, ...action.payload };
    },
    setEmailInstanceConfig: (state, action: PayloadAction<{ instanceId: string; config: Partial<EmailInstanceConfig> }>) => {
      const inst = state.config.email.instances.find(i => i.instanceId === action.payload.instanceId);
      if (inst) Object.assign(inst, action.payload.config);
    },
    addEmailInstance: (state, action: PayloadAction<EmailInstanceConfig>) => {
      state.config.email.instances.push(action.payload);
    },
    removeEmailInstance: (state, action: PayloadAction<string>) => {
      state.config.email.instances = state.config.email.instances.filter(
        i => i.instanceId !== action.payload,
      );
    },
    setStatus: (state, action: PayloadAction<IMGatewayStatus>) => {
      state.status = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setConfig,
  setQQConfig,
  setQQInstanceConfig,
  addQQInstance,
  removeQQInstance,
  setWecomConfig,
  setWecomInstanceConfig,
  addWecomInstance,
  removeWecomInstance,
  setWeixinConfig,
  setEmailInstanceConfig,
  addEmailInstance,
  removeEmailInstance,
  setStatus,
  setLoading,
  setError,
  clearError,
} = imSlice.actions;

export default imSlice.reducer;
