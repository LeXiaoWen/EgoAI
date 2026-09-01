# EgoAI 去账号化实施规划

> 状态：待用户确认后执行。
> 原则：只做删除与装配，不新增业务代码。后端协议字符串值（provider id、HTTP 头、IPC 通道名、域名路径）不改，除非对应功能整体移除。

## 已确认的决策

1. 彻底移除登录与账号体系（本地单用户，无登录）。
2. 模型改为手动配置 provider + API key，不再从服务器拉取模型/配额。
3. 全部移除增值功能（配额 / 积分 / 签到 / 奖励 / 媒体账号）。
4. 完全移除埋点上报。
5. 一并移除语音输入（ASR 依赖账号 token + 远端服务 + 配额）。
6. 移除 GitHub Copilot provider（纯 OAuth，无 API key 方式）。
7. WelcomeDialog 保留条款同意，仅去掉登录等待步骤。
8. SQLite 遗留的登录/token/配额旧记录忽略旧键，不主动删除（保留会话等本地数据）。

## 范围：移除对象

### A. 账号登录体系

| 位置 | 对象 | 处理 |
| --- | --- | --- |
| renderer | `services/auth.ts`（AuthService 全量：login/callback/exchange/token/refresh/profile/quota/credits/dailyCheckIn/finalReward） | 删 |
| renderer | `store/slices/authSlice.ts`（含 UserProfile/UserQuota/CreditItem/ProfileSummary 等类型） | 删 |
| renderer | `components/LoginButton.tsx` | 删 |
| renderer | `components/accountMenuState.ts` | 删 |
| renderer | `components/WelcomeDialog.tsx` | 保留条款同意，剥离登录等待步骤 |
| renderer | `App.tsx` 中 loginPending / auth 启动逻辑 | 改 |
| renderer | `components/Sidebar.tsx` 登录按钮与账号菜单 | 改 |
| renderer | `components/ModelSelector.tsx` 的 auth 依赖 | 改 |
| renderer | `components/library/LibraryView.tsx` / `libraryAnalytics.ts` 的 ownerAccountKey 依赖 | 改 |
| renderer | `services/endpoints.ts` 登录相关 URL（getLoginOvermindUrl/getPortalLoginUrl/getPortalPricingUrl 等） | 删（更新/商店 URL 保留） |
| renderer | `types/electron.d.ts` 中 auth 相关 API 类型 | 改 |
| main | `libs/authCallbackRouter.ts`（深链） | 删 |
| main | `authQuota.ts`（配额门控） | 删 |
| main | `mediaAccountIsolation.ts` | 删 |
| main | `main.ts` 深链 `egoai://` 处理、AuthIpcChannel 注册、onCode、capturePublishingRequest | 改 |
| main | `preload.ts` 的 `auth` 桥接块（exchange/refresh/quota/credits/profile） | 改 |
| shared | `auth/constants.ts`、`auth/accountOwner.ts` | 删 |

### B. 埋点上报

| 位置 | 对象 | 处理 |
| --- | --- | --- |
| shared | `analytics/constants.ts`（全部事件值） | 删 |
| renderer | `services/logReporter.ts`、`services/analyticsIdentity.ts` | 删 |
| renderer | `components/library/libraryAnalytics.ts` | 删 |
| renderer | `services/publishingConversionAttribution.ts` | 删 |
| main | `libs/mainLogReporter.ts` | 删 |
| 全仓 | 各组件中 `reportXxx` / `reportYdAnalyzer` 调用点 | 逐一清理 |

### C. 增值功能

| 位置 | 对象 | 处理 |
| --- | --- | --- |
| renderer | `store/slices/asrQuotaSlice.ts` | 删 |
| main | `ipcHandlers/asr/handlers.ts` | 删 |
| shared | `asr/constants.ts` | 删 |
| renderer | `services/voiceInput/realtimeAsrClient.ts`、`voiceInput/` 相关 hook/状态 | 删 |
| renderer | `components/cowork/voiceInput/`（VoiceInputButton 等）| 删 |
| renderer | `components/cowork/CoworkPromptInput.tsx` 中语音输入挂载 | 改 |
| renderer | `components/CreditsFinalRewardModal.tsx` | 删 |
| renderer | `components/CreditsResetCampaignFloat.tsx` | 删 |
| renderer | `services/useDailyCheckInActivity.ts`、`startupCreditCampaignBridge.ts` | 删 |
| renderer | coworkSlice / AssistantTurnBlock 等引用上述切片处 | 改 |

### D. Provider 层

