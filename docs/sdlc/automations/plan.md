---
artifact: plan
feature: automations
author: agent
status: accepted
created: 2026-09-28
intent: ./intent.md
spec: ./spec.md
---

# 实施计划：自然语言驱动的 Automation

意图和规格均已获产品负责人接受：intent 审批提交 `b3d529727`，spec 审批提交 `c752f61ab`。负责人 xchunzhao 于 2026-09-28 在收到本计划及实施顺序后明确回复“接受”，现记录为 accepted，按本计划进入隔离验证与实现；不自动启用日常任务、发布或部署。

## 一、实施路线

**先跑通真实的一次工作，再加时间和重复；不先交付完整 Workflow。** 共享执行模块只管理一次工作的归属、准备、provider 操作、结果、问题、取消和恢复。自然语言管理和后台执行使用不同的工具权限集合，但落到同一 Host 服务。

| 里程碑 | 阶段出口；不等于整个功能已交付 |
| --- | --- |
| M0 原生链路技术证明 | 先用隔离的协议fixture验证Claude/Codex工具、报告、审批与停止契约，真实provider联调单独记录；不可用的模型网关不阻塞M1–M5开发。 |
| M1 接纳与持久记录 | 同一请求不会生成两份安排／执行；输入快照、占用、回执和事件可重开读取，尚不自动触发用户任务。 |
| M2 一次性真实工作 | 从自然语言／CLI 到目标、setup、precheck、原生 agent、结果和待处理，跑通完整单次路径。 |
| M3 控制与恢复 | 回答、取消、重跑、fresh/reuse、Host 重启对账可用；未核实状态不会触发重复工作。 |
| M4 时间与重复 | 一次性定时、日历、固定间隔、结束后间隔、有限轮次、暂停恢复与补跑使用同一执行路径。 |
| M5 产品闭环与交付证明 | Desktop 管理／详情／Profile／通知、全部入口与语言一致，真实场景和故障场景完成验收。 |

M2 的“立即运行”是自然语言授权后调用 API，不要求用户去页面点击。M3 的执行安全完成之前，不向试用者开放后台周期派发。阶段是工程检查点，不发布只支持一半入口或假恢复的功能。

## 二、文件与模块变更（Files that change）

以下缩写仅为缩短表格，均相对仓库根目录：

- `H` = `packages/host-service/src`
- `C` = `packages/chat-runtime/src`
- `P` = `packages/chat/src`
- `D` = `apps/desktop/src/renderer`
- `B` = `apps/desktop/src/renderer/routes/_authenticated/_dashboard`

标为“新增”的是计划路径；其余入口已做只读核对。实现前若有并行改动，重新读取实际文件。当前没有配置可用 LSP；实现时若 LSP 可用，所有导出符号变更和迁移先查 references，再修改全部调用方。

### 2.1 Host、持久化和时间

| 文件／路径 | 计划变化 |
| --- | --- |
| `H/app.ts`、`H/types.ts` | 装配共享 ExecutionService、AutomationService 与 scheduler；提供 ready/reconcile/dispose 边界，先对账后派发，不随 renderer 页面生灭。 |
| `H/db/schema.ts`、`H/db/db.ts`、`packages/host-service/drizzle.config.ts` | 增加下面的领域记录和唯一约束；沿用 SQLite/Drizzle 迁移及既有外键保护，保持普通 workspace/terminal 数据完整。 |
| `H/runtime/executions/`（新增） | `execution-service.ts` 管接纳/报告/问题/取消；`execution-store.ts` 管事务；`native-driver.ts` 衔接 chat-runtime；`reconcile.ts` 对账；`artifacts.ts` 管有界结果与证据引用。无 DAG 或模型自动规划器。 |
| `H/runtime/automations/`（新增） | `automation-service.ts` 管 preview/定义/启停/历史；`scheduler.ts` 管时刻和领取；`automation-store.ts` 管安排及轮次；`confirmation.ts` 管内容/用途绑定。此层不另维护 agent 完成状态。 |
| `packages/shared/src/automation-contracts.ts`（新增）及 `packages/shared/package.json` | 统一 Zod 输入、错误码、时间规则、Run/Execution 快照和客户端类型；不把 Host DB 行直接当公共 API。 |
| `packages/shared/src/rrule.ts`、`rrule.test.ts` | 复用现有 `rrule`、`@date-fns/tz` 和格式化能力；补齐严格子集、日历槽位与 DST gap/fold 解析。预览与派发用同一个计算入口，不另起时间算法。 |
| `H/runtime/setup/config.ts`、`H/trpc/router/workspace-creation/shared/setup-terminal.ts`、`H/trpc/router/workspaces/workspaces.ts` | 区分无配置和无效配置；提取可记录完成回执的准备阶段；新路径不使用“setup 启动 warning 后仍派发”的旧行为，相关普通创建调用方一并迁移到明确结果契约。 |
| `H/runtime/setup/managed-script.ts`（新增） | 复用现有命令来源、cwd、环境及 PTY/进程管理原语，增加本次 operationId、退出/超时/停止证据和有界输出；供 setup 与 precheck 共用，不复制脚本配置解析器。 |
| `H/terminal/terminal.ts`、`H/trpc/router/terminal/terminal.ts`、`packages/pty-daemon/src/handlers/handlers.ts` | 对准备进程需要的控制保留真实停止结果；不丢弃 daemonCloseSucceeded，不把发送信号／closed 回执当完整子树退出。共享调用方不能继续显示假 disposed。 |
| `H/trpc/router/usage/default-account.ts`、`H/trpc/router/usage/profiles.ts` | 在现有账号发现／选择边界增加 exact-ref 解析；预览可提议当前默认账号，保存后固定引用，失效不退回默认登录。 |
| `H/trpc/router/router.ts`；`H/trpc/router/automations/`、`H/trpc/router/executions/`（新增） | 注册受认证的薄路由，领域写入只调用服务；自然语言、CLI、SDK、Desktop 的确认和状态语义一致。 |
| `H/events/types.ts`、`H/events/event-bus.ts`；`packages/workspace-client/src/lib/event-bus.ts` | 增加带版本／游标的变更提示；广播丢失可从持久事件补读，不以通知是否送达决定执行状态。 |

