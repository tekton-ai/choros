---
artifact: spec
feature: personal-first-product-scope
author: copilot
status: accepted
created: 2026-09-03
intent: ./intent.md
---

# Spec — 个人登录、本地产品与最小线上服务

## Requirements & design spec

### Functional requirements

#### 1. 个人账户与登录

- 首次使用桌面应用必须通过 GitHub 或 Google OAuth 创建或登录个人账户；不提供邮箱/密码、Apple、invite、allowlist 或 organization 创建流程。
- OAuth 注册对所有 GitHub/Google 用户开放。服务端使用 provider 的稳定 subject 识别账户，并沿用 Better Auth 当前隐式链接规则：只有 provider 确认 verified email 且与现有用户邮箱完全相同时，才把新 provider account 链接到同一 user。
- 登录服务只保存认证所需的 user、provider account 和 session 记录。不得创建 organization、team、membership、role、plan、subscription 或其他产品所有权记录。
- GitHub/Google OAuth 只用于 Choros 登录。服务端不得使用或保留 provider token 去读取仓库、邮箱、Drive 或其他 provider 资源；登录 scope 必须限制为取得稳定 subject 和基础 verified identity 所需的最小集合。
- 首次登录需要联网。成功登录后，桌面端将最小身份状态安全缓存在本机；认证服务不可达或用户离线时，仍可进入全部本地功能。恢复联网后刷新 session；远端 session 已撤销时清除登录状态，但不得删除本地数据。
- 退出登录只撤销/清除 session 和本机 auth token。project、workspace、worktree、chat history、provider credential 和设置全部保留。
- 同一台机器只有一个与登录账户无关的 local profile。切换 GitHub/Google 账户不会切换、隐藏或复制本地数据。
- 首版不提供自助账户删除。用户可以退出登录并在 GitHub/Google 侧撤销授权；该限制必须在 Privacy/Legal 审查后才能作为生产最终状态接受。
- Account 界面只显示当前登录 provider、邮箱/头像和 Sign out；删除名称/头像修改、上传和删除账户操作。
- 首次 OAuth 登录后进入精简本地 onboarding，只引导配置模型凭据并打开或创建第一个本地 project，不写任何云端产品状态。

#### 2. 本地产品边界
- 本机 host service 是没有 organization/profile ID 的真正单例 loopback 子进程，不属于线上服务；coordinator、manifest、daemon socket、DB 路径和 API 都不得保留多 organization/profile 维度。
- project/workspace/terminal/agent/PR 的唯一事实源是 host-service/chat-runtime SQLite。`@choros/local-db` 只保留浏览历史、窗口/UI 偏好等真正属于 desktop 的状态；不保留 project/workspace 双写或 v1/v2 迁移层。
- 删除自有 Cloud Task 产品：Task CRUD、status、assignee、board、Linear/QStash sync、Task UUID workspace link 和相关 CLI/UI 全部退出。
- 保留个人仓库事项路径：GitHub Issue/PR 入口放在对应本地 Project 内，通过用户本机 `gh` CLI 或 Git credential 读取，并可用于创建 workspace、生成 branch/名称和 agent prompt context。此路径不使用 Choros GitHub App、provider token 或云端 Task 表。
- 删除 Automation 产品：云端 definition、schedule、event/webhook trigger、prompt version、run history 和 UI 全部退出；普通手动 agent session 保留。
- 删除 remote host、relay、presence、cloud workspace、多设备访问和对应 paywall/UI；只允许当前机器的 local host service。
- cloud chat metadata、上传和同步退出；chat 与 agent 历史只保存在本机。
- CLI 只保留本机 workspace/agent 管理与脚本能力。organization、member、remote host、cloud automation 和其他云产品命令全部删除。

#### 3. 最小线上服务边界

Choros 控制的动态服务端只承担两项职责：

1. GitHub/Google OAuth、个人 account/session；
2. 接收 authenticated `desktop_opened` 使用事件。

