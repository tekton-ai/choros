---
artifact: plan
feature: work-profiles
author: xchunzhao-and-agent
status: accepted
created: 2026-09-07
intent: ./intent.md
spec: ./spec.md
---

# 实施计划：工作档案（Work Profiles）

> **本计划已获人工接受。** xchunzhao 于 2026-09-07 表示“没啥问题继续吧”，并在迁移高风险说明后明确选择“确认，开始实施”，授权记录工程接受及技术负责人对迁移方案的签核。本文依据已接受的 [intent](./intent.md) 与 [spec](./spec.md)，整体替代旧计划；审批不等于功能已经实施或验证通过。
>
> **源码核对基线：`origin/main` 的 `527ec4ea1`。** 规划阶段只修改审批文档；实施前已刷新 main，确认基线未变。保留旧分支未提交实现，不合并旧分支历史；本次直接在基于该 main 的当前干净分支实施获批功能。

## 先看实施决定

1. **一份本地注册表，一套归属规则。** Desktop SQLite 保存 Profile；项目和独立会话直接归属，项目工作区继承。普通界面消费投影，原始 Host 数据、窗格和运行时不按 Profile 拆分。
2. **先打通统一切换，再接各入口。** 主动切换、普通历史、通知/外部链接、创建完成是不同意图，由同一个窗口级协调器处理，避免各组件互相纠正路由。
3. **创建结果和归属结果分开。** Host 已创建成功而本地归属失败，不得进入原有的“创建失败→再创建”路径。项目使用 Host 现有的 `created` 标志；独立会话只把归属写到正式 ID。
4. **访问记录从实际打开开始记。** 现有 history 不能提供可靠访问时间，旧 `last-active-v2-workspace` 也没有运行消费者。不从这些来源补造最近访问记录。
5. **后台资格不变，显示范围改变。** 保留原有通知、bindings、端口和 Dock 来源；从已有状态按 Profile 聚合，不为每个 Profile 建一套查询。
6. **只做当前本地 Desktop。** 不增加组织、Tasks、Automations、Pages、远程多 Host、Mobile/Web、V1/V2 产品开关或 GitHub 同步。源码现存的 `v2` 路径继续沿用，不做无关改名。

## 涉及的文件

为缩短长路径，以下表格使用这些前缀；“新增”表示拟创建，其他路径均为本轮核对的现有入口：

- `D` = `apps/desktop/src`
- `R` = `apps/desktop/src/renderer`
- `A` = `apps/desktop/src/renderer/routes/_authenticated`
- `B` = `apps/desktop/src/renderer/routes/_authenticated/_dashboard`
- `S` = `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar`
- `C` = `apps/desktop/src/renderer/routes/_authenticated/components/dashboard-new-workspace-modal`

### 本地模型与服务

| 文件 | 变更内容 |
|---|---|
| `packages/local-db/src/schema/schema.ts` | 新增四张本地表及约束，见下文；现有 `src/index.ts`、`src/schema/index.ts` 已通配导出 schema，不再增加无用导出层或不存在的 relations 文件。 |
| `packages/local-db/drizzle/` | 用 `bun run db:generate:desktop` 生成下一条增量迁移及 `meta`；当前末项为 `0054_add_terminal_copy_on_select_setting`，不预写下一条编号，不手改生成文件。 |
| `D/main/lib/local-db/index.ts`；新增同目录 `run-migrations.ts`、`run-migrations.test.ts` | 明确迁移原子边界与可报告的结果；失败不再打印“完成”。保留目录解析、WAL、UUID 函数及现有全局外键设置。 |
| 新增 `D/main/lib/profiles/profile-store.ts`、`profile-store.test.ts` | 可注入本地数据库的唯一服务：定义管理、归属、删除、访问记录、选择、版本化快照及事务后事件。 |
| 新增 `D/shared/profiles.ts` | Desktop 内共享的有版本纯数据契约、成员判别类型和校验 schema；不依赖 Electron/数据库连接，不放入 Host 或云端包。 |
| 新增 `D/lib/trpc/routers/profiles/index.ts`；`D/lib/trpc/routers/index.ts` | 注册 `electronTrpc.profiles` 查询/变更/`onChanged`，沿用 `publicProcedure`、结构化错误与 observable 清理模式。未来快照写回先作为服务能力，不新增导入界面或网络 API。 |

### 共享投影、侧栏与后台状态