`packages/shared/src/automation-triggers.ts` 及旧 integrations/constants 中还有云端 GitHub/Slack/Webhook 触发描述。这不是现成本机 scheduler，不把其宽泛 trigger union 接回产品。本次复用真正适用的时间工具；不为此功能恢复旧连接器，也不顺手清理无关 integrations。

### 2.2 原生执行链

| 文件／路径 | 计划变化 |
| --- | --- |
| `C/index.ts`、`C/harness/types.ts`；`P/protocol/commands.ts`、`P/protocol/envelope.ts` | 扩展稳定操作、受控上下文、provider 身份、结果／问题回调、停止观察类型；保持 chat-runtime 不依赖 Automation 数据库或 Desktop。 |
| `C/commands/commands/commands.ts`、`C/commands/command-dedupe/command-dedupe.ts`、`C/router/router/router.ts` | 把接纳和实际启动分开；同作用域 requestId/参数摘要持久去重，可按 operationId 查回，不把现有 500 条内存 LRU 当重启保证。 |
| `C/db/schema/schema.ts`、`C/db/create-chat-db/create-chat-db.ts`、`packages/chat-runtime/drizzle.config.ts` | 增加 runtime 自有操作回执／身份字段，沿用自己的 SQLite 迁移，输出在 `C/db/drizzle/`；不混用 Host 迁移目录。 |
| `C/sessions/live-session/live-session.ts`、`C/sessions/registry/registry.ts` | 关联接纳操作、实际 prompt/turn、取消意图；处置中保留归属和观察，不能先删除 registry 或把本地 fail 合成为可信 interrupted。受管理活动会话拒绝无归属的额外 prompt。 |
| `C/projection/projection.ts`、`C/journal/epoch/epoch.ts`、`C/journal/journal/journal.ts`、`C/replay/replay.ts` | provider session/turn 与观察事件在 chat DB 同事务持久；Host 通过稳定 cursor 重放投影，保留 transcript 而非全量复制。 |
| `C/harness/claude/claude-adapter/claude-adapter.ts`、`C/harness/claude/create-claude-adapter/create-claude-adapter.ts`、`C/harness/claude/translate-stream/translate-stream.ts` | 贯穿固定账号环境、规则上下文、受控工具、真实身份/result 和审批绑定；正确区分 interrupt 请求、流失败和可信停止。 |
| `C/harness/codex/codex-adapter/codex-adapter.ts`、`C/harness/codex/codex-adapter/codex-modes/codex-modes.ts`、`C/harness/codex/codex-adapter/codex-version/codex-version.ts` | 注册受版本校验的管理／执行工具，捕获 thread/turn，完成受管理 resume、审批与固定权限；未知能力明确拒绝，不换执行器。 |
| `C/harness/codex/rpc-client/rpc-client.ts`、`C/harness/codex/wire/wire.ts` | 标明请求发送/接纳/终态证据，等待真实退出事件；请求异常不能凭空合成另一个业务失败 turn 并释放占用。 |
| `H/chat-v3/mount.ts`；`H/chat-v3/tools/`（新增） | Host 注入已认证会话的管理工具桥，执行会话只注入结果/问题等最小工具；不为 Automation 新建一个聊天宿主。 |

### 2.3 自然语言、SDK、CLI 和 Desktop