另外保留一份由发布流程生成的静态版本 manifest。除此之外，不存在通用产品 API、云端产品数据库或后台业务任务。

必须删除的服务端领域包括：

- organization、team、member、invite、role/permission；
- Task、status、assignee、Linear sync；
- Automation、schedule、event/webhook trigger、run history；
- remote host、relay、presence、cloud workspace、sync/Electric；
- billing、Stripe、subscription、plan、seat、paywall、API key；
- Slack、Linear、Microsoft Teams、Google workspace、GitHub App installation 及其他业务 integrations；
- server-driven rich notices、admin/business dashboards 和 PostHog product analytics。

不保留 deprecated endpoint、空 router、兼容 alias、隐藏 feature flag 或“以后可能使用”的业务表。登录与使用事件可以共享一个部署，但必须保持两个窄路由，不重新建立通用 tRPC surface。

#### 4. 使用事件写入契约

- 客户端只发送一个事件：`desktop_opened`。
- 每次 production stable 桌面应用完成登录身份恢复并呈现可交互本地界面，都生成一个新的幂等 `desktop_opened`；开发、测试和未配置 production auth service 的构建不生成。
- 离线启动不得阻塞；每次成功离线启动可以保留待发送事件，恢复联网并刷新 session 后补发。DAU 在查询时按 user/date 去重，原始行保留启动频率。
- endpoint 必须从已验证 session 推导 `userId`，禁止客户端在 body 中提交或覆盖 user ID。
- body 只接受固定字段；禁止任意 `properties`、metadata 或嵌套扩展对象。

```http
POST /api/usage/events
Authorization: Bearer <desktop-session-token>
Content-Type: application/json
```

```json
{
  "id": "01991f5d-6ad0-7f62-a5f1-2cb897cc78ba",
  "event": "desktop_opened",
  "occurredAt": "2026-09-03T08:00:00.000Z",
  "appVersion": "0.1.0",
  "platform": "darwin-arm64",
  "schemaVersion": 1
}
```

- 服务端只允许 `event = "desktop_opened"` 和已知 schema version；拒绝未知字段、无效 timestamp、无效 platform/version 或未认证请求。
- `id` 是客户端生成的幂等事件 ID，数据库 unique；离线补发或网络重试不得产生重复记录。
- 数据表只包含：event ID、derived user ID、event name、occurred-at、received-at、app version、platform、schema version。不得保存 IP、user-agent、organization、installation/device ID、项目、仓库、路径、branch、prompt、chat、terminal、页面 URL 或任意属性 JSON。
- 原始事件的目标保留期仍为 365 天，但产品 owner 已决定本次实现不包含自动清理动作；首版不得声称或测试为已自动删除，也不得创建长期 person profile。
- 产品 owner 直接使用只读数据库访问执行分析，不提供 admin API 或 dashboard。DAU 的基础查询是指定 UTC 日期内 `desktop_opened` 的 distinct `user_id` 数；其他分析以后通过 SQL 决定，不扩大写入字段。
- 使用事件失败必须 fail-open：不阻塞 UI、不显示错误、不影响本地功能。认证失败只放弃或等待下一次有效 session，不循环弹窗。

#### 5. 静态版本 manifest

- 发布流程生成并发布只读 JSON manifest；不使用数据库或动态公告 API。
- manifest 只包含 schema version、latest version、published-at 和 release/download URL。

```json
{
  "schemaVersion": 1,
  "latestVersion": "0.2.0",
  "publishedAt": "2026-09-03T08:00:00.000Z",
  "releaseUrl": "https://github.com/<owner>/<repo>/releases/tag/desktop-v0.2.0"
}
```

- 客户端发现更新时只显示提示和更新入口，绝不因版本过旧而阻断本地使用。
- manifest 不可达、格式错误或超时时静默失败；不得影响启动或离线功能。
- 删除现有数据库驱动的 rich notice body、severity、targeting、pre/post-update trigger 和 blocking page。

