# EgoAI 本地多档案（Profile）实施规划

> 状态：方案设计，待确认后实施。
> 日期：2026-09-02。
> 背景：在「去账号化（无云）」既定方向下，用户确认重新引入**本地档案**做多用户区分——不是回到云账号，而是把「本地单用户」升级为「本地多档案」。

## 已确认的决策

1. **形态**：本地档案（Profile）+ 可选密码。纯本地、无云、无登录、无埋点、无找回；密码用本地哈希（scrypt）存储，仅做「同 OS 账号下防他人误入」的轻量鉴权。
2. **隔离**：全隔离。模型配置、知识库、身份/记忆、会话历史、Agent/工作区，全部随档案独立。
3. **方向延续**：去账号化保下来的成果（无云、手动 provider+key、数据不出机、无配额/积分/埋点）全部继承，仅把「全局一份数据」改为「每档案一份数据」。

## 与「去账号化」的关系（关键澄清）

- 上一轮 `account-removal-plan.md` 砍的是**云账号（Account）**：登录/配额/积分/签到/埋点/服务端模型。此决策**不推翻**，仍全部保留。
- 本轮新增的是**本地档案（Profile）**：同一台机器里区分「这是谁、用哪套模型、看哪个知识库」。两者正交，不冲突。
- 因此规划文档 §1.1 标题由「去账号化」修订为「去云账号化 + 本地多档案」。

## 为何不复用现有账号体系（决策论证）

调研结论：LobsterAI 与 WeKnora 都带账号体系，但都不适合直接复用来做本地多档案，最终采用「目录物理隔离」而非「迁移账号体系」。

### LobsterAI 账号：不可复用

是**云账号**（OAuth 登录 + token 交换 + 服务端 user + 配额 + 埋点），「用户区分」发生在服务端，本地没有多档案机制。复用 = 回到云账号 = 推翻「去云账号化」，方向相反。

### WeKnora 租户：只能覆盖「知识库 + 模型」这一半

WeKnora 确为完整多租户（`model.go:119`、`knowledgebase.go:71` 等模型全带 `TenantID`，`user.go` 有 `Memberships`/`LastActiveTenantID`），但只能隔离 WeKnora 自己库里的数据：

| 要隔离的数据 | 所在系统 | tenant 能否覆盖 |
|---|---|---|
| 知识库 / 文档 / 检索 | WeKnora | ✅ |
| 模型配置 | WeKnora `models` 表 | ✅ |
| 会话历史 | EgoAI SQLite | ❌ |
| 记忆 / 身份 | EgoAI OpenClaw | ❌ |
| Agent / 工作区 | EgoAI OpenClaw | ❌ |

「agent 的记录」（会话 + 记忆）正是后三行，租户覆盖不了。

### lite 模式复用 tenant 的成本不低

- `auto-setup` 只自动建「一个 admin + 一个个人租户」；建第二个租户需显式 `POST /tenants`，该端点 capability 为 `system_tenants_manage`（platform 级 key），要先额外拿 platform key。
- 每档案一个租户级 API key，切档案 = 换 key 重连 MCP + 按租户重跑模型注入。
- 逻辑隔离（一个 db 内靠 tenant_id 区分）漏传就串数据；文件系统物理隔离天然不串。

### 结论

物理隔离用文件系统的免费隔离能力，无需任何租户创建 / key 管理 / 按租户注入逻辑；且 EgoAI 侧「会话 / 记忆 / Agent」隔离无论哪种方案都必须自己写路径路由。故采用目录物理隔离 + profileManager 路径路由，不复用任何一方账号体系。

## 数据目录结构

### 现状（单用户，全局一份）

```
userData/
  <应用 SQLite>（会话 / 配置 / agents / mcp / kv）
  openclaw/       （gateway state、workspace、memory）
  weknora/        （weknora.db、.env.lite、secrets.json）
```

### 目标（多档案，每档案一份）

```
userData/
  profiles.json                ← 全局（不属于任何档案）：档案列表 + 当前激活档案 id
  profiles/
    <profileId>/
      <应用 SQLite>            ← 会话 / 配置 / agents / mcp / kv（每档案独立）
      openclaw/                ← gateway state、workspace、memory
      weknora/                 ← weknora.db、.env.lite
      secrets.json             ← weknora tenant API key（每档案独立，0600）
```