| 文件／路径 | 计划变化 |
| --- | --- |
| `packages/sdk/src/client.ts`、`packages/sdk/src/index.ts`、`packages/sdk/src/resources/index.ts`、`packages/sdk/src/resources/automations.ts` | 迁移／移除旧 organizationId/云端 automation.* 公共出口，所有 Automation 调用切到本机契约，不留下同名双语义 API。其他 SDK 资源保持原范围。 |
| `packages/sdk/src/local-host/client.ts`（新增）、`packages/sdk/package.json` | 导出显式本机 Host client，以 endpoint 和认证提供者构造，类型由 Host router 推导；不请求云组织/JWT交换/relay，不复制凭据。 |
| `packages/cli/src/lib/host-target/resolve-host-target.ts`、`packages/cli/cli.config.ts`；`packages/cli/src/commands/automations/`（新增） | 复用本机 manifest 发现与 typed transport；按现有 meta.ts/子目录command.ts 模式接全部规格命令，支持 requestId、JSON、prompt文件及明确确认用途。 |
| `plugins/choros/skills/automate/SKILL.md`、`plugins/choros/skills/automate/agents/openai.yaml`、`plugins/choros/skills/10x/SKILL.md`、`packages/agent-setup/src/managed-skills.ts` | 更新真实 Choros 使用流程和能力说明，试跑可选；沿用既有受管分发，不另建安装器。只修与本功能相关的错误承诺。 |
| `P/protocol/items.ts`、`P/client/session-client/session-client.ts`；`B/v2-workspace/$workspaceId/hooks/use-pane-registry/components/chat-v3-pane/` | 在真实 tool/approval 链上展示工作约定、接收精确决策；不让卡片直接调用 Host mutation 绕开 pending 工具。 |
| `B/automations/`（新增） | page/layout、安排/历史/待处理，以及 `runs/$runId/page.tsx`；组件按功能就近拆目录，展示快照、结果、证据、回答及取消。 |
| `B/layout.tsx`、`B/components/dashboard-sidebar/components/dashboard-sidebar-header/dashboard-sidebar-header.tsx` | 接入展开／收起导航，按现有路由生成方式更新类型，不手改生成文件。 |
| `D/routes/_authenticated/providers/host-automations-provider/`、`D/hooks/host-service/use-automations/`（新增）；`D/lib/host-event-bus.ts` | 单份 Host 快照/游标与查询缓存供页面、通知和 attention 共用，避免每个 Profile/页面各起监听和定时器。 |
| `apps/desktop/src/shared/profiles.ts`、`D/routes/_authenticated/providers/profile-provider/`、`D/routes/_authenticated/components/profile-navigation-controller/` | 增加 Automation 路由投影和深链，按项目／已有 session 继承归属；不增加新 Profile 成员或权限模型。 |
| `D/hooks/host-service/use-v2-notification-status/`、`B/components/dashboard-sidebar/components/dashboard-sidebar-header/components/profile-switcher/profile-switcher.tsx` | 合并按执行／问题身份统计的待处理摘要；不把多个 Run 压成一个 workspace 状态。 |
| `apps/desktop/src/shared/notification-types.ts`、`apps/desktop/src/lib/trpc/routers/notifications.ts`、`D/routes/_authenticated/components/v2-notification-controller/`、`apps/desktop/src/main/lib/notifications/notification-manager.ts` | 正确的 Run 深链及提示去重；持久结果不依赖 OS 通知存活，跨 Profile 先定位归属。 |
| `packages/i18n/lingui.config.ts`、`packages/i18n/locales/`；`packages/sdk/README.md`、`packages/sdk/api.md`、`docs/agent-tooling.md`、根 `AGENTS.md` | 按实际交付同步语言、SDK用法和相关工具说明；不再把旧 Superset／远程能力当成本机功能。文档更新属于实施交付，不在本轮提前宣布上线。 |

## 三、关键实现契约

### 3.1 最小持久模型

物理设计限定为有实际消费者的记录，不先建 workflow definitions/tasks/dependencies。Host 表拟为：

| 表 | 内容与约束 |
| --- | --- |
| `automations` | 当前定义版本、安排状态、状态版本、下一次时刻、已用轮次、暂停截止与推进游标。 |
| `automation_versions` | 不可变规范化定义与目标/账号/权限引用；`automationId + revision` 唯一。 |
| `automation_runs` | 触发来源、计划时间、版本快照引用、retryOf、executionId；执行前跳过原因可以独立存在，执行后结果以关联 Execution 为权威。 |
| `execution_runs` | 一次尝试的输入/归属、阶段、结果/证据引用、取消意图和待处理摘要；显式重跑产生新记录，不覆写旧尝试。 |
| `execution_operations` | 目标准备、脚本、native session/prompt、停止等稳定操作身份、参数摘要、预分配资源身份与回执。不是通用工作流节点表。 |
| `execution_inputs` | 持久问题/权限请求、来源身份和版本、答案、交付状态；一次答案只能作用于原请求。 |
| `work_command_receipts` | 调用作用域、requestId、参数摘要和原回执；同时记录确认凭证的消费关联，防同凭证换requestId重复执行。 |
| `work_events` | 有序变化和主体引用，服务补读/对账；领域表仍是状态真相，不将整个应用改成 event-sourcing。 |

按运行态建立唯一占用约束：同一 Automation 至多一个未释放执行；已有 workspace 的受管理执行首批一律保守互斥，不因 prompt 自称只读豁免。占用与执行在同一事务领取/释放，不使用超时租约自动释放 unknown。原生会话另按 provider/session/账号绑定检查，普通会话不能被后台任务抢占。

计划时刻唯一身份不包含 definitionRevision；UTC instant 的唯一约束和 DST gap 本地槽位身份并存。大量未执行轮次的区间摘要保存范围、数量、规则版本和游标，同事务推进；不合并真实执行记录。索引覆盖状态/nextDue、automation历史、执行占用、事件序号与命令回执，分页不扫整份历史。

chat DB 只增加自身的操作回执与 provider/session/turn 关联，不引用 Host 表外键、不计算 Automation 成败。报告不超过规格大小；大型证据由 `artifacts.ts` 存受控文件，按执行归属、长度和校验和校验，拒绝任意路径读取。

### 3.2 接纳、外部动作和恢复