| 文件 | 变更内容 |
|---|---|
| 新增 `A/providers/profile-provider/profile-provider.tsx`、`index.ts`，及其 `utils/profile-projection/`、`hooks/use-profile-navigation/` | 稳定的窗口 Profile 状态、归属解析、可见项目/工作区投影、统一导航与失效回退。纯策略的行为测试与实现同目录。 |
| `A/layout.tsx`；新增 `A/components/profile-navigation-controller/` | 在 `HostWorkspacesProvider` 内挂载 ProfileProvider，覆盖创建弹窗、工作界面与通知导航；把通知跳转移到可读 Profile/原始数据的子层。不按 Profile 给 provider 子树换 key。 |
| `S/hooks/use-dashboard-sidebar-data/use-dashboard-sidebar-data.ts`；`S/dashboard-sidebar.tsx` | 分离原有后台资格集合和当前 Profile 的 groups/pinned/sessions/tags；可见选择、拖放、快捷入口随投影更新，切换时去掉已不可见的批量选择。 |
| `S/components/dashboard-sidebar-header/dashboard-sidebar-header.tsx`；新增其 `components/profile-switcher/` | 展开分支在窗口控制/导航行之后、新建按钮之前插入；收起 rail 在新建按钮之前保留控件。手势仅绑定此控件，沿用现有缩放、drag、fill 与焦点样式。 |
| 新增 `A/components/profile-manager-dialog/`、`A/components/move-to-profile-menu/` | 稳定挂载的管理模态框与共用移动入口；组件各有同名文件和 barrel，子组件/依赖按使用范围就近放置，不挂到移动后会消失的行子树上。 |
| `S/components/dashboard-sidebar-project-section/components/dashboard-sidebar-project-context-menu/dashboard-sidebar-project-context-menu.tsx`；`S/components/dashboard-sidebar-workspace-item/components/dashboard-sidebar-workspace-context-menu/dashboard-sidebar-workspace-context-menu.tsx`；`B/v2-workspaces/components/v2-workspace-context-menu/v2-workspace-context-menu.tsx` | 覆盖侧栏展开/收起、工作区列表与 board 卡片的菜单；项目和独立会话可移动，项目子工作区不出现独立移动项。 |
| `S/providers/dashboard-sidebar-workspace-status-provider/dashboard-sidebar-workspace-status-provider.tsx`；`R/hooks/host-service/use-v2-notification-status/use-v2-notification-status.ts` | status provider 输入继续使用未被 Profile 筛掉的原有合格工作区；从已有 attention 来源提取去重工作区并分桶，保留稳定缓存和逐行订阅。 |
| `A/components/v2-notification-controller/v2-notification-controller.tsx`；`A/components/dock-badge-controller/dock-badge-controller.tsx` | 保留原有通知、声音和 Dock 总数；共享 attention 结果，不让 Profile 切换卸载这些控制器。 |
| `S/hooks/use-dashboard-sidebar-ports-data/use-dashboard-sidebar-ports-data.ts` | 若端口菜单展示工作区对象，在显示出口应用当前 Profile；保留原有资格、enabled 条件、批查与轮询。 |

**明确不改其语义的边界：** `A/providers/collections-provider/collections-provider.tsx` 的 `LOCAL_PROFILE_KEY = "local"`，原始 `HostWorkspacesProvider`/`useHostProjects`、`A/hooks/use-visible-sidebar-workspace-ids/use-visible-sidebar-workspace-ids.ts` 的后台资格，以及既有 pane/runtime/PortsProvider 生命周期。禁止用这些来源的全局过滤代替 Profile 投影。

### 列表、导航与最近访问

| 文件 | 变更内容 |
|---|---|
| `B/v2-workspaces/hooks/use-accessible-v2-workspaces/use-accessible-v2-workspaces.ts`；`B/v2-workspaces/page.tsx` | 在普通搜索/筛选之前限界成员，统一结果、project options 和 maps；同步清理 store 与 URL 中越界项目，保留合法 session sentinel 和非归属筛选。 |
| `B/hooks/use-project-query-targets/use-project-query-targets.ts`；`B/components/project-filter/project-filter.tsx` | PR/项目 GitHub Issues 查询先限当前 Profile 项目，再应用用户筛选；项目下拉选项使用同一范围。沿用包含项目集合的现有 target key。 |
| `B/pull-requests/components/pull-requests-view/pull-requests-view.tsx`；`B/pull-requests/layout.tsx`；`B/pull-requests/$prNumber/page.tsx`；`B/project/$projectId/page.tsx` | 处理详情归属与列表筛选的区别；主动切换退出旧详情，取消旧 debounce，更新 filter store/URL；明确链接按原始项目身份激活归属后渲染。 |
| `R/lib/persistent-hash-history/persistent-hash-history.ts`、同目录 `.test.ts`；`B/components/navigation-controls/navigation-controls.tsx` | 增加按当前资格查找前/后目标的统一能力；按钮禁用态、原快捷键、鼠标侧键共同消费，不先跳错对象再补跳转。 |
| `R/index.tsx`；`B/utils/workspace-navigation.ts` | IPC `deep-link-navigate` 登记明确打开意图，交给已就绪的 Profile 导航边界；迁移相关直接导航调用方，保持当前 CLI 协议。 |
| `B/v2-workspace/$workspaceId/layout.tsx`、`page.tsx`；`B/v2-workspace/providers/workspace-provider/components/workspace-host-gate/workspace-host-gate.tsx` | 组合真实行、创建状态、Host 可达、worktree 状态、布局及导航身份，确认成功打开；不能仅用 mount 或 `ensureWorkspaceInSidebar` 记访问。 |
| `R/command-palette/ui/recently-viewed/recently-viewed-frame.tsx`；`B/components/navigation-controls/components/history-dropdown/hooks/use-recently-viewed/use-recently-viewed.ts` | 把仍被命令面板消费的最近访问 hook 接到 SQLite 访问记录，先按当前归属/可访问性筛选、去重，再限量；移除强制项目 inner join，包含独立会话。未挂载的 HistoryDropdown UI 不作为实现入口。 |
| `R/command-palette/core/context-provider.tsx`；`R/command-palette/modules/`；`R/command-palette/ui/` | 加当前 Profile 上下文及新建/管理/上一个/下一个命令；工作对象搜索、workspace frame、quick-create 与 add-project 命令沿用统一投影/提交边界，不复制创建实现。 |
| `S/hooks/use-navigate-away-from-workspace/use-navigate-away-from-workspace.ts` | 既有删除/归档后的候选不能跨 Profile；不把当前按侧栏顺序选择下一项的行为冒充 MRU。Profile 切换、移出当前对象与保存目标失效使用统一访问回退。 |
| 删除无运行消费者的 `R/stores/last-active-v2-workspace.ts`；`A/layout.tsx`；`R/lib/persisted-keys/persisted-key-registry.test-data.ts` | 接通真实访问后，删除死 store、通知前的 `lastViewedWorkspaceId` 写入及对应源登记；不读取旧值伪造历史，不清空其他 persisted state。 |