`profiles.json` 是唯一跨档案的「全局元数据」，只存档案清单（id / 名称 / 头像 / 密码哈希 / 最后激活时间 / 当前激活 id），不含业务数据。

## 实现方案

### 1. profileManager（main 进程胶水，核心新增）

新增 `src/main/libs/profileManager.ts`，作为**数据目录的唯一路由点**：

- `getActiveProfileId()` / `getActiveProfileDir()`：所有数据路径消费者（sqliteStore、openclawEngineManager、weknoraManager、secrets 读写）从它取路径，替代直接 `app.getPath('userData')`。
- 档案 CRUD：`listProfiles()` / `createProfile(name)` / `renameProfile()` / `deleteProfile()` / `setActiveProfile(id)`。
- 密码：`setProfilePin(id, pin)` / `verifyProfilePin(id, pin)`（scrypt 哈希，存 profiles.json；无找回，忘记 = 清空该档案数据）。
- 迁移：`ensureMigratedFromSingleUser()` —— 检测到旧「单用户布局」且无 profiles.json 时，创建 `default` 档案并把旧数据迁入（见 §5）。

### 2. 启动流程

1. 读 `profiles.json`：
   - 无档案 → 首次引导：创建第一个档案（可选「导入现有单用户数据」）。
   - 有档案 → 进入「档案选择」或直接用「最后激活档案」。
2. 选中档案后：若该档案设了密码，先验证 PIN。
3. 以 `profiles/<id>/` 为数据目录，初始化 SQLite → weknora-lite → OpenClaw gateway（流程不变，仅路径参数化）。

### 3. 切换流程（全隔离 → 需重启引擎）

全隔离意味着「模型/知识库/记忆/会话」都换，切换不能热更，等价于「换一份数据重启」。编排如下：

```
1. 锁 UI（切换期间禁用操作，显示进度）
2. stop OpenClaw gateway
3. stop weknora-lite（+ docreader）
4. 关闭当前 SQLite 连接
5. 更新 profiles.json 的 activeProfileId
6. 打开新档案 SQLite
7. 启动 weknora-lite → ensureMCPApiKey + 模型注入（新档案，见 §6）
8. 启动 OpenClaw gateway → 同步 config（新档案的模型/agent/mcp）
9. 解锁 UI
```

**成本**：OpenClaw gateway 冷启约 10s，切换档案有可见等待，属全隔离的必然代价，UI 需给进度反馈。

### 4. 路径改造点（胶水，改动量小但分散）

| 模块 | 现状 | 改动 |
|---|---|---|
| `sqliteStore.ts` | `app.getPath('userData')/<sqlite>` | 改为 `getActiveProfileDir()/<sqlite>` |
| `openclawEngineManager.ts` | `userData/openclaw` | 改为 `getActiveProfileDir()/openclaw` |
| `weknoraManager.ts` | `userData/weknora` | 改为 `getActiveProfileDir()/weknora` |
| secrets 读写 | `userData/secrets.json` | 改为 `getActiveProfileDir()/secrets.json` |
| `mcpRuntime.ts` resolveWeknoraMcpServer | 静态 env | 切档案后重新 resolve（WEKNORA_BASE_URL / WEKNORA_API_KEY 随档案变） |

均是把「全局 userData」换成「活动档案目录」的参数化，无新业务逻辑。

### 5. 迁移（老用户无感升级）

- 检测到 `userData/<旧 sqlite>` 存在且无 `profiles.json` → 自动创建 `default` 档案，把旧 sqlite / openclaw / weknora / secrets 迁入 `profiles/default/`。
- 迁移只做一次，`profiles.json` 落盘后不再触发。旧键沿用去账号化原则：不主动删、不兼容读。

### 6. 与 WeKnora 融合的联动

每档案独立 weknora.db / secrets.json / 模型配置，因此**切档案后须重跑**：
- `ensureMCPApiKey()`：新档案的 weknora tenant 用新 API key（probe + 重建）。
- `weknoraModelSync`：把新档案的 chat/embedding/rerank 配置重新注入 WeKnora。
- 模型配置来源从「全局 app_config」改为「当前档案的 app_config」。

这正是融合计划「模型统一（EgoAI 是唯一配置入口）」在档案维度上的自然展开：每个档案有自己的唯一配置入口。

## 前端 UI（装配，允许新写，zh/en 双语）

### 关键澄清：档案选择页（Profile Picker）≠ 登录页