1. Host 短事务校验版本、确认、轮次、目标与占用，创建 Run/Execution/阶段操作，并预分配 workspace、chat session、prompt 操作身份。
2. 事务外准备资源；chat runtime 先以 operationId 接纳并写自己的回执，再实际启动 provider／发送 prompt。相同操作同参数查回原结果，异参冲突；不是在随机 createSession 外套重试。
3. provider 身份、已接纳 turn、报告和停止观察先在其所属存储提交，再由 Host 按 cursor 补记/结算；Host 投影与消费游标同事务更新。
4. 每一步外部调用前记录开始边界。只有确实尚未派发的操作可以自动继续；“请求发出但回复没收到”不得重新发 prompt。仍可接回的执行继续观察；通道或身份不明保持 unknown。
5. Host 重启先对账再启动 scheduler。stdio/SDK不能凭PID假装重连；记录进程incarnation及provider身份，禁止PID复用误杀。没有重连/停止证明时保留占用，不新起替代执行。

创建 worktree 使用既有创建路径、稳定 id 与固定分支/目标参数；由共享准备阶段接管 setup，避免现有 sugar agents 并行启动。不得绕过既有验证或另用 shell 手工拼出一套 worktree 创建器。

取消先持久封住后续派发，再对归属明确的操作中断。`LiveSession.fail`、Abort、RPC返回、PTY closed 分别记录其实际证据级别；保留监听和归属直到可信静止，不靠合成 interrupted 释放。终态provider事件与结果报告不同步时遵循spec，不自动补成功报告。

### 3.3 自然语言确认与原生工具

- 交互会话注入 Automation 管理工具；后台执行会话只注入 reportResult/requestInput 等限定工具。Host 根据受控会话上下文绑定执行身份，不相信模型自填 executionId。
- 原生 tool bridge 依赖领域服务，不依赖 renderer。Claude/Codex 各使用其真实支持的工具入口；协议参数以M0验证过的SDK/app-server版本为准，不照抄未经验证的dynamic tool方法名。
- 管理预览绑定规范化内容、用途、来源、版本和有效期。预览签名可用Host进程内专用密钥，不写入业务记录；重启使未消费预览失效，客户端重取预览时保留已解析绝对时间，不重新起算“两小时后”。已消费凭证通过持久回执防重放。
- 保留“新建暂停→明确启用”两步语义。需要一次对话完成时，共用一个操作组/确认上下文，save与enable使用各自稳定requestId、用途和预期版本；中途断开可查询save回执，显示真实暂停状态，再完成仍有效且已获授权的enable。过期需重新确认，不谎报已启用、不再建一份任务。
- 预览卡只是同一个pending工具请求的展示。现有ApprovalRow的option决策不能直接交给只认识accept/deny的Claude handler；在Host/runtime管理审批桥精确解析“保存暂停/确认启用”，恢复对应调用。一次确认不能被“Allow for session”放大为以后所有工作约定。
- 普通工具权限与业务问题分别绑定原provider请求/执行问题。答案先持久、再投递，记录交付状态；重启后不得用旧allow批准新请求。
- 规则上下文沿实际目标解析根及适用目录的仓库规则，保留来源、优先级与内容版本；启动时显式传入支持的adapter上下文。触达子目录时继续遵循其规则，不用摘要替代强约束，超出支持容量明确失败而非静默截断。
- 固定账号通过exact-ref生成每个原生进程的环境，不修改全局process.env，不把终端的bypass参数透传给原生adapter；目录/身份不可用即阻止执行，不回落系统账号。

### 3.4 时间计算与用户管理细节

复用现有 `rrule.ts` 的日历生成和时区库，增加一个同时服务preview与scheduler的日历槽位迭代入口：能返回有效instant或gap原因，fold选较早instant。现有Date返回型便利函数也调用同一底层转换；不保留两套互相矛盾的时区算法。每个查询/派发批次只编译一次规则，不逐轮重建RRule；严格子集校验与格式化分开。

固定间隔用整数时间戳计算，后置间隔只由前一计划轮次的可信终态推进；时钟通过运行时依赖注入，仅测试宿主可替换，不修改OS时钟。timer只唤醒检查，正确性由数据库进度、唯一身份与领取事务决定。错过区间先在事务外算候选，再以版本/CAS和游标提交，避免长历史计算占住写锁。

连续零间隔批次遇到失败或workspace_busy等异常跳过时，记录该轮并暂停剩余轮次；只有正常precheck_false按约定允许继续。达到次数/截止是正常结束，不额外暂停；不让冲突瞬间耗完配额。其他计数与暂停规则不重议，按accepted spec执行。

Profile只改变归属展示和导航，不重新授权账号、不因移动分类暂停工作。结果页查询不触发agent；通知仅提示，不回投新prompt。归档只停止未来安排，不删除在途执行、结果或文件。

## 四、工作顺序与并行边界（Order of work）

### M0：先验证原生接入，不先堆表

负责人在本session明确要求继续实现，并允许通过mock推进验证。M0拆成两层：开发阶段在既有adapter协议边界注入可控fixture，模拟工具调用、报告、等待输入、失败、取消和断线；Host、数据库、调度及客户端仍使用真实实现。fixture只能经测试构造参数或测试程序注入，不能成为生产配置中的假执行器或失败回退。

真实Claude/Codex调用保留为单独的联调/交付证据。当前live测试默认describe.skip，不能以退出0当通过；provider网关不可用时明确标记该项未验证，不阻塞可离线实现和验证的契约、持久化、调度及UI。仍核对钉住SDK/app-server schema，不静默缩小首批支持或改成PTY文本猜成功。