#### 6. Sentry 状态

- 保留 desktop renderer、main process 和 host-service 的 Sentry 接入代码，但默认不配置 DSN，因此任何环境都不得向继承的 Superset 项目发送数据。
- 删除 PostHog exception capture 和其他 PostHog product analytics。
- 未来启用 Sentry 必须使用产品 owner 自己控制的新项目和 secret，并在独立隐私/数据边界审查后进行；本次不启用。

#### 7. 数据与切换

- 产品尚未发布，不存在需要兼容的真实用户 organization profile、旧客户端或外部 API 调用方；不实现旧 profile 合并、云数据导出或兼容 endpoint。
- 允许删除并重建全部本地/云端开发数据库及测试账户。重置绝不得删除用户磁盘上的 Git 仓库、worktree 或普通文件。
- 若环境检查意外发现任何非开发数据或非零旧云产品表，立即停止破坏性操作并回到产品 owner 决策；不得把“尚未发布”当作未经验证的删库授权。

### Acceptance criteria

- 全新安装可通过 GitHub 或 Google 登录，随后进入只配置模型凭据和第一个本地 project 的精简 onboarding；不出现 organization、invite、team、billing 或 paywall。
- 已登录安装在完全断网时可进入并使用本地 workspace、terminal、agent/chat；首次登录仍明确要求网络。
- Account 页面只显示 provider、邮箱/头像和退出；退出或切换账户后本地 project/workspace/chat/settings 数量和可见性不变。
- 每个 Project 内可查看 GitHub Issue/PR 并通过本机 `gh`/credential 创建 Workspace/Agent，不调用 Choros integration 或 Task API。
- UI、CLI help、运行时网络和部署配置中不存在 Cloud Task、Automation、remote/relay/cloud workspace、billing 或业务 integration 入口。
- 稳定版每次成功启动只向认证服务发送 session refresh（有网时）和一个幂等 `desktop_opened`，并读取静态版本 manifest；未主动使用模型/Git/update 下载时不存在其他 Choros 线上请求。
- `desktop_opened` body 拒绝额外字段，数据库行不含禁止数据；同一 event ID 重试只产生一行。
- 对某 UTC 日执行 `count(distinct user_id)` 可得到 DAU；本次不包含 365 天自动清理任务。
- manifest 新版本只产生非阻断提示；manifest 不可达和使用事件写入失败均不影响本地功能。
- 生产构建不含 Superset Sentry DSN，且没有 Sentry/PostHog 出站异常或分析请求。
- 开发数据库可以按新 schema 重建且旧测试行消失；磁盘上的 Git 仓库、worktree 和普通文件完全不受影响。

### Non-functional requirements

- **启动隔离：** 认证刷新、统计写入和 manifest 请求均不在本地数据库、host-service 或首屏交互的关键路径。
- **安全：** OAuth state/PKCE、callback allowlist、session rotation、token-at-rest protection 和 provider 最小 scope 必须保留；移除 organization authorization 不得削弱 loopback host auth 或路径校验。
- **数据最小化：** usage endpoint 使用 strict schema；不得记录 request body、Authorization header 或 IP 到长期应用日志。
- **可靠性：** 本地功能优先于任何线上请求；离线缓存身份不是本地数据加密或多用户访问控制边界。
- **性能：** usage payload 小于 1 KiB；发送异步且每次成功启动最多形成一个逻辑事件。
- **保留期：** usage 原始事件目标保留期为 365 天，但清理执行机制明确延后；session/account 保留遵循认证需要，首版不提供自助账户删除。
- **国际化：** 所有新增或变更的用户文案使用 Lingui 显式 ID，并通过 `bun run --cwd packages/i18n check`。

### Out of scope