### 创建、导入与完成回调

| 文件 | 变更内容 |
|---|---|
| `R/stores/workspace-creates/use-workspace-creates.ts`；`R/hooks/use-quick-create-workspace/use-quick-create-workspace.ts` | 将 Desktop-only 提交上下文与 Host payload 分离；校验目标归属，独立会话在 canonical 成功阶段落归属；快速创建只在当前 Profile 内依次尝试 hint/已有默认/可用项目，无则打开创建界面。 |
| `C/components/dashboard-new-workspace-form/prompt-group/hooks/use-submit-workspace/use-submit-workspace.ts`；同层 `use-branch-picker-controller/use-branch-picker-controller.ts` | 在上传/构造 prompt 等 await 之前捕获提交上下文；共享完成守卫，防旧请求关闭新草稿、回填新目标或迟到跳转。 |
| `B/v2-workspace/components/workspace-create-error-state/workspace-create-error-state.tsx`；`S/components/dashboard-sidebar-project-section/hooks/use-dashboard-sidebar-project-section-actions/use-dashboard-sidebar-project-section-actions.ts`；`B/pull-requests/$prNumber/components/pull-request-code-tab/pull-request-code-tab.tsx` | 补齐其余直接调用方：失败重试、批量导入 worktrees、PR 后台创建。后两者继续不导航；归属失败不得进入 Host 创建重试。 |
| `C/components/dashboard-new-workspace-modal-content/dashboard-new-workspace-modal-content.tsx`；`C/components/new-workspace-screen/new-workspace-screen.tsx`；`R/stores/new-workspace-draft.ts`；`R/stores/v2-workspace-create-defaults.ts` | 弹窗/全页使用相同项目范围；切换时清越界目标并提示重选，保留名称、prompt、附件等非归属输入，不用 `selectSession` 或 reset 整份草稿替代。全局默认值只在消费时验归属，不复制全局设置。 |
| `R/react-query/projects/use-finalize-project-setup/use-finalize-project-setup.ts`；`B/components/add-repository-modals/hooks/use-folder-first-import/use-folder-first-import.ts` | 保留 Host 已返回的 `created` 判别；setup 明确为 existing。新项目才分配捕获的 Profile，已有项目保持归属。共享 finalize 返回真实创建/分类结果。 |
| `B/components/add-repository-modals/` 下的 `components/new-project-modal/`、`components/empty-project-modal/`、`components/template-gallery-modal/`；`R/stores/add-repository-modal.ts` | clone/空项目/模板完成贯穿请求身份，不能用旧回调结算当前单一 pending resolver；真实对象成功与归属失败分开显示。 |
| `C/components/dashboard-new-workspace-form/prompt-group/components/project-picker-pill/project-picker-pill.tsx`；`A/onboarding/project/page.tsx` | 回填/打开项目之前核对请求仍被等待及真实归属；已有项目必要时先切所属 Profile。无 Profile 上下文的新建归 Default。 |
| `packages/i18n/locales/` 与上述新增/改动文案 | 使用 Lingui 显式 ID，生成 `.po` 与已提交的 `.ts` 目录产物，完整翻译全部 `SUPPORTED_LOCALES`。用户名称保持原文。 |

文件夹导入的六个现有消费入口——侧栏 header/workspaces-header、命令面板 `folder-import-mount`、`A/components/file-menu-listener/file-menu-listener.tsx`、project picker、onboarding——均以共享 hook 为创建边界；仅原本需要选择/打开结果的入口处理完成导航。设置里的已有项目 setup/relocate 保持归属，不强行迁入新建流程。Host 的 `CreateResult.created`、CLI 深链接和 Host schema 均无需新增 Profile 字段。

## 工作顺序与契约

### 1. 建立增量模型与原子迁移

新增以下四张表，全部位于 `CHOROS_HOME_DIR/local.db`，不含组织字段或 Host 实体外键：