不是「登录 UI」。本地档案对应的界面是**档案选择页**，本质是「选一个本地数据目录进去」，无联网、无鉴权服务端。它**没有**：账号密码（只有可选 PIN）、注册/找回、第三方 OAuth、联网验证、服务端错误态。只含：本地档案列表（头像 + 名字）+ 可选 PIN 输入框 + 「新建档案」按钮。

### 智能跳过策略（采用形态 B）

| 形态 | 表现 |
|---|---|
| A. 始终显示选择页 | 启动永远先出档案列表（类 Windows 多用户登录屏） |
| **B. 智能跳过（采用）** | 单档案且无 PIN → 直接进，零界面；多档案或有 PIN → 才出选择页 |
| C. 无启动页 | 启动永远进「上次档案」，切档案走设置菜单弹窗 |

采用 **B**：默认单用户无 PIN 时与现状完全一致（直接进），仅当「有第二个档案」或「档案设了 PIN」时才停下来让用户选/解锁。

### 界面清单

- **档案选择/启动页**：智能跳过；无档案 → 新建引导；有档案 → 列表选择（含「记住上次」、PIN 输入）。
- **设置 → 档案管理**：新建 / 重命名 / 删除 / 切换 / 设置 PIN / 改 PIN。
- **切换入口**：主界面显式「切换档案」按钮（触发「切换流程」编排，带进度）。
- 全部走 `contextBridge` 暴露的 profile IPC，复用现有安全模型。

## 实施顺序（每步可独立验证）

1. **写 `profileManager.ts` 数据层 + profiles.json**（纯函数，可单测，不碰现有代码）。
2. **改 4 处路径消费者 + 迁移逻辑** → 编译 + 旧数据启动，确认迁入 `default` 档案后功能不变。
3. **切换编排**（stop/start 接线）→ 建两个档案，验证切换后数据隔离。
4. **前端档案 UI**（选择页 + 管理 + 切换）→ `electron:dev` 全流程验证。
5. **PIN 密码**（scrypt + 验证门控，独立可最后做）。

> 顺序决策：去账号化（§1.1）与档案改造都要动 `sqliteStore.ts` / `preload.ts` / `App.tsx` 的启动流程，建议**合并实施**——一次把「云账号删除 + 数据目录档案化」的路径改造做完，再单独做前端。

## 工作量与风险

| 项 | 量级 | 说明 |
|---|---|---|
| profileManager + 路径参数化 | 中（胶水） | 核心新增，但无业务逻辑 |
| 切换编排（stop/start） | 中（胶水） | 复用现有引擎 stop/start |
| 迁移 | 小（胶水） | 一次性 |
| 前端档案 UI | 中（装配） | 选择页 + 设置管理 + 切换 |

**风险**：

1. **切换成本**：全隔离 → 切档案 = 重启所有引擎（~10s+），体验有等待，须进度提示。若不可接受，可降级为「数据隔离」档（会话/Agent 共享、少重启），但这是已确认「全隔离」的代价。
2. **进程残留**：切档案必须保证旧 weknora-lite / openclaw / docreader 完全退出，否则占端口/内存（复用现有 stop 逻辑 + 超时兜底）。
3. **密码无找回**：纯本地、无云，忘记 PIN 只能清空该档案数据重建，UI 需明示。
4. **路径改造遗漏**：任何仍直接读 `userData` 根路径的模块会读到「全局」而非「档案」数据——实施后需 `rg "getPath('userData')"` 全量清点。
5. **全隔离的初始化成本**：每个新档案都要重新配模型、重建知识库、重新积累记忆，是新档案的固有成本（用户已确认接受）。
6. **i18n**：档案 UI 全部 zh/en 双语（CLAUDE.md 硬性要求）。

## 验证

1. 编译 + 测试：`npm run compile:electron`、`npx tsc --noEmit`、`npm test` 全绿。
2. 迁移：带旧单用户数据启动 → 自动生成 `default` 档案，会话/记忆/知识库不丢。
3. 多档案：建 A、B 两档案，分别配不同模型/建不同知识库/产生不同记忆 → 切换后互不可见。
4. PIN：设 PIN 的档案启动需验证；忘 PIN 场景有「清空重建」路径。
5. WeKnora 联动：A 档案的知识库与 B 档案隔离，各自 MCP 检索互不串；切档案后模型正确重注入。