### M1：公共契约、事务与迁移

实现共享schema和错误分类；增加Host/chat的最小持久记录、唯一约束、回执查询和一致快照。两套迁移分别通过现有Drizzle配置生成，不手改生成SQL/日志，不连接Neon，不对日常用户库试迁移。覆盖空库、既有terminal/chat数据升级、中途失败和重开。

此时只开放受控测试入口，无定时派发。工程集成负责人固定接口后，原生driver、CLI/SDK和UI工具桥才能分工，避免各层自定字段和状态。新增公开类型和导出如影响现有调用方，同一阶段完整迁移，不留alias/shim。

### M2：打通一次工作

接通目标解析与稳定worktree创建、明确的setup结果、precheck、账号/规则上下文、native操作回执、结果报告和历史读取。先让CLI调用服务，再让终端skill与原生Chat工具调用同一服务；两种provider都要实际跑通。

阶段演示必须是“现在在后台检查临时项目并给报告”：自然语言明确授权后接纳、准备、执行、回报、从原对话或CLI查询原结果，不要求先打开Automation页面。途中故意让setup失败或precheck返回非零，确认agent没有启动并有正确原因。不要用造假的成功JSON代替真实报告。

### M3：控制、复用和重启

接通持久问题/答案、cancel栅栏、停止证据、显式retry及受管理fresh/reuse。补上跨HostDB/chatDB回执丢失、发送前后崩溃、旧报告/答案迟到及当前session身份捕获；有unknown时拒绝冲突新执行。

在已有chat调用路径上修正本地fail/registry dispose/transport close的证据语义，迁移相关消费者与行为测试。旧的公开notifications.hook保持提示用途，不能接入结果结算或批准。完成本阶段真实故障证明后才允许M4周期派发。

### M4：时间与重复

实现全部已接受时间类型、轮次计数、日程修改、暂停至时间、补跑、重叠跳过和历史范围摘要；调度器start/dispose挂Host，先对账再扫描due。补严格RRULE子集及不支持语法的明确错误。

用同一个无UI Host跑一次指定时间任务和至少一个真实重复任务，关闭管理页面后照常触发；再用注入时钟验证DST、回拨、长离线、有限次数和暂停例子。真实分钟级运行与确定性时间演算分别留证，不能混称两者都实机跑过。

### M5：管理体验、统一入口和交付

完成专用列表/详情/待处理、自然语言完整确认卡与问题回答、Profile/失效目标入口、深链和通知；CLI/SDK暴露全部规格操作，删除旧SDK云端Automation出口与错误文档；通过既有分发把真实skill送到Claude/Codex。

M1接口稳定后，M4的纯时间计算与M5的页面/CLI展示可以并行开发；原生工具桥和执行协议由一个集成负责人串行合并。并行工作期间不各自运行项目级格式化/build/lint；全部变更汇总后由集成负责人统一执行。公开入口只在完整链路可用后交付，不用恒真feature flag或假capabilities掩盖缺项。

## 五、风险与处理（Risks）

| 风险 | 概率／影响范围 | 处理与责任 |
| --- | --- | --- |
| 原生工具、身份、resume能力与版本不匹配 | 中／阻断某provider全链路 | M0实际调用先证明；技术负责人确认版本与契约。不能只看类型或旧live测试注释。 |
| 请求已发但回执丢失，造成重复工作 | 中／文件和外部副作用 | 预分配身份、持久操作边界、同ID查询、unknown保守处理；真实双进程/故障注入证明。 |
| 取消被误认为已停止，释放冲突占用 | 中／可能同时写同一目标 | 信号、RPC、流结束和静止证据分开；不先删registry；按incarnation验证停止，不误杀无关进程。 |
| 账号或权限被全局默认/会话批准覆盖 | 中／跨账号数据或越权动作 | 每次执行固定ref与独立环境；管理批准绑定具体约定；后台工具集最小化；安全/技术负责人复核。 |
| Host/chat迁移或双库投影损坏历史 | 低至中／现有会话与运行记录 | 独立迁移、原子写入与cursor重放；升级副本和故障库验证；禁止手删表回滚。 |
| 时间边界或计数错误导致多跑/漏跑 | 中／持续任务 | 唯一日历入口、显式clock、持久游标与原子领取；spec的计数、DST和暂停样例作回归。 |
| 结果/问题只存在UI或通知内存 | 中／用户错过重要结果 | 持久详情为权威、事件补读、跨档待处理与失效目标入口；关闭/重开/拒通知实测。 |
| 测试误接用户Host、fixture写入真实账号或清配置 | 低／影响大 | 独立CHOROS_HOME_DIR、数据库、端口和临时repo；明确验证实例身份；禁止在本机运行破坏性headless脚本。 |

不再把一般字段命名、SDK参数细节或完整跳过矩阵作为新的设计审批关卡。上表中若真实能力无法满足已接受的安全/结果契约，才回到规格讨论。产品接受不冒充独立安全/合规签核；xchunzhao协调对应工程/技术复核人，计划接受时明确风险责任。

## 六、验证、发布与回退（Proof）

### 6.1 保留哪些回归，如何证明