- 多人协作、organization、team、invite、member、role 或共享 workspace。
- 云 Task、本地自有 Task 看板、Linear sync 或 Task 数据迁移；保留的只有 repository Issue/PR 路径。
- Automation 的本地重写、云调度、webhook 或运行历史。
- remote host、relay、cloud workspace、多设备同步和 cloud chat history。
- billing、subscription、license enforcement、paywall 和 API key。
- telemetry opt-out/consent UI；产品 owner 已要求延后，但适用法律要求仍可阻断发布。
- 自助账户删除、手动 provider linking 和按登录账户隔离本地 profile。
- admin usage API、统计 dashboard、PostHog、feature flags、session replay 和细粒度产品事件。
- 本次启用 Sentry。
- 在发现非空生产旧云数据时自动导出、迁移或删除。
- usage event 的 365 天自动清理任务；该隐私债务必须在后续独立工作中实现。

## Integration with existing code

- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` 保留个人 session gate，但删除 active organization、create-organization、membership、cloud/offline block 和 cloud feature分支；离线缓存身份必须允许本地 layout 渲染。
- `apps/desktop/src/renderer/lib/auth-client.ts` 与 `providers/AuthProvider` 继续处理个人登录/session；删除 organization client/team plugin 和 organization header，收窄为 GitHub/Google OAuth。
- `apps/desktop/src/lib/trpc/routers/auth` 与 `apps/auth/src/index.ts` 继续承担 desktop OAuth deep link/session exchange，但不再启动 organization-scoped host service。
- `packages/auth/src/server.ts` 当前同时装配 organization、Stripe、API key、JWT、QStash、invite/email 等能力；目标状态只保留 GitHub/Google social providers、必要 session/account hook 和窄 usage route。
- `packages/db/src/schema/auth.ts` 当前 user/session 含 organization、team 和 deletion 字段，account 含 provider tokens；目标 schema 只保留最小 auth identity/session。`usage_events` 是唯一新增业务事实表。
- `apps/desktop/src/renderer/lib/posthog.ts`、`providers/PostHogProvider`、`PostHogUserIdentifier`、`PostHogSurfaceTagger`、`TelemetrySync` 与 `apps/desktop/src/main/lib/analytics` 全部退出，改为一个 authenticated `desktop_opened` 调用点。
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks` 当前混合 Cloud Task 与独立 GitHub Issues；目标状态删除全局 Tasks surface 和 Cloud Task/Linear 部分，把 host-local GitHub Issue/PR → Workspace/Agent 放进对应 Project。
- `packages/trpc/src/router/task`、`automation`、`organization`、`team`、`host`、`integration`、`chat`、`api-key`、`analytics/business` 和对应 `packages/db` 表不再有产品消费者，最终删除而非留空 router。
- `apps/desktop/src/main/index.ts`、`main/lib/host-service-coordinator.ts`、`main/host-service/index.ts` 与 `packages/host-service/src/app.ts` 当前要求 auth token、organization ID、cloud API URL/ApiClient；目标状态以单一 local profile 启动，仅保留 loopback host auth 与本地 DB。
- `packages/host-service` 的 GitHub Issue/PR 路径继续通过本机 `gh`/credential provider；删除向 cloud `task.start`、host registry、relay 和 cloud chat metadata 的调用。
- `packages/local-db/src/schema/schema.ts` 及 host/chat SQLite 是保留产品数据的事实源。由于产品未发布，plan 直接定义干净的单一 local profile schema 和开发库重建，不设计旧 organization profile 兼容迁移。
- `packages/cli/src/commands` 删除 auth organization/member、remote host、cloud automation/Task 等云命令；保留本地 workspace/agent 命令。
- `apps/desktop/src/renderer/hooks/useDesktopNotices` 与数据库 `desktop_notices` 退出；版本提示改读发布流程生成的静态 manifest。
- `apps/desktop/src/main/lib/sentry.ts`、renderer `lib/sentry.ts` 和 host-service Sentry 初始化保留但必须在无 owner DSN 时严格 no-op；继承配置和部署 secret 必须清除。

## Policy compliance

### Brand