| 位置 | 对象 | 处理 |
| --- | --- | --- |
| shared | `providers/constants.ts` 中 Copilot provider 条目 | 删 |
| main | `libs/githubCopilotAuth.ts` | 删 |
| renderer | `ModelSettingsSection.tsx` 中 minimax/openai/xai 的 OAuth 模式 UI 与状态 | 删（仅保留手动 key） |
| main | preload / ipcHandlers 中 `openai-codex-oauth:*`、`xai-oauth:*`、minimax OAuth 相关 | 删 |
| renderer | `auth.ts` 中 `loadServerModels` / `requestServerModels` 服务端模型拉取路径 | 删 |
| renderer | `modelSlice.ts` 中 `setServerModels` / `isServerModel` / EgoaiServer provider 相关路径 | 改（模型仅来自手动配置） |

## 范围：保留对象

- 手动配置 provider + API key 的完整路径（ProviderName 其余条目、`providerRequiresApiKey`、apiKeyUrl、defaultModels、ModelSettingsSection 的 key 表单、openclawConfigSync 的 provider 同步）。
- 模型自配（用户自定义模型增删）。
- Library 本地工件库（去掉 ownerAccountKey 依赖后保留）。
- 更新检查（`appUpdateUrlPolicy.ts` 不依赖登录，保留）。
- MCP、Skills、Kits、Skin、Plugins、Artifacts、Cowork、Multi-Agent、computerUse、权限。
- 后端协议字符串值：`lobsterai-server` 等 provider id、`X-LobsterAI-*` 头、`X-LobsterAI-Client-Version` 等（保留功能走网关时仍用）；埋点事件值属 B 类整体移除，随 analytics 常量删除。

## 数据 / 迁移

- `egoai.sqlite`：无登录后不再写入 token；遗留的 auth/credits 相关 kv 记录**忽略旧键**，不主动删除、不做兼容读取（保留会话等本地数据）。
- localStorage：旧登录态键随 authSlice 移除自然失效，不主动清理。
- 旧深链 `egoai://` 登录回调不再处理（authCallbackRouter 删除）。

## 执行顺序（编译 + 测试驱动）

1. **清理引用最少的叶子**：删除 shared 常量（`auth/`、`analytics/`、`asr/`）→ 编译暴露全部调用点。
2. **删除 main 侧**：githubCopilotAuth、authCallbackRouter、authQuota、mediaAccountIsolation、asr handlers、mainLogReporter → 修 main.ts / preload.ts / ipcHandlers 引用。
3. **删除 renderer 侧**：auth.ts / authSlice / logReporter / analyticsIdentity / asr 相关 / credits 组件 / LoginButton / accountMenuState → 修 App / Sidebar / ModelSelector / Settings / CoworkPromptInput 等引用。
4. **改造保留路径**：ModelSettingsSection 去 OAuth、modelSlice 去服务端模型、WelcomeDialog 去登录门控、LibraryView 去 ownerAccountKey。
5. **清理埋点调用点**：全仓 `reportXxx` / `reportYdAnalyzer` 逐一移除。
6. **全量验证**。

## 验证

1. 编译：`npm run compile:electron` + `npx tsc --noEmit -p tsconfig.json` 零错误。
2. 测试：`npm test` 全绿（删除相关测试文件或改为覆盖新行为）。
3. 启动：`unset ELECTRON_RUN_AS_NODE; export PATH="$HOME/.local/bin:$PATH"; npm run electron:dev`。
   - 无登录按钮、无账号菜单、无语音输入按钮。
   - 设置中手动配置 provider + key 后，模型列表出现自配模型并可发起会话。
   - 更新检查、MCP、Skills、Kits、Skin、Plugins、Artifacts 正常。
4. 抽查：`rg -n "isLoggedIn|loadServerModels|dailyCheckIn|reportYdAnalyzer|CreditsFinalReward" src/` 无残留（仅测试 fixture 例外）。

## 风险

- **auth 消费面广**：`isAuthenticated` / `ownerAccountKey` 被 App/Sidebar/Library/ModelSelector 等引用，删除切片后需逐一改到固定值（如 `isAuthenticated: false` 场景直接移除分支）。
- **模型不可用**：服务端模型拉取移除后，未配置 provider+key 的安装没有模型可用——需确保设置页能引导手动配置（保留现有 ModelSettingsSection 手动路径即可，不新增引导页）。
- **OAuth 移除面**：minimax/openai/xai/copilot 的 OAuth 分布在 preload、ipcHandlers、ModelSettingsSection、coworkSlice 多处，需一次性清完，避免残留半套。
- **测试 fixture**：若干测试断言登录/配额行为，删除功能时同步更新或删除，保持 `npm test` 绿。