| 范围 | 具体落点与验证 | 覆盖spec |
| --- | --- | --- |
| 时间 | 扩展 `packages/shared/src/rrule.test.ts`；新增 `H/runtime/automations/schedule.test.ts`，验证gap/fold、宿主TZ不同、固定/后置间隔、轮次、暂停/截止和补跑；不是只测字段复制。 | A04、A06–A12 |
| 持久接纳/对账 | 新增 `H/runtime/executions/execution-store.test.ts` 与 `packages/host-service/test/integration/automations.integration.test.ts`；使用真实SQLite、重开、并发请求、异参同ID、快照/游标一致和真实失败，复用 `test/helpers/create-test-host.ts`、`scenarios.ts`。 | A05、A08–A10、A12–A14、A19、A26–A27 |
| 原生命令与结果 | 扩展 `C/commands/commands/commands-recovery.test.ts`、`C/sessions/live-session/live-session-failure.test.ts`、`C/journal/journal/journal.test.ts`、`C/projection/projection.test.ts` 及Claude/Codex现有adapter测试；防止合成失败被当停止，校验重复/旧报告、答案归属和重放。 | A14、A17–A22 |
| 真实进程与准备 | 新增 `H/runtime/executions/execution-recovery.node-test.ts`，采用独立Host进程、临时DB、真实受控shell/daemon，覆盖外部动作前后崩溃、setup/precheck、占用与停止；沿现有Electron-as-Node runner运行，不能只清内存Map冒充OS进程重启。 | A13、A15–A16、A21–A22、A28 |
| 自然语言与UI | 真实Desktop Claude/Codex工具预览/确认/创建，终端两agent的skill/CLI，Run详情、问题回答、归档、断线、Profile与通知；结合现有profile-projection/use-profile-navigation/attention测试保护相关变更。 | A01–A03、A05、A18、A20、A23–A27 |
| 原生实机证明 | Claude/Codex分别用明确授权的临时任务验证报告、等待、取消、fresh/reuse和恢复；记录真实provider/session/turn/operation关系。不能用fixture或默认skip的live文件替代。 | A01–A02、A14–A22、A28 |

真实端到端至少覆盖：一次性自然语言创建并查结果；保存周期任务但不启用；确认启用后离开页面仍触发；额外运行不改日程；必要setup失败不启动；等待回答后继续；取消与停止；Host在发送边界重启不重复启动；跨Profile定位结果。

允许用deterministic provider fixture验证协议异常，但它只证明适配契约。启动幂等还须观察真实资源身份与产物；停止须观察归属明确的实际进程/工具不再写入，另有无关sentinel进程不受影响。数据缺失或provider无法核实的场景预期就是unknown，而非强行让测试跑成成功。

### 6.2 已核实的测试和运行入口

当前工作区**没有** `apps/desktop/scripts/e2e/`；不沿用旧工作区文档中的不存在路径。现有Desktop基础是Bun/Happy DOM与CDP脚本。自动化场景先用一次性CDP smoke按 `.agents/skills/cdp-verification/SKILL.md` 执行；需要长期保护的真实竞态再保留专用 `apps/desktop/scripts/cdp-smoke-automations.ts`，不为“有测试”搭一套通用框架。

可用命令依据如下，均为未来执行项，本轮没有运行：

- `bun test src/commands src/sessions src/journal src/projection src/replay src/router src/stream`，cwd为 `packages/chat-runtime`，以及本次实际修改的adapter测试。
- `bun test src/rrule.test.ts`，cwd为 `packages/shared`；新增Host测试按其实际目录定向运行。
- `bun run --cwd packages/host-service test:integration`；`bun run --cwd packages/host-service test:e2e` 当前仅覆盖两个terminal测试，新增真实进程场景须明确接入后才能计入证明。
- `bun run --cwd apps/desktop dev` 或根 `bun run dev` 有实际入口；当前根没有 `dev:desktop`。通过受监督进程启动，并为测试实例选独立数据目录、renderer/CDP端口；核对实际workspace、URL、路由和认证实例。
- `bun run cli:dev -- <已实现的automations命令>` 沿现有开发Host发现；最终还需本分支构建CLI与Desktop针对同一隔离Host交叉读写，不能调用日常安装的旧CLI冒充新实现。
- 最后统一执行实际受影响包的类型/格式检查、相关测试与打包；新增文案运行 `bun run --cwd packages/i18n check`，覆盖所有启用语言。命令存在不等于结果通过，逐条记录真实退出与限制。

两个现有native live测试默认 `describe.skip`；必须显式受控启用或用真实smoke证明。`packages/cli/scripts/headless-e2e.sh` 是Linux抛弃式环境入口且会清理HOME配置，**不得在当前用户机器运行**。现有CDP integrations脚本带旧云端假设，仅参考交互方式，不照抄认证/组织配置。

### 6.3 发布、观察和回退