| 表 | 必须表达的数据与约束 |
|---|---|
| `profiles` | 稳定 ID、显示名称、规范化判重键、排序、内置默认身份、时间戳。默认身份设唯一约束，名称键唯一；事务性初始化补足“至少一个 Default”，服务禁止删除默认。 |
| `profile_memberships` | 只允许 project/session 两种直接成员；项目键为现有 `projectKey`，session 为 `hostId + workspaceId`。带类型的引用唯一，项目键不与 session 键碰撞。只保存显式非默认归属。 |
| `profile_workspace_visits` | `(profileId, hostId, workspaceId)` 唯一，保存最后一次真实成功打开时间并支持倒序查询；重复打开更新同一行，不无限追加。 |
| `profile_registry_state` | 单行状态：递增变更 revision、安装实例最近选择的 Profile。当前窗口选择不写成一个所有窗口必须跟随的状态。 |

名称显示值为 trim 后原文；以 Unicode 码点计算 80 上限，NFC 规范化后按统一、与系统语言无关的大小写规则生成判重键。UI 与主进程共用算法，数据库只对该键建唯一约束；不依赖仅处理 ASCII 的 SQLite `NOCASE`。排序事务接收完整且不重复的 Profile 顺序。

**迁移决定：** 保留 Drizzle 的迁移文件格式、读取器、hash 和时间戳选择规则；以一个同步 SQLite 事务执行迁移日志表初始化、待运行 SQL 和日志写入。不是在现有 `migrate()` 外直接套事务：已核对 [drizzle-orm 0.45.2 的 SQLiteSyncDialect](https://unpkg.com/drizzle-orm@0.45.2/sqlite-core/dialect.js)，它在内部执行 `BEGIN`，而日志表初始化在该事务外。嵌套 `BEGIN` 会失败，也不能证明空库失败后完全回到原结构。小型 `run-migrations` 只补这条原子边界，不实现第二套迁移格式或更改历史迁移。

保留现有 `foreign_keys = OFF`，不为了 Profile 改变旧数据库全局行为；Profile 引用完整性由同一服务事务校验/维护，不能只声明外键后假设已生效。失败如实报告，并让 Profile 服务返回明确不可用状态。该降级只处理 Profile 注册表不可用，不承诺修复无法打开的整个数据库或已损坏的旧业务表。

**本步证明：** 对空临时库、功能前迁移链构造的库分别成功迁移；在 Profile DDL 中间注入失败，比较完整结构与迁移日志均不变，再重跑并重新打开。生成迁移前读当前迁移指引；不运行云数据库生成/迁移命令，不访问共享用户数据库。

### 2. 建立唯一 Profile 服务边界

依赖步骤 1。服务以短同步事务实现读取/初始化、创建、重命名、重排、批量移动、删除、访问 upsert 与选择保存。每次变更提交后才发布 revision 事件；失败零部分提交。Electron 路由沿用现有 observable 的订阅/解绑模式，不依赖新通道。

- Default 惰性创建；没有显式成员或引用的 Profile 已失效时，读取按 Default 解析。移入 Default 删除显式成员行。
- 非空普通删除拒绝；“全部移至 Default 后删除”在一笔事务内移除成员归属、处理该 Profile 的访问/选择引用，再删定义。确认后再执行时重新核对事务内真实状态，不能相信旧 UI 数量。
- 管理候选来自原始项目/独立会话及持久成员并集；Host 缺失时保留类型、稳定 ID 和归属，不能按空查询结果判空、剪除或重分类。
- 批量移动使用同一成员校验；不将项目子工作区写成独立 session，不通过改 sidebar 分组模拟归属。
- 读取失败返回明确 `unavailable`，UI 只显示合成 Default 和恢复提示，禁用不能完成的写操作；恢复后重读真实数据，不覆盖为新空注册表。
- 错误使用稳定 kind/code 区分名称冲突、不可用、目标失效、非空删除等，不依赖翻译后的错误文本分类。沿用 tRPC 错误边界；名称、对象标识和 SQL 参数不进入日志/分析错误消息，不新增 telemetry 服务。

**快照是本步交付，不是以后补齐：** 格式版本与运行时 revision 分离。序列化覆盖定义、顺序、显式成员、访问记录、最近选择；写回先整体校验，再一笔事务替换。稳定 ID 保留，相同数据重复写回不产生重复对象；未知版本、重复身份、缺少/多个默认、重复名称及所有悬空 Profile 引用整体拒绝。校验不要求 Host 在线；不做跨设备 ID 协调。正常 UI 读注册表/按需访问记录，不能每次打开工作区都向所有窗口广播完整访问历史；事件只携带必要 revision/变更类别并刷新相关读模型。

### 3. 建立窗口状态、投影和统一导航

依赖步骤 2；先确定本节契约，再接 UI。

- `ProfileProvider` 在原始本地 providers 内稳定挂载。注册表共享，`activeProfileId` 属于当前 renderer；仅初始化时读取最近选择。定义/成员事件刷新所有窗口，但不覆盖仍有效的选择；被删的当前 Profile 回 Default。
- 选择即时更新内存投影，不等待云/Host 请求；同一窗口选择持久化按序处理，并用请求身份丢弃过期响应，避免 A→B→C 的旧结果覆写 C。持久化失败明确提示，不用迟到错误把窗口回切；新窗口按最后成功保存的选择初始化。
- 一个纯归属解析器处理 projectKey、session 复合键、项目继承和隐式 Default。原始查询负责身份与可达性；可见投影负责普通工作界面，二者不能互相替代。
- 每次导航标明意图与递增操作身份。主动切换/成员移出使用规格的回退表；普通历史只寻找当前 Profile 或全局目标；通知/外部链接先用原始身份选归属；创建完成必须同时满足原请求仍被等待、路由和 Profile 未被更新意图替代。
- 路由切换期间不渲染“新 Profile 名称 + 旧归属详情”。旧路由未卸载不等于新的明确打开请求；协调器不能把用户选择反向改回去。
- 工作区详情切换按成功访问时间找目标 Profile 最近仍可访问的记录，跳过已删除/归档/移出项，没有记录去工作区列表；列表保留页面并清越界筛选，项目详情退工作区列表，PR 详情退 PR 列表，设置/插件不跳转。
- 工作区成功记录须满足：正式行存在、不是 pending/failed create、Host 实际可达、没有 missing worktree、必要状态/布局可用、导航身份和归属仍匹配。每次真正打开确认一次，普通 refetch/rerender 不刷访问时间；旧导航迟到不覆盖新记录。

`WorkspaceHostGate` 不可达时仍挂载子树，因此不能仅靠组件 mount 判断成功；现有 history 恢复时重建 timestamp，也不能作为真实访问来源。保留既有 CLI 行尚未到达时的 `useWorkspaceMissVerdict` 查找窗口。

### 4. 接通切换器、管理器与侧栏闭环

依赖步骤 3。菜单、方向键、手势与命令面板均调用同一个选择入口，使用同一排序，不循环；仅 Default 时仍显示控件且能创建。

切换器展开/收起只是展示差异：长名截断但完整 tooltip/无障碍名称可读，有焦点和状态播报，支持减少动态效果。横向 wheel 与 pointer/touch 使用同一“一次手势一次切换”判定；排除纵向、pinch/ctrlKey 输入，不占用窗口拖动区域。阈值以真实触控板/缩放验证后确认，不在文档假定已验证的数值。

管理器共享服务校验，项目显示本地路径帮助区分同名；允许搜索、批量移动、重命名、重排。空 Profile 删除也须确认；非空仅可确认移至 Default 后删除，显示项目/session 数量及“运行不中止”的影响。新建 Profile 不自动移动内容或强制切换。Host 暂不可用的显式成员仍参加计数和删除判断。

侧栏在构造可见分组/标签之前应用投影；保留原始合格 `statusWorkspaces` 给后台。固定项和项目组中的同一工作区不重复计数。切换不得导致隐藏选择残留并被批量操作。

### 5. 接通所有创建与导入入口

依赖步骤 2–4。所有新建使用提交动作开始时捕获的 `{profileId, requestId}`，与 Host input 分开；在真正提交前重新检查项目属于捕获的 Profile。发生 await 后不能改读最新 Profile 来重解释旧提交。

- 弹窗/全页切换保留非归属草稿，清越界目标并提示重选；初始化 effect 不得再次塞入全局默认项目。快速创建失效 hint 只能继续尝试当前 Profile 的有效候选。
- `useWorkspaceCreates` 的六个直接调用方全部迁移：quick create、表单提交、branch picker、失败重试、批量导入 worktrees、PR `sendCommentToAgent`。项目工作区继承项目，不产生独立成员；独立会话临时归属只存在待创建内存状态，正式归属写 canonical ID。
- Host 成功后把归属失败作为单独成功对象结果返回：保留对象在 Default，显示实际结果与重新选择归属的恢复动作。不能 throw 进现有删除 optimistic state/写 failed-create 的 catch，不能诱导重复创建。
- 正常 canonical 跳转复用统一请求/路由守卫；后台批量导入和 PR 创建保持不导航。旧提交不得关闭新弹窗、重置新草稿或结算新 resolver。
- 项目 `create` 返回 `created: true` 才分配；`created: false` 或 `setup` 保留原归属，即使先前 `findByPath` 返回空。clone、空项目、模板、文件夹导入、onboarding 均通过明确的新旧判别收尾。
- 重新导入已有项目若原入口仅提示成功，则继续不跳转；若 picker/onboarding 确实需要选择/打开它，且用户仍在等该结果，先选所属 Profile。不因后台完成强拉窗口。
- 没有窗口上下文的新建归 Default。重试真正失败的创建按新的显式提交上下文检查；归属修复只重试本地移动，绝不重试 Host create。

### 6. 完成列表、历史、命令与明确打开

依赖步骤 3、5。本节和步骤 7 可在统一契约稳定后分工，但共享 ProfileProvider、导航入口和 attention 边界由一个集成负责人合并；不得各自写第二套规则。

- 工作区列表/搜索/options/maps、项目页、PR 列表、命令面板工作对象统一限界；不能只过滤最终行。PR/Issues 的用户查询目标在发请求前限制；已有 Host-wide 状态 enrichment 缓存不按 Profile 重建。
- 同时清理 workspace/PR filter store 和 URL；保留合法 session 筛选标记。PR 的 `project`（详情身份）与 `projects`（列表筛选）分开处理，主动切换取消 debounce，不调用会保留旧详情的导航闭包。
- history 按实时归属找目标，保留原始历史游标与 push 截断 forward 的语义；按钮、原热键和鼠标侧键无合格目标时都不可执行。
- 最近访问从成功访问记录筛选、去重后限量 20，包含 session；不再依赖历史尾部逆序或项目 inner join。移除失效的旧单目标状态代码与源登记，保留无关持久状态。
- 外部协议入口先登记意图，Profile 数据未就绪时等待现有身份查询，确认缺失才沿用缺失页面。CLI 不新增 Profile 参数；通知带 source 的明确打开由步骤 7 完成。

### 7. 保持后台提醒并完成通知定位

依赖步骤 3–4，可与步骤 5–6 的独立界面工作并行。

- 保留 `useVisibleSidebarWorkspaceIds` 引入前的资格：原本 hidden/归档/未加入侧栏的对象不因 Profile 被额外订阅，其他 Profile 的原合格对象也不能退出。
- `V2NotificationController` 的 Host 订阅、sidebar bindings/status、端口 provider 与 Dock controller 不随 Profile 重建；现有缓存 key 不追加 Profile ID。
- 从已有 bindings cache 和 manual-unread 状态得出去重 attention 工作区集合，Dock 用总量，Profile 控件按归属分桶；共享现有状态观察，不为每个 Profile 新建 cache observer 或网络查询。待输入沿现有 `PendingQuestion → PermissionRequest`，不新造通知协议。
- 当前通知点击只导航工作区，未消费 `event.data.source`。本次须补齐：原始目标解析→选择归属→打开工作区→依据现有 notification target resolver 定位对应 pane；pane/layout 缺失时保留已有 terminal-only fallback，不伪造窗格。
- 仅切换 Profile 不标已读；继续用实际激活 pane/workspace 的 seen 规则。终端、agent、开发服务器继续运行，Dock 总数与声音语义不变。

### 8. 翻译、集成验证与发布门槛

依赖全部步骤。先完成定向回归与真实 Desktop smoke，再统一运行完整检查、提取/翻译和 canary 验证；中间里程碑不等于可交付版本。

完成新文案的显式 ID、全部已启用语言、生成目录产物及真实无障碍验证。各切片仅保留能防住真实行为回归的测试；不按按钮个数新增 mock 转发测试，不断言源码文本或内部字段复制。清理本次临时 smoke 脚本/数据，不新增无关说明文件；实现 PR 链接本文。

## 风险与人工审查

| 风险 | 可能性 / 影响 | 控制与审查人 |
|---|---|---|
| 全局本地迁移启动边界变化 | 低 / 高，旧设置与数据库启动受影响 | 全旧迁移链、空库/升级库故障注入、日志与 DDL 原子回滚、真实 native SQLite 验证。**技术负责人/架构负责人接受前必须审查**；不把产品接受当作技术通过。 |
| SQLite 外键实际关闭、Unicode 判重差异 | 中 / 中，非法引用或重名 | 同一主进程事务维护引用；规范化键唯一，覆盖非 ASCII、NFC 等价、80/81 码点及批量写失败。 |
| 导航/创建的迟到结果与旧闭包 | 高 / 高，串档或重复创建 | 单一意图/request identity；六个 workspace submit 与项目 modal resolver 全覆盖，创建和归属错误分离。工程负责人审查。 |
| “成功打开”条件不完整 | 中 / 中，错误最近访问与恢复 | 不以 mount/history/updatedAt 推断；真实不可达、missing worktree、CLI 延迟行、取消导航验证。ready 条件若需改变产品语义，先回规格评审。 |
| 过滤导致后台通知丢失或监听增长 | 中 / 高 | 留原资格，记录实现前后实际 observer/listener/请求数量；不能把源码注释中的理想数量当基线，也不顺手重构已有重复订阅。技术负责人审查。 |
| Host 暂不可用被当删除 | 中 / 中 | 保留持久归属与访问记录；管理器展示不可用成员，空判定不依赖当前查询页。 |
| 手势、缩放和侧栏状态混淆 | 中 / 中 | 真实展开/收起 rail 验证；当前 fully closed sidebar 不挂载，不能把它与 collapsed rail 混称已覆盖。设计负责人确认阈值、长名、焦点、缩放和减少动态效果。 |
| 本地名称/成员标识进入分析错误 | 低 / 高 | 服务输出有界错误代码，不插入用户值/SQL 参数；保持目录 `0700`、文件 `0600`。安全/合规负责人审查本地分类非权限隔离的边界。 |
| 无远程开关与无数据库备份/向下迁移 | 有意选择 / 高 | 内部 canary 后再正式发布，问题版本回滚到上一 Desktop 构建，保留已提交新增表供前向修复。不得手改用户数据库。 |
| 未来快照被扩成同步产品 | 中 / 中 | 本轮完成同一安装实例标识空间的原子往返；没有网络适配器、导入导出 UI、跨设备协调或凭据。架构负责人审查。 |

## 验证证据与通过标准

**以下是实施后必须产出的证据，不是本轮已通过的声明。** 本轮仅核对源码、依赖实现、路径和审批状态，未启动 Desktop、未运行应用测试、未生成迁移。

### 定向自动化与 native smoke

| 证据 | 必须观察到的行为 |
|---|---|
| 新增 `run-migrations.test.ts` 及临时 native SQLite smoke | 空库、功能前完整迁移库成功升级/重开；DDL 中途失败结构和日志逐项不变，重试成功；失败不输出成功状态。 |
| 新增 `profile-store.test.ts` | 唯一 Default、隐式 Default、NFC/非 ASCII 重名、码点上限、默认不可删、非空拒删、批量移动失败零提交、移至 Default+删除原子、Host 缺失成员保留、快照重复应用及全部非法引用拒绝。使用真实临时 SQLite，不用事务 mock 代替。 |
| Profile 投影/导航纯策略回归 | 项目继承与 session 复合键；A→B→C 旧完成无权回切；明确打开能跨 Profile、普通历史不能；真实 MRU 失效回退，不选从未访问对象；失败/pending/取消不写成功访问。 |
| 扩展 `R/lib/persistent-hash-history/persistent-hash-history.test.ts` | A/B/全局混合栈的前后目标、成员移动后的实时资格、无候选禁用、原 push/replace/截断/持久恢复行为保留。 |
| 新增 `R/stores/workspace-creates/use-workspace-creates.test.ts`，扩展已有 folder-import 或 finalize 行为测试 | session 提交 A 后切 B、正式 ID 归 A且 B 不跳；归属失败保留 Default 对象且 Host 只创建一次；`findByPath` 空而 `created:false` 时仍保留原归属；旧 modal 完成不结算新请求。 |
| 现有 sidebar 构造、project-query-targets、PR filter/store 测试 | pinned/session/tags 正确投影、项目 options 同界、PR 请求目标不越界、旧 URL/store/debounce 不回灌。已有测试仅在消费契约改变处调整。 |
| 现有 `resolve-v2-notification-target.test.ts`、terminal-agent-status 与 `v2-notifications/store.test.ts`，必要的归属聚合回归 | terminal→pane/fallback、permission/failed/review/seen 规则保留，pinned+group 只计一次；无状态丢失或额外订阅的证明还须真实运行观测。 |

当前仓库已有测试注明 Bun 不能加载 Electron 构建的 `better-sqlite3`。因此 Bun 测试用可注入边界和真实 `bun:sqlite` 验证 SQL/领域行为；另在目标 Electron/兼容 native ABI 下执行同一迁移与服务 smoke，不能把 mock 通过或另一个 driver 通过当作 native 迁移已验证。临时脚本只操作独立临时目录，不读取或修改正在运行实例的用户库。

全部实现合并后统一运行：

```bash
bun run --cwd packages/local-db typecheck
bun run --cwd apps/desktop test
bun run --cwd apps/desktop typecheck
bun run --cwd packages/i18n extract
# 完成所有 SUPPORTED_LOCALES 的新增/变更翻译后：
bun run --cwd packages/i18n compile
bun run --cwd packages/i18n check
```

另按仓库 Biome 配置对实际改动文件运行检查。`i18n check` 会检查生成产物漂移，按现有目录流程先生成并纳入变更；不手改英文 catalog，不提交无关提取噪声。上述命令不替代下一节真实 UI 证据。

### 真实 Desktop 验收矩阵

使用 `cdp-verification` 的真实输入/截图规则：确认工作区、renderer URL/端口、路由和隔离 `CHOROS_HOME_DIR`，不误连另一个正在运行的实例。按当前本地 Desktop 登录/进入规则验证，不为了旧指引中的 active organization 或云 API 恢复已删除架构。每项记录截图与相符的路由/状态/计数；原生手势和系统通知如 CDP 无法完整驱动，人工补验并明确记录，不能以注入内部 API 冒充。

| 场景（对应 spec 验收表） | 操作与通过标准 |
|---|---|
| 升级、重启 | 功能前数据库副本升级：旧项目/session 均在 Default，无成员回填；创建/移动后重启，定义、归属、顺序、最近选择和真实访问仍在。 |
| 管理 | 创建 A/B，重命名/排序；测试同名不同路径项目、批量移动、默认不能删、空删除确认、非空普通删除拒绝与全部移至 Default 后删除；运行内容不终止。 |
| 切换交互 | 点击、原生横滚、pointer/touch、聚焦左右键、Enter/Space、命令一致；首尾不循环、单手势一次；纵滚/pinch/ctrlKey 不切换；反复横扫、停顿、快速反向均无循环更新错误。 |
| 显示范围 | A/B 各有项目、session、固定项、标签组；侧栏/工作区/项目页/PR/搜索/命令对象及目标选项不串档；无跨 Profile 空标签组；设置和插件全局。 |
| 创建/导入 | 弹窗、全页、quick-create、空项目/clone/模板/文件夹、命令、onboarding 入口覆盖；无可用项目不选全局首项；已有项目 setup/reimport 不移动。 |
| 竞态与分类失败 | 提交 A 后切 B，再关闭/重开创建界面；新对象仍归 A且旧回调不拉回/清草稿；canonical session 可找回；注入归属失败后实际为 Default、可修复且不重复 Host create；PR 后台创建不打开工作区。 |
| 访问恢复 | 真实打开多个工作区，删除/归档/移走最近项后依真实时间回退；从未访问项不被选；无记录去列表。Host 不可达、missing worktree、pending/失败/取消不写成功记录。 |
| 历史与明确打开 | 混合 A/B/全局历史，按钮/原快捷键/鼠标侧键跳过 B；最近访问先筛后限量且有 session；CLI 深链接含延迟行、跨 Profile PR/通知先选真实归属，不误报不存在。 |
| 后台工作和提醒 | A 中终端持续输出、agent/开发服务器运行，切 B 后不中断；触发 permission/failed/review/manual unread，A 徽标与 Dock 正确、无重复、不因切换 seen；通知点击先 A 后正确 pane。 |
| 多窗口 | 两窗口分别 A/B；一个窗口改名/移动，另一个刷新定义但保持有效选择；删除当前 Profile 正确回退；第三窗口按最近成功保存的选择初始化；快速连续切换不被旧保存结果覆盖。 |
| 离线/降级 | 断云仍能本地 Profile 管理；Host 暂不可用不丢显式归属、不能误判空；Profile 注册表不可用显示 Default+错误且禁假成功，恢复后重读真实注册表。 |
| 性能/订阅 | 在受支持 Desktop 硬件、原始数据已缓存时，记录输入→列表可见提交耗时，每次不超过 100 ms；记录数据规模和重复切换结果。切换前后原合格工作区 observer/listener/轮询请求数量不因 Profile 数量增长或缩减，原 hidden/archived 资格不扩张。 |
| 文案/无障碍 | 各发布语言无缺译；展开与收起 rail、不同缩放、macOS 窗口控制留白、长名提示、键盘焦点/状态播报、减少动态效果均在真实界面验证。 |

### 发布、监控与回滚

- 没有远程功能开关；中间提交可启动，但全部范围完成、自动化与真实 Desktop 证据、迁移/架构审查、设计及安全/合规边界确认齐备后才能发布。
- 由负责人选择已验收提交，按 `scripts/release-canary.sh` 发布内部 canary；脚本会推送临时分支并触发工作流，本次文档工作不执行。正式版本另按 `scripts/release/README.md` 在专用 release 分支发布。
- canary 观察启动/迁移失败、Profile 本地错误代码、渲染崩溃及前后订阅/查询数量；只用匿名计数和成功/失败，不采集 Profile 名称/成员标识，不新建分析平台或远程停用通道。
- 迁移失败立即停止发布，保留原结构/日志并走明确 Default 降级；已提交版本有 UI/逻辑问题则回滚 Desktop 构建。旧构建忽略增量表；不删表、不向下迁移、不手改用户库。前向修复复用保留数据，回滚演练也必须使用副本。

## 作者与审批状态

- **作者：** xchunzhao（需求与规格确认）与 agent（源码核对、实施计划整理）。
- **状态：** `accepted`。xchunzhao 于 2026-09-07 确认本计划，并明确以技术负责人身份批准本地 SQLite 迁移事务边界、失败整体回滚及不新增备份/向下迁移的方案，授权开始实施。由 agent 记录人工决定，不代签设计、安全、合规或实现后验收结论。
- **实施门槛：** 本计划的工程接受及迁移技术签核已完成，可以进入代码实施；故障注入、真实 Desktop 验证和其他发布门槛仍须完成。实质偏离须先修订计划并重新接受。

## 实施与验证记录（2026-09-07）

- 已实现本地注册表、版本化快照、窗口独立选择、统一导航、侧栏/列表/命令投影、创建归属、管理界面与后台关注聚合。
- 迁移生成发现旧快照仍包含运行时已移除的表/列；新增仅供生成使用的 schema，保留 9 张旧表和 12 个旧设置列，不恢复旧产品功能。`0055_colorful_kree.sql` 仅新增 4 张 Profile 表及索引，无旧表删除/修改。
- 原生 Electron 41.10.3 执行完整 56 条历史迁移链，通过空库与升级库故障注入、结构/日志回滚、重试/重开及 Profile 事务/快照 smoke。
- `bun run --cwd apps/desktop test`：**2397 pass，0 fail**；Desktop 与 local-db 类型检查、改动源码 Biome 检查通过。
- 全部 17 个发布语言目录严格编译通过；新增 61 条文案已补齐 16 个非英文语言的 976 条翻译，并校验占位符与标签。
- 真实 Desktop 已验证 Profile 创建/切换、项目隔离与创建归属、独立会话创建、访问恢复、后台终端连续输出及两窗口选择互不覆盖。缓存已就绪的小型验证数据中，记录的切换样本为 51.2、59.9、75.5 ms；不将这些样本泛化为所有数据规模的性能验收。
- 通知目标导航通过真实 renderer 内部入口 smoke：先切换所属 Profile，再打开目标工作区及已有终端。**没有自动点击操作系统原生通知**，不宣称该原生交互已完整验收。
- 修复验证发现的 Unicode 大小写判重、初始 Profile 恢复/显式重新选择目标、失败创建重试页保留问题；将纯查询工具从 React hook 中分离，避免单元测试导入界面。协议脚本的 dotenv 加载移入执行入口，避免导入工具函数时覆盖测试环境。
- 只清理本轮创建的验证 Profile、项目、会话及临时脚本/目录；保留原有工作。开发运行数据加入忽略规则，不进入提交。
- **尚未发布。** 原生通知点击、真实触控板/辅助技术及发布前人工审查、canary 仍是发布门槛，不由上述自动化或 smoke 结果代替。