- 删除 organization、team、billing、paywall 和 cloud 功能文案；个人登录和更新提示继续使用现有 `@choros/ui` 与 Lingui 显式 message ID。
- 未检测到独立 brand skill/doc；若登录/更新页面需要新文案，由 Product/Design lead 人工确认。

### Security

- 服务端攻击面收敛为 OAuth/session 与 strict usage write。删除 provider 业务 token、API key、webhook、billing 和通用 tRPC。
- Better Auth 默认隐式链接只允许 provider verified same-email；不把 GitHub/Google 加入绕过验证的 forced trusted-provider 列表。
- provider token 不用于产品资源访问，登录完成后不得长期保留不必要 access/refresh token。
- 离线身份只控制产品导航，不声称保护磁盘上的本地数据；loopback host auth 和路径注册校验继续是本地安全边界。
- 未检测到仓库级 security skill/doc。Auth/schema 变更属于高风险，需要 AppSec 或 tech lead 审查。

### Compliance

- usage 记录与可识别 user ID 关联；目标保留期是一年，但本次不实现自动清理，实际数据可能超过目标期限。这是明确接受但未消除的隐私债务。
- 首版无自助删除、无 telemetry consent/opt-out。未检测到 privacy/compliance skill/doc，这两项必须由 Privacy/Legal 明确判断；法律要求高于产品延后决定。
- 旧表删除必须以目标环境零行证据为前提；任何数据存在时重新进入保留决策。

### UX

- 首次使用需要登录；此后离线可继续。本地数据永远不随退出或账户切换消失。
- 更新只提示不阻断，所有服务端失败均不阻断本地工作。
- 删除导航和设置页面后必须保持键盘导航、焦点顺序、路由恢复、workspace 深链与本地 GitHub Issue/PR 工作流。
- 未检测到本变更专用 UX policy doc；Design lead 需确认精简后的登录后落点和导航信息架构。

## Areas of concern

- **Intent 实质变更（owner: Product owner）** — 原方向是无账户、仅统计；逐项确认后改为 GitHub/Google 登录 + 统计 +静态版本。修订 Intent 已重新接受，后续不得引用旧边界。
- **无自助账户删除（owner: Privacy/Legal）** — 用户只能退出和 provider 撤权，服务端 user/usage 数据不会立即删除；这可能不满足隐私法或平台政策，需明确裁决。
- **统计 consent/opt-out 延后（owner: Privacy/Legal）** — `desktop_opened` 与 user ID 关联保存一年。产品决定延后不等于合规豁免。
- **OAuth 隐式链接（owner: AppSec）** — 依赖 GitHub/Google 的 verified-email 语义；必须验证没有 forced trusted-provider 绕过，并覆盖冲突与 takeover 场景。
- **离线 session（owner: AppSec/Tech lead）** — 远端已撤销账户在离线时仍可进入本地 UI。因为本地 profile 本就不以账户隔离，这是明确产品选择，但 UI 不得误导为安全访问控制。
- **开发数据重置边界（owner: Product owner/DB owner）** — 产品 owner 已确认允许重建开发数据库，但绝不能删除磁盘 Git 仓库、worktree 或普通文件；若发现任何非开发/非空生产数据必须停止。
- **保留 Sentry 代码（owner: Product owner/AppSec）** — 当前目标可能仍指向 Superset。所有构建与部署 secret 必须先清空，未来只能在新项目审查后启用。
- **GitHub Issue/PR 本地凭据（owner: AppSec）** — 这是用户本机 credential/`gh` 路径，不是 Choros OAuth integration；代码清理必须避免误删它，也不得把 token 带入日志或 usage event。
- **Usage 清理延期（owner: Product owner/Privacy）** — 首版记录每次启动且没有自动删除任务；365 天只是目标而非已执行保证，必须在后续工作中补齐。

## Author + Status

- **Author:** copilot
- **Status:** `accepted` — 产品 owner 于 2026-09-03 接受清理延期、Host 真单例与 Host DB 事实源修订
