# EgoAI × WeKnora 深度融合计划

> 规划日期：2026-09-02
> 前置：WeKnora 已完成「最小可验证骨架」接入（`weknoraManager.ts` 拉起 weknora-lite、`knowledge` 侧边栏入口 + webview、`weknora` 内置 MCP server）。
> 目标：把 WeKnora **从「并列的独立应用」变成「EgoAI 的三块能力」**，分别融进 EgoAI 已有的对话、侧边栏、Agent 三个支柱。用户视角只有一个系统。
> 核心原则（延续《通用桌面Agent整合规划.md》）：**后端业务逻辑零新增**——WeKnora / OpenClaw 引擎及其业务逻辑一律复用、不改动；**前端 UI 属「装配」，允许新写**（知识库原生视图、模型配置区、预设 Agent 文案）；main 进程仅允许「胶水」代码（进程拉起、配置注册、REST 注入、IPC 接线、鉴权探活、docreader 拉起）。

---

## 1. 现状诊断：五个割裂点

| # | 割裂点 | 现状 | 用户感知 |
|---|---|---|---|
| 1 | **模型割裂** | EgoAI 配 chat 模型（19 provider）+ 孤岛 embedding（记忆用，硬编码 5 provider）；WeKnora 界面另配 chat/embedding/rerank 三套模型 | 「我配了两遍模型」 |
| 2 | **身份割裂** | WeKnora lite 前端自动登录无感知，但 MCP 检索线需要 tenant API key（默认不自动生成），EgoAI 侧未处理 | 首次用知识库可能撞 401 / 租户概念 |
| 3 | **操作割裂** | 文档要进知识库得去 webview 单独上传；Agent 会话的产物/附件进不了知识库；检索结果无引用溯源 | 「知识库和对话是两回事」 |
| 4 | **体验割裂** | 知识库是 Vue/TDesign 风格 webview，EgoAI 是 React/Tailwind 风格 | 「切换像打开另一个 app」 |
| 5 | **生命周期割裂** | weknora-lite / docreader / Ollama 各自拉起，无统一状态面板与首次初始化引导 | 「不知道哪一步没配好」 |

---

## 2. 融合蓝图：两层结构

融合分**两层**：地基层（用户看不见但必需）+ 触点层（用户摸得到）。触点层全部依赖地基层，顺序上先地基后触点。

```
触点层（用户可感知）              地基层（用户不可见但必需）
┌──────────────────────────┐    ┌───────────────────────────────┐
│ 触点1 对话：能问知识库+引用  │    │ ② 身份统一：租户/API key 无感知 │
│ 触点2 入口：原生知识库视图   │ ←依赖│ ① 模型统一：三类模型注入       │
│ 触点3 智能体：知识库问答预设  │    │（没地基，三个触点全部瘫痪）      │
└──────────────────────────┘    └───────────────────────────────┘
```

| 统一 | 目标 | 已确认决策 |
|---|---|---|
| ① 模型统一（地基） | EgoAI 是**唯一**模型配置入口，chat/embedding/rerank 三类模型经 WeKnora REST API 注入 | ✅ EgoAI 注入 WeKnora |
| ② 身份统一（地基） | 租户/API key 对用户完全透明，EgoAI 自动创建并注入 | ✅ 本轮落地 |
| ③ 对话集成（触点） | WeKnora 对话融进 Cowork 对话：OpenClaw 生成回答 + MCP 检索 + 引用溯源 | ✅ 路线 A（见 §4.1） |
| ④ 入口原生化（触点） | 知识库入口在左侧，内容用 EgoAI 原生 React，webview 只留高级管理 | ✅ 关键操作原生化 |
| ⑤ 智能体嵌入（触点） | WeKnora Agent 能力融进 EgoAI Agent 体系（主 Agent 自动判断 + 专属预设） | ✅ 乙为主 + 甲补充（见 §4.3） |
| ⑥ 生命周期统一 | 统一「知识库引擎」状态面板 + 首次初始化引导（Ollama 检测、模型引导） | 后续阶段 |

---

## 3. 地基层方案（本轮落地：认证无感知 + 模型统一）

### 3.1 认证无感知（② 身份统一）

**目标**：用户进知识库（webview 线）与 Agent 检索（MCP 线）都无感知 WeKnora 的租户/API key。

**已确认的机制事实**（WeKnora v0.7.2 源码）：
- lite 版前端 `POST /auth/auto-setup` 透明自动登录（`internal/handler/auth.go:860`）：首次自动建 `admin@weknora.local` 用户 + 个人租户，返回 JWT + `TenantID`（`Memberships[0].TenantID`，Role=Owner）。
- `auto-setup` 响应**不含 API key**；`WEKNORA_TENANT_AUTO_CREATE_API_KEY` 自动下发只挂在 `TenantHandler.CreateTenant`（handler 层），auto-setup 走 `userService.Register`（service 层），**不会触发**。
- MCP server 只用 `X-API-Key`，未设 key 时 `/knowledge-bases`、`/models` 等端点 401。