1. 实施期只用隔离环境；不导入或自动启用旧云端Automation数据，不在迁移中触发工作。所有新安排默认暂停，能力表仅公布真实完成并验证的接口。
2. 交付前收集28项验收的证据索引：每项明确是真实provider/UI、真实Host/SQLite/进程或确定性计算；未覆盖项不得标通过。安排一次聚焦端到端和核心安全的独立review，不要求为了小文案无限延后。
3. 通过仓库发布流程统一Desktop/Host/CLI兼容版本，先在隔离试用环境验证升级，再由用户明确授权启用选定安排；本计划不自动创建release或部署。无新云feature flag或遥测平台。
4. 运维可见性来自现有日志与运行详情：记录主体ID、阶段、稳定错误码、时间和对账结果，不记录秘密/完整prompt。若发现重复启动、错误成功、未知占用丢失，立即暂停受影响安排的新触发，保留证据。
5. 回退前暂停未来触发，核实在途执行及停止状态，再按原发布流程降级二进制；不靠kill整个Host或删除worktree结束任务。新增数据库记录保留，旧版不认识的安排在降级期不会执行，不声称旧版能恢复新状态；迁移前后副本验证这一边界。
6. smoke证明后移除本次一次性探针/脚本和仅为测试创建的资源；保留证据，正常用户workspace/会话不在清理范围。更新SDK、CLI help、skill、相关文档和实际发布说明；不提前声称未实现的Workflow、远程调度或全部#36/#37验收完成。

## 七、作者与审批状态（Author + Status）

- **作者：** agent；依据已接受intent/spec、当前源码与两片只读集成调研整理。
- **状态：** `accepted`。依据负责人 xchunzhao 在本 session 的明确回复“接受”记录人工决定，允许执行M0及后续实现。风险与证明要求保持不变；没有虚构其他工程或安全签核人。
- **起草阶段记录：**记录用户接受spec；核对真实源文件、旧SDK残留、原生操作边界、现有时间工具与验证入口；该阶段仅写审批记录和计划，没有修改功能代码、运行项目检查或启用任务。
- **实施边界：**按已接受计划开展隔离验证和实现；若只需工程细节调整，在plan内记录；改变已接受产品行为/范围则先更新spec并重新审批。测试使用独立Host数据、临时项目与明确授权的provider能力，不修改旧会话或启用日常定时任务。

## 八、实施记录：M0 原生验证受环境阻塞

2026-09-28，计划接受已记录为 `939b866e6`。工作区基线无未提交改动；已执行 `bun install --frozen-lockfile --ignore-scripts` 安装隔离工作区依赖，未运行仓库setup、迁移、日常Automation或发布操作。

| 探针 | 实际观察 | 结论边界 |
| --- | --- | --- |
| Claude SDK 0.3.201 / CLI 2.1.250 | SDK初始化并声明两个受控probe工具，取得session身份；未收到工具调用或最终报告，90秒探针期限触发Abort，探针退出2。 | 工具声明可见，不代表真实模型调用已完成；“aborted by user”来自探针的超时Abort，不是用户取消。 |
| Codex CLI/app-server 0.153.4 | 导出实际JSON schema；initialize、account/read可用；`requiresOpenaiAuth:false`，使用当前floway配置，无需据“Not logged in”强制OpenAI登录。 | 协议与配置读取已验证；不能把初始化当业务执行成功。 |
| Codex真实工具回合 | 接纳带两个dynamicTools的临时thread和turn，模型gpt-6-astra；随后持续重连。60秒期限后turn/interrupt收到回执，原turn出现interrupted，server退出0；输入/报告工具均未调用，探针退出2。 | 观察到该未执行工具回合的中断和server退出；尚未验证真实工具、结果、审批、resume或活动工具子树停止。 |
| 配置的模型网关 | Claude指向localhost:8080；Codex的floway provider指向localhost:5174；两个地址的连接均返回ConnectionRefused。 | 当前阻塞是已配置网关不可达，不是已经证明agent不支持，也不是Codex必须登录。 |

已核对Choros发现的provider配置和默认Codex登录状态；没有擅自切换账号或网关。现有copilot-gateway仓库文档描述的是另一个需要独立初始化/授权的服务，不将其猜作这两个已配置服务并替用户启动。

上述网关不可达只阻塞真实provider联调，不再阻塞功能开发。负责人随后明确要求继续，并允许使用mock；现按M0修订在协议边界使用fixture，推进M1–M5，真实联调另行跟踪。不重配provider、不要求用户先修复网关，也不把fixture结果冒充真实模型执行证据。

原始探针输出和无凭据的探针源码保存为本session的 `local://automation-m0-evidence.json`；所有受监督探针均已退出。该记录仅为实际进度与阻塞证据，不表示任何功能验收通过，不改变已接受范围。

## 九、实现与验证记录（协议层 fixture）

已按用户批准的mock边界完成源码实现：共享契约、Host领域记录及Drizzle迁移、幂等确认/接纳、准备脚本与precheck、原生工具/执行驱动、持久报告/问题/取消/恢复、定时和有限重复、CLI/本机SDK、Desktop管理与Profile/通知投影。fixture仅从testing入口或构造参数注入；生产registry仍只有真实Claude/Codex adapter，没有假成功或失败后切mock的回退。

### 已执行的证明

| 验证 | 实际结果 |
| --- | --- |
| Host运行时、真实SQLite、准备脚本及完整协议链路 | 59项通过，0失败，3个文件；包括回答后完成、取消后迟到答案拒绝、precheck真实非零不启动provider、有限轮次/overlap、确认幂等与调度恢复反例。 |
| 原生runtime/会话/journal/provider协议回归 | 140项通过，0失败，2项live测试跳过，27个文件。跳过项不算真实provider验证。 |
| 日历/时区/间隔计算 | 60项通过，0失败，2个文件。 |
| Profile投影/导航/attention回归 | 13项通过，0失败，3个文件。 |
| 类型与格式 | Host、chat-runtime、CLI、SDK、Desktop类型检查通过；修改源码已按Biome格式化。lint仍有非空断言等warning，未使用unsafe自动修复或压制诊断。 |
| 语言 | 新增175条消息覆盖17个发布语言；最终零缺译，严格编译及陈旧翻译检查通过。完整i18n check在末尾未提交catalog差异检查返回非零，不能记作整条命令通过。 |

真实Desktop开发构建在独立HOME/CHOROS_HOME_DIR与专用端口启动。通过实际点击/输入完成：创建临时项目、预览并确认一次性工作、创建真实worktree、执行precheck得到exit 7、查看持久Skipped详情及输出，再把未来安排改成每60秒/最多3轮并保存暂停。CLI读取同一Host，确认当前定义revision=2、原Run仍保留immediate快照和Skipped状态。没有启用日常定时任务，也未用虚构报告把Skipped显示为成功。

实际UI还验证了：在Run详情切换到另一个Profile后回到该Profile的安排列表；完成的一次性工作可从历史访问并编辑为重复安排。测试使用现有development认证绕过，不验证登录流程或OS通知最终送达。原始浏览器hash跳转会被现有persistent-hash-history恢复，未把这种诊断导航冒充Electron通知深链的端到端证明。

### 核心审查及修复

独立只读审查发现并修复了4项Host调度问题和5项原生执行安全问题：恢复锚点、实际截止、旧运行覆盖新安排、有限额度补跑选择；以及Claude原生批准选项、Codex失效管理审批、普通Chat命令越过受管会话归属、reuse持久身份/账号/占用校验、仅关闭父进程误报静止。两位审查者复核原发现均已关闭；其意见是静态审查，不代替上表的运行证据。

调试期间发现Bun的嵌套asymmetric matcher会把被匹配事件的id替换为matcher对象，导致测试用错误approvalId等待。最终移除该无必要ID matcher，保留实际允许/拒绝行为断言与完整await清理；没有用超时race伪装通过。

完整记录为 `local://automation-implementation-evidence.json`，截图保留在隔离验证目录。真实Claude/Codex模型调用仍单独标记未验证，不阻塞本轮代码实现，但不宣称已经完成生产模型联调、打包发布或全部#36/#37验收。

## 十、本地编译试用交付（2026-09-29）

- 实现代码提交 `94595bb8d`；试用中发现有限轮次预览未限制条数，已以回归先复现，再修复为当前剩余轮次上限，提交 `bbeb83a9c`。Host相关60项回归通过、0失败，Host类型检查通过。原有尚余轮次为0时预览为空，不承诺不存在的未来执行。
- `bun run compile:app` 已成功生成main/preload/renderer、匹配的独立CLI二进制和PTY daemon bundle；这次验证使用编译产物与静态renderer服务，不是仅靠源码开发服务器展示。
- 实现提交后重新执行完整 `packages/i18n` 的 `bun run check`，包含最终catalog clean-diff门槛，退出0；17种发布语言无缺译。
- 试用启动器位于 `/Users/xiaochunzhao/.choros-automation-trial/Start Automation Trial.command`。独立HOME、Host数据、Electron userData和Agent配置均在同一trial目录，不覆盖安装版或复用日常窗口锁；入口标记为开发试用，不是签名安装包或正式release。使用现有development认证绕过，不声称验证登录。
- 实际UI新建 `Automation Sandbox` 项目和一个“试用示例（未启用）”：每小时、最多3轮、保存暂停。重新构建后确认预览恰为3个时间；手动触发的受控precheck退出7，显示 `skipped/precheck_false`、原始输出和无provider会话／结果。匹配的编译CLI读取同一Host，确认state=paused、usedRounds=0及相同Skipped历史。
- 界面留在Automation列表供用户试用；受监督进程名 `automation-trial`。截图 `~/.choros-automation-trial/trial-overview.png`、`trial-run.png` 与 `build-info.json` 保留版本/隔离信息。该示例没有启用定时派发，也没有调用真实模型；真实provider联调仍是单独未验证项。

## 十一、Experimental 入口开关（2026-09-29）

按负责人本轮明确要求，把Desktop Automation界面放入 `Settings → Experimental → Automations`，默认关闭。复用现有Zustand persist实验偏好和设置搜索，新增一个固定大小布尔键并登记持久化白名单；不保存业务实体，也不改Host调度/CLI/SDK/Agent工具的权限或运行状态。

展开与收起侧栏共用开关；列表和Run详情由同一个父路由门控。关闭后访问相关页面转到Experimental设置；Settings的Back/Escape在原页面被禁用时回到工作区列表，初始返回路径也使用当前真实的 `/v2-workspaces`，不落到已退役的 `/workspace`。

验证：22项设置搜索、持久键与返回导航回归通过，Desktop类型检查通过；两条新文案覆盖全部17种语言并严格编译；试用构建完成。实际点击验证默认关闭、设置搜索发现、开启后可进入列表/详情、收起侧栏入口、关闭后两种侧栏均隐藏、从Run详情关闭后Back正常返回工作区。开关前后用编译CLI读取Host，任务ID、revision/version、暂停状态、已用轮次及原Run身份/状态均未变化。没有启用任何计划或调用模型。

试用实例更新后保留在Experimental页且开关关闭，截图为 `~/.choros-automation-trial/experimental-automations.png`。这项只改变功能展示范围，不宣称同时完成此前提出的统一Agent选择和整体UI重设计。