**方案（胶水，扩展 `weknoraManager.ts`）**：
1. `doStart()` 中 weknora-lite ready 后新增 `ensureMCPApiKey()`：`secrets.json` 已有 `weknoraApiKey` 则复用；否则 `auto-setup` 拿 JWT+TenantID → `POST /tenants/{id}/api-keys`（full_access）拿明文 token → 写入 `secrets.json`（0600）。
2. **鉴权探活（防孤儿 key）**：启动时用 `WEKNORA_API_KEY` probe 一个需鉴权端点（如 `GET /knowledge-bases`）；返回 401 则视为 key 失效/租户重建，走步骤 1 重建 key。覆盖「用户在 webview 删了 key」和「`weknora.db` 被清空重建」两种静默失效场景。
3. `resolveWeknoraMcpServer()`（`mcpRuntime.ts`）env 增补 `WEKNORA_API_KEY`。
4. webview 线无需改（前端自己 auto-setup）。

### 3.2 模型统一（① 模型统一）

**已确认事实**：
- WeKnora 模型类型 `KnowledgeQA`/`Embedding`/`Rerank`（`internal/types/model.go`），存 `models` 表，`parameters` JSON（api_key 落库 AES-GCM 加密）。
- 默认无内置模型；可完全通过 `POST/PUT/DELETE /models` REST 增删改。
- Ollama = `source=local`（chat + embedding，**rerank 不支持**）；任意 OpenAI 兼容端点 = `source=remote` + `provider=generic`。
- **⚠️ Ollama 不支持 rerank** → 纯本地默认「禁用 rerank」（检索仍走 hybrid，仅少精排），要更高精度才配在线 rerank API。

**方案**：
- **(A) EgoAI 新增「知识库模型」配置**：chat 复用现有 provider；embedding/rerank 独立新增（`source` + `provider` + `model` + `baseUrl` + `apiKey` + rerank 的 `enabled`）。默认 `Ollama + bge-m3`，rerank `enabled=false`。存 `app_config.knowledgeBaseModels`，与记忆 embedding（`cowork_config`）分离（语义不同）。
- **(B) 注入胶水（新增 `weknoraModelSync.ts`）**：weknora-lite ready + 有 API key 后，读 EgoAI 三类模型配置 → 映射为 WeKnora `parameters` → `GET /models` 比对 → `POST/PUT /models` upsert（以「模型名+type」为稳定标识）。rerank 禁用则不建/删 rerank 模型。配置变更时重新同步（复用 `classifyAppConfigChange` 触发模式）。
- **(C) 关联到知识库**：首次建库时把 `EmbeddingModelID` 设为默认 embedding、`SummaryModelID` 设为默认 chat，并把租户级 `RetrievalConfig.RerankModelID` 设为默认 rerank（三类模型分别落在 KB 与租户配置上），并入「④ 入口原生化」的建库流程。

**阶段 1 spike 结论（2026-09-02 已钉死，源码确认）**：

1. **ModelType 枚举串**：`Embedding` / `Rerank` / `KnowledgeQA` / `VLLM` / `ASR`（[model.go:17-23](WeKnora/internal/types/model.go#L17-L23)）。
2. **parameters JSON 字段**：`base_url` / `api_key` / `interface_type` / `embedding_parameters` / `parameter_size` / `provider` / `extra_config` / `custom_headers` / `supports_vision` / `max_concurrency` / `app_id` / `app_secret`。`provider` 取 `local`（Ollama）或 `remote` + `provider=generic`。
3. **模型 upsert 稳定标识**：主键是 `ID`（varchar64），`name` **无唯一约束**，`POST /models` **不查重**（不自传 ID 则每次新 UUID）。但 `Model.ID` **可自定义**（`BeforeCreate` 仅 ID 空时才生成 UUID）→ 注入时自传稳定 ID（如 `egoai-emb-bge-m3`），先 `GET /models` 判断存在与否，存在则 `PUT`、不存在则 `POST`（带稳定 ID），避免重复建。
4. **api_key 更新语义**：`PUT /models` **不接受 api_key**（handler 强制保留旧值、忽略请求体，[model.go:597-614](WeKnora/internal/handler/model.go#L597-L614)）；改 key 走 `PUT /models/:id/credentials`（`api_key` 传非空才更新）。`POST /models` 可带 `parameters.api_key`（AES-GCM 加密落库）。
5. **hybrid_search 来源元数据**：✅ **含完整来源元数据**（`SearchResult` 含 `KnowledgeTitle` / `KnowledgeFilename` / `KnowledgeSource` / `KnowledgeID` / `ChunkIndex` / `StartAt` / `EndAt` / `KnowledgeBaseID`，[search.go:150-227](WeKnora/internal/types/search.go#L150-L227)），REST 直接透传 → 引用溯源可走远（带编号 + 跳转）。
6. **KB 模型关联字段（纠正原假设）**：KB 只有 `EmbeddingModelID` + `SummaryModelID`（[knowledgebase.go:83-85](WeKnora/internal/types/knowledgebase.go#L83-L85)）；**rerank 在租户级 `RetrievalConfig.RerankModelID`**（`/tenants/kv/retrieval-config`，[retrieval_config.go:26](WeKnora/internal/types/retrieval_config.go#L26)）；chat（KnowledgeQA）不在 KB 上。**无 `LLMModelID` / KB 级 `RerankModelID`**。

---

## 4. 触点层方案（完整规划，分批落地）

### 4.1 触点 1：对话集成（③）

**路线 A（唯一合理）**：OpenClaw Agent 生成回答，weknora MCP `hybrid_search` 检索知识库作为上下文。WeKnora 退化为「检索后端」，不搬它的 chat/agent_chat 引擎（那会丢掉 EgoAI 对话的技能/artifacts/子代理/权限）。

**引用溯源分两步**：
- **第一批（低成本）**：复用现有 `ToolCallGroup.tsx` 展示 `hybrid_search` 工具调用 + 检索结果折叠摘要（命中 chunk 数量、来源文档名）。零新组件，仅调工具结果显示逻辑。
- **后续（中成本）**：回答内引用标记 `[1][2]` + 点击跳转对应文档。需要检索结果带稳定 chunk 来源元数据 + Agent 系统提示「回答带来源编号」+ UI 渲染引用锚点。

**触发判断**：落在地基层之外的 prompt 设计（见 4.3）。

### 4.2 触点 2：入口原生化（④）

**完整原生操作清单**（用 EgoAI React + Tailwind 重写，经 weknora REST API 读写）：

| 批次 | 操作 | 说明 |
|---|---|---|
| **第一批（先做）** | 上传文档、建库、文档列表、检索预览 | 高频核心操作，替代 webview 里的对应功能 |
| 第二批 | chunk 细粒度编辑、FAQ 批量导入 | 中频 |
| 第三批（fallback webview） | wiki 编辑、评测、模型高级配置 | 低频/复杂，保留 webview |

**数据通道**：新增 main 进程「weknora REST 代理」IPC（renderer → preload → main → weknora-lite REST），复用现有 IPC 分组模式（`ipcHandlers/`）。webview 作为「高级管理兜底」保留。

### 4.3 触点 3：智能体嵌入（⑤）

**甲为主保底 + 乙渐进**（避免把体验赌在 prompt 自动判断上）：

- **甲（专属预设 Agent，第一版主形态）**：`presetAgents.ts` 加一条「知识库问答」预设（仿 bid-designer），身份/系统提示聚焦「知识库检索问答 + 回答带来源」。给用户一个显式的「知识库模式」入口，行为可控。成本约 0.1 人天。
- **乙（主 Agent 自动判断，渐进增强）**：weknora MCP 已全局内置，主 Agent 天然可见 `hybrid_search`/`list_knowledge_bases` 工具。通过系统提示/工具描述引导「问题涉及本地文档时优先检索」，但**需实测迭代**（易过度触发/欠触发），作为甲的增强而非唯一路径。

---

## 5. 分阶段实施

| 阶段 | 内容 | 用户可感知收益 | 验收标准 |
|---|---|---|---|
| **阶段 1（地基层 + 可见锚点）** | ② 认证无感知 + ① 模型统一 + **可见锚点**：主 Agent 问一次知识库、`ToolCallGroup` 展示检索结果 | 不再「配两套模型」、不撞租户/401；对话里第一次能问知识库 | 重启后 MCP 仍能检索；模型已注入可检索；主 Agent 问库返回结果 |
| **阶段 2（触点第一批 + docreader 最小拉起）** | **docreader 最小拉起**（上传文档强依赖）+ ⑤ 智能体（甲预设为主 + 乙 prompt 渐进）+ ④ 入口第一批原生操作（上传/建库/文档列表/检索预览） | 对话能问库看引用；左侧原生视图能上传建库；有「知识库问答」Agent | 原生视图能上传 PDF 并解析入库；对话问库带引用；预设 Agent 可用 |
| **阶段 3（触点完善）** | 引用标记跳转、入口第二批原生操作、⑥ 生命周期统一（状态面板 + Ollama/首次初始化引导）、Python 依赖检测 | 引用可跳转、状态可见、引导完善 | 引用可跳转；状态面板可见三进程健康 |
| **阶段 4（分发）** | electron-builder `extraResources`、获取产物脚本、PyInstaller 打包 docreader | 可打包分发 | 打包产物可运行知识库全流程 |

---

## 6. 复用映射与胶水代码清单

| 落点 | 复用方式 | 是否新写代码 |
|---|---|---|
| WeKnora `auto-setup` / `/tenants/:id/api-keys` / `/models` REST | 原样调用 | 否 |
| WeKnora mcp-server `WEKNORA_API_KEY` | 原样 | 否 |
| EgoAI `weknoraManager.ts`（进程拉起/HTTP 探测/secrets） | 扩展 `ensureMCPApiKey` + 注入 helper | 是（胶水，小量） |
| EgoAI `mcpRuntime.ts` `resolveWeknoraMcpServer` | 增补 `WEKNORA_API_KEY` env | 是（胶水，一行） |
| EgoAI provider 注册表（`shared/providers/constants.ts`） | chat 复用；embedding/rerank 配置独立新增 | 是（配置 + 少量 UI） |
| EgoAI 模型设置 UI（`ModelSettingsSection.tsx`/`Settings.tsx`） | 新增「知识库模型」子区 | 是（UI，胶水） |
| EgoAI 配置变更影响分类（`openclawConfigImpact.ts`） | 复用「变更→同步」触发模式 | 是（胶水，接线） |
| 模型注入同步器 `weknoraModelSync.ts` | 新写 REST upsert 逻辑 | 是（胶水，核心新代码） |
| Agent 工具可视化 `ToolCallGroup.tsx` | 复用，调检索结果显示 | 否（仅样式/字段） |
| 预设 Agent `presetAgents.ts` | 加「知识库问答」一条 | 否（配置） |
| 知识库原生视图 `components/knowledgeBase/` | 新增 React 组件（上传/建库/列表/检索预览，zh/en 双语） | 是（新写前端，中等量，非「胶水」） |
| weknora REST 代理 IPC（`ipcHandlers/weknora/`） | 新增（renderer→main→REST），**白名单仅放行知识库/文档/检索路径**，租户/系统/模型端点由 main 独占 | 是（胶水，接线） |
| docreader 拉起（阶段 2） | 复用 dsh/weknora 子进程模板拉起 Python gRPC 服务 | 是（胶水） |
| 引擎状态面板 / 初始化引导 | 复用 `openclawEngineManager` 状态模式 + 设置面板 | 是（UI，胶水） |

---

## 7. 风险与注意点

1. **rerank 无法纯本地**：Ollama 不支持 rerank，纯本地默认禁用（检索仍走 hybrid）。UI 需明示「rerank 需在线 API」。⚠️ 阶段 2 验收时须实测「禁用 rerank 的混合检索质量是否够用」，若召回噪声过大，默认引导配在线 rerank。
2. **模型注入与 WeKnora 初始化向导冲突**：WeKnora 前端首次会弹自己的初始化向导，可能与 EgoAI 注入的模型打架。阶段 2 做「首次建库引导」时统一处理（让向导复用已注入模型，或跳过向导）。
3. **API key 明文 token 仅创建时可见一次**：必须立即持久化 `secrets.json`，丢失需重建；已加「鉴权探活」兜底（见 §3.1 步骤 2），key 失效/租户重建自动恢复。
4. **配置变更同步时序**：模型配置变更时 weknora-lite 可能未 ready，注入需排队/重试（复用 weknoraManager ready 状态）。
5. **数据边界不变**：`egoai.sqlite` 与 `weknora.db` 各自独立，仅通过 REST/MCP 边界交互，不做数据迁移。
6. **原生视图的 REST 代理安全**：renderer 经 IPC 访问 weknora REST，需限定可用端点（防 renderer 越权调租户/系统接口），复用现有 sandbox + contextBridge 安全模型。
7. **体积/分发**：weknora-lite 单二进制约 250MB，需「获取产物脚本 + extraResources 打包声明」（阶段 4）。
8. **引用溯源的来源元数据**：已列为「阶段 1 必验证项」（spike 确认 `hybrid_search` 返回结构），决定后续引用深度。
9. **embedding 配置的「两个」割裂风险**：记忆 embedding（`cowork_config`）与知识库 embedding（新增）若都独立暴露，用户会面对两个孤立 embedding 配置、复刻「配两套」割裂。建议产品层默认「知识库 embedding 跟随记忆 embedding，高级用户可单独覆盖」。
10. **原生视图与 webview 的状态一致性**：原生视图改了库，webview 不刷新。需定义切换机制（webview reload / 原生轮询）避免数据不一致。
11. **i18n**：知识库视图 / 模型配置区 / 预设 Agent 文案均需 zh/en 双语（CLAUDE.md 硬性要求）。

---

*本计划为完整融合蓝图。阶段 1（地基层）风险低、价值高、可立即实施；阶段 2 是用户可感知价值的核心；阶段 3/4 为完善与分发。*
