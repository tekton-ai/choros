---
artifact: spec
feature: work-profiles
author: xchunzhao-and-agent
status: accepted
created: 2026-09-01
intent: ./intent.md
---

# 需求规格：工作档案（Work Profiles）

> **实验发布修订：2026-09-07，已由负责人确认。** 用户反馈 Profile 仍有较多问题，要求先放入 Experimental，由用户主动开启。本次仅调整发布与开关边界，不扩展 Profile 能力，也不把实验开关当作已修复现有问题。
>
> **审批沿革：** 本文基于 `527ec4ea1` 的上一版规格已于 2026-09-07 获产品负责人接受，随后实施计划获接受。负责人在本次对话中对“默认关闭、关闭后显示全部工作、保留已有分类”的修订明确回复“可以啊”，本次记录该人工接受。原计划的接受不覆盖新的开关行为；接下来修订并评审实施计划。

## 先看结论与本轮取舍

1. **Profile 是本机工作分类，不是账号或权限隔离。** 项目与独立会话各归属于一个 Profile；项目工作区继承项目归属。
2. **只有视图切换，没有运行环境切换。** 切换不停止终端、agent 或开发服务器；不同窗口可以同时使用不同 Profile。
3. **主动开启后，普通工作界面只显示当前 Profile。** 保留设置和插件的全局属性，不新增已开启状态下的日常“所有 Profile”模式；未开启时不应用 Profile 分类。
4. **不恢复 main 已删除的功能。** 不增加组织层、V1/V2 开关、Tasks、Automations、Pages 或远程多 Host 管理。
5. **创建、历史和通知必须一起适配。** 不接受“侧栏看起来隔离了，但快速创建、历史导航或通知仍然串到其他 Profile”的实现。
6. **Work Profiles 先作为默认关闭的本地实验功能。** 新安装和没有明确开启记录的现有安装均保持关闭，即使本地已有 Profile 数据也不能自动开启；用户在 Settings → Experimental 主动选择。

建议先评审“功能范围”“切换与导航”“创建与归属”三节，再看持久化、安全和验收要求。代码集成说明放在后面，便于工程评审对照。

## 一、需求与设计

### 实验发布与开关边界

本节为本次已接受的实验发布规则；下文 Profile 筛选、切换器、管理、故障回退及相关验收默认指**实验已开启**的状态。

- **入口与默认值：** Settings → Experimental 增加可搜索的 Multiple Profiles（多 Profile）开关，默认关闭并持久化用户选择。文案说明可用不同 Profile 区分工作与个人项目、按需切换；不依赖远程 feature flag，不增加账号或权限边界。
- **关闭不是切回 Default：** 隐藏展开/收起侧栏中的 Profile 切换器、Profile 管理/新建命令及“移至 Profile”菜单。普通工作视图不再按 Profile 筛选，原有归档、权限和用户筛选条件仍然生效；其他 Profile 中的项目和独立会话仍可访问。
- **关闭时不依赖实验状态：** 不为 Profile 分类轮询、订阅或等待注册表，不触发 Profile 自动切换、跨档跳转或“Profile 不可用”提示。历史、最近访问、通知、深链接和创建入口仍可正常使用，不能因停用实验而失去导航或空白。
- **数据保留：** 开关关闭不删除或重置 Profile 定义、归属、访问记录或保存的选择，不执行“全部移至 Default”。重新开启后读取原有数据；不能以当前无筛选视图覆盖保存的归属。
- **创建边界：** 关闭期间新建项目和独立会话没有显式分类，仍按现有规则隐式归 Default；已有项目及其新工作区保留项目归属。切换开关前已提交的创建沿用提交时语义，不能重复创建、改写归属或由迟到回调拉回旧界面。
- **生效与运行状态：** 当前窗口切换开关后生效，后续启动保留选择。关闭时保留当前工作对象和未提交草稿；重新开启时按真实归属和既有导航规则展示。开关不得停止终端、agent、开发服务器或重建底层工作区运行状态。
- **明确边界：** 此次是降低默认暴露范围，不修复或掩盖其他 Profile 缺陷；不改数据库迁移，不清理用户数据，不新增同步或远程开关。

### 1. 功能范围与对象归属

本文中，项目指当前本地 Host 返回的项目；独立会话指 `projectId === null` 的工作区。Profile 名称由用户定义，例如“工作”“个人”，产品不内置这些分类。

| 对象或界面 | 本次规则 |
|---|---|
| 项目、独立会话 | 直接成员，每个对象恰好属于一个 Profile |
| 项目下的工作区 | 继承项目的 Profile，不能单独移动 |
| 终端、聊天、agent、浏览器等工作区内的会话或窗格 | 跟随所属工作区，不另设 Profile 归属，不改变其运行和登录状态 |
| PR 列表与详情 | 按入口项目继承归属；不新增 PR 成员记录 |
| 侧栏的项目、会话、固定项、标签分组及工作区行 | 只显示当前 Profile 内的内容；空分组不因其他 Profile 的内容而显示 |
| 工作区列表、项目页、搜索、命令面板、最近访问、历史导航 | 只提供当前 Profile 的工作对象；筛选选项和选择结果也遵守同一范围 |
| 新建、导入、全页创建、快速创建与目标项目选择器 | 创建归属及目标选择遵守当前 Profile，具体见第 5 节 |
| 设置、插件以及已有全局设置/账户能力 | 保持全局数据和行为，不因切换 Profile 被拆分或复制 |
| Profile 管理、待关注事项和通知摘要 | 可以跨 Profile 汇总；不改变对象的唯一归属 |

同一 Desktop 安装实例的窗口共享一份 Profile 注册表，不按账号或组织拆分。窗口各自保留当前选择；新窗口以上一次持久化选择为初始值，随后可以独立切换。

当前 Host 项目的 `projectKey` 就是项目行的 `id`，归属沿用这个标识。同一个仓库 URL 对应的不同本地项目不会因为 Profile 功能而合并。PR 详情沿用当前路由中的项目参数来确定归属；不凭 PR 编号或仓库名称猜测所属项目。

### 2. Default、升级与故障回退

- 每个安装实例恰好有一个内置 `Default`。默认身份与显示名称无关；可重命名、排序，但不能删除或取消其默认身份。
- 不预先给全部已有对象回填成员记录。没有显式非默认归属的项目和独立会话都属于 Default，升级后原有工作立即可见。
- 移至 Default 等价于删除该对象的显式非默认归属，不为其生成新的默认成员记录。
- 已删除 Profile 的失效引用按 Default 解析，不在界面制造不存在的 Profile 或工作对象。
- Profile 表不可用或状态无法读取时，界面明确显示 Default 和可恢复的错误提示，现有工作仍可访问。不能显示自定义 Profile 名称，却在其下悄悄展示全部内容。
- 降级状态下不得假装创建、移动、重命名或持久化成功；禁用无法完成的 Profile 写操作。恢复后重新加载真实注册表，不静默清空已有归属。
- Host 暂时不可用、查询未完成或缓存暂时缺失，不等于对象已删除。保留已记录的归属，待现有本地数据源恢复后继续使用；本功能不引入远程 Host 缓存系统。

### 3. 切换器与管理入口

**位置：** 在现有 Dashboard 侧栏顶部，窗口控制/导航行下方、“新建工作区”上方。工作区和列表路由中始终可见。侧栏收起时保留单个图形/首字母控件、名称提示和待关注指示。

```text
改动前                       改动后
窗口控制 / 导航              窗口控制 / 导航
新建工作区                   当前 Profile 名称 ▾  ← 专用切换区域
搜索                         新建工作区
工作区 / PR / 插件            搜索
                             工作区 / PR / 插件
```

本设计解决三个现有交互问题：

| 问题 | 设计决定 |
|---|---|
| 创建按钮之前没有持续可见的工作分类 | 增加独立 Profile 行，让用户先知道当前归属，再创建内容 |
| 侧栏已有纵向滚动、选择、拖放和窗口拖动区域 | 手势只绑定 Profile 控件，不绑定整个侧栏，也不侵入窗口控制/拖动区域 |
| 工作区状态目前依赖侧栏行的数据集合 | 控件的待关注计数使用未被 Profile 筛掉的状态来源，而不是数当前可见的行 |

复用现有 `@choros/ui` 菜单、对话框、提示组件，以及 `bg-fill-hover`、`bg-fill-selected`、焦点样式和侧栏尺寸。保持现有缩放及 macOS 窗口控制留白，不新建一套视觉样式。

切换交互必须满足：

1. 点击控件打开有序菜单，标记当前 Profile，显示各自待关注数量，并提供“新建 Profile”和“管理 Profile”。
2. 左滑到下一个、右滑到上一个；必须以横向运动为主，一次手势最多切换一次，首尾不循环。
3. 触控板横向滚轮与触摸/指针滑动行为一致；纵向滚动、双指缩放及 `ctrlKey` 缩放输入不能触发切换。
4. 控件获得焦点后，左右方向键切换，Enter/Space 打开菜单。命令面板提供新建、管理、上一个、下一个 Profile 命令；不需要新增远程快捷键设置。
5. 展开、收起侧栏使用同一套切换行为。仅有 Default 时控件仍可见，切换操作为无操作，但仍能创建 Profile。
6. 用户可调整顺序；菜单、滑动、方向键和命令面板使用同一顺序。
7. 长名称截断展示，但能通过提示和无障碍名称读取完整名称。控件具有可见焦点与状态播报，并遵循减少动态效果设置。

### 4. 切换与导航

**所有入口共享同一套切换结果。** 侧栏菜单、手势、键盘和命令面板不得各自实现不同的导航语义。

| 切换发生的位置 | 切换后的结果 |
|---|---|
| 工作区详情 | 恢复目标 Profile 上次成功打开且仍可访问的工作区；没有使用记录时进入其工作区列表空状态 |
| 工作区列表或 PR 列表 | 保持当前列表路由，替换结果；清除不再属于目标 Profile 的项目筛选条件 |
| 某个项目的详情或 PR 详情 | 不把旧项目留在新 Profile 下；分别进入目标 Profile 的工作区列表或 PR 列表 |
| 全页创建或创建弹窗 | 保留尚未提交的文字等非归属输入；清除不属于新 Profile 的目标项目并提示重新选择 |
| 设置、插件等全局页面 | 不强制跳转；切换只影响选择器和下一次进入的 Profile 相关工作界面 |

补充约束：

- 保存的工作区已被删除、归档、移走或不再可访问时，按该 Profile **实际成功打开的时间**，依次选择仍可访问的最近工作区，最后回退到工作区列表。不得用项目/工作区 `updatedAt` 代替访问时间，也不得把从未打开的工作区当作最近访问。
- 当前对象通过管理界面、右键菜单或另一窗口被移出当前 Profile 后，使用同一回退规则。不能只改列表而留下“Profile B 名称下显示 Profile A 工作区”的状态。
- 切换期间不得让路由归属校正逻辑把用户刚选中的目标又切回来源 Profile。快速连续切换时，以最后一次用户选择为准；较早请求的完成或失败不得覆盖更新的选择。
- **普通历史导航不跨 Profile。** 前进/后退按钮、现有快捷键、鼠标侧键都跳过其他 Profile 的工作对象；设置和插件等全局历史项仍可访问。没有符合条件的历史目标时，对应操作不可用。
- 最近访问先按当前归属筛选、去重，再应用现有展示数量上限。独立会话必须进入最近访问，不能因为没有项目而被排除。
- **通知及外部深链接是明确打开某个对象的操作，与普通历史导航不同。** 使用原始本地数据确认项目/工作区归属，先选择所属 Profile，再展示内容。PR 详情按项目参数处理。不能把“位于其他 Profile”误报为“对象不存在”。
- 数据尚未就绪时沿用现有加载和查找行为；确实不存在的目标沿用现有缺失提示，不能创建虚假的 Profile 或对象。现有 CLI 新建工作区的深链接继续可用。
- 只有成功打开的工作区才写入该 Profile 的访问状态；失败、已删除或被取消的导航不覆盖最近访问记录。

### 5. 创建、导入与归属

- 新项目和独立会话在提交时捕获当前窗口的 `profileId`，Host 创建成功后才写入本地归属。创建过程中切换 Profile，仍归入提交时的 Profile。
- 覆盖现有的新建项目、空项目、模板、文件夹导入、新建工作区弹窗、全页创建、命令面板及快速创建入口。不能只改侧栏按钮或弹窗中的项目选择器。
- 项目工作区继承项目归属。项目提示值、最近使用的默认项目和显式选择都必须属于当前 Profile；提交时再次检查，不能只依赖下拉框已经筛过。
- 快速创建的项目提示值失效或属于其他 Profile 时，只能继续尝试当前 Profile 内的已有默认值/可用项目；没有合适项目就打开现有创建界面，不能选中全局第一个项目。
- 导入返回新项目时按提交时的 Profile 分配；返回已有项目或执行已有项目的 setup 时保留原归属。需要打开已有项目时，先选择它所属的 Profile，不能把“重新导入”当作“移动到当前 Profile”。
- 独立会话的乐观 ID 若被 Host 返回的正式 ID（canonical ID）替换，持久归属必须写到正式 ID，不能只留在临时 ID 上；乐观显示与最终显示使用一致的归属。
- 若 Host 创建成功，但本地归属失败或目标 Profile 已被删除，保留已创建对象并归入 Default；提示实际结果，提供重新选择目标并恢复归属的操作。不能删除对象、重复创建或静默新建一个同名 Profile 来掩盖失败。
- 创建在后台完成时，不强行把已切换到其他 Profile 的窗口拉回。只有用户仍在等待该次创建的对应界面时，才沿用现有完成导航，并保证正式对象与 Profile 一致。
- 没有窗口 Profile 上下文的外部或后台新建对象归入 Default。此版本不为 CLI 或 Host 增加 Profile 参数，不要求它们知道 Desktop 的分类。

### 6. Profile 管理与移动

“管理 Profile”打开模态对话框，不离开当前工作页面。管理功能包括：

1. 创建、重命名和排序。名称去除首尾空白后非空，最多 80 个 Unicode 码点；在整个安装实例内按 NFC 规范化及不区分大小写的规则判重。显示去除首尾空白后的用户原名，不翻译用户数据。
2. Default 重命名后仍单独标记“默认”。新建 Profile 不自动移动任何既有内容，切换由用户主动选择。
3. 搜索项目与独立会话、查看当前归属并移动。项目行展示本地路径或现有设备信息，避免同名项目无法区分。
4. 右键菜单为项目、独立会话提供“移至 Profile”，勾选当前归属；项目下的工作区没有独立移动入口。
5. 移动一个或多个直接成员时，要么全部提交成功，要么全部不变；Default 回退规则始终成立。管理界面和右键菜单经过同一校验与写入边界。
6. 空的自建 Profile 经明确确认后删除。非空 Profile 的普通删除被拒绝，只能选择“全部移至 Default 后删除”；确认中展示项目、独立会话数量，并说明项目下的工作区及其运行中内容会随归属变化，但不会停止。
7. 全量移至 Default 与删除 Profile 在一次本地事务中提交。删除当前 Profile 的窗口回到 Default 并按第 4 节处理当前路由；其他窗口若仍选着有效 Profile，则不被强制切换。
8. Host 暂不可用时，保留现有已知成员。已有缓存则显示名称；缺少展示信息则显示对象类型和稳定 ID，并标注不可用。不能把“当前没查到行”当作“Profile 已空”，也不能丢弃其显式归属。

成员类型只允许项目和独立会话。没有 Task 成员类型，也不引入 Task–Workspace 关系图或相应冲突解决界面。

### 7. 后台运行、提醒与窗口同步

- Profile 切换只改变导航和显示，不执行工作区销毁、终端终止、agent 停止或开发服务器关闭，不拆分已有窗格状态和运行时注册表。
- 状态和通知沿用引入 Profile 前的订阅资格与缓存。原本需要监控的工作区不会因为处于非当前 Profile 而退出订阅；原本被归档或排除的对象也不会仅因本功能被额外订阅。
- 保持现有查询键、缓存和监听关系，不为每个 Profile 再建立一套查询或监听器。Profile 提示数量从现有状态聚合而来，同一工作区在固定项和项目分组中出现时不能重复计算。
- 菜单按 Profile 显示未读、失败、待审阅、权限请求和待输入等现有待关注状态；当前 Profile 行显示当前计数。系统通知、提示音和 Dock 计数保留现有行为。
- 点击通知先切到所属 Profile，再打开工作区/窗格。仅切换 Profile 不将其他工作标为已读；继续沿用原有工作区/窗格查看规则。
- 增删改 Profile 或移动成员后，所有窗口刷新共享定义和归属；刷新不覆盖其他窗口仍有效的当前选择。新窗口使用最近一次保存的选择，不让“共享选择记录更新”变成强制所有窗口同步切换。

### 8. 本地持久化与服务边界

**权威数据位于 Desktop 本地 SQLite，使用 `CHOROS_HOME_DIR`。** 不写入 Host 数据库、Host 事件、中继或云 API；不依赖组织 ID，不按账号创建另一套 Profile 集合。

| 数据 | 必须表达的含义 |
|---|---|
| Profile 定义 | 稳定 ID、名称、用户排序、内置默认身份 |
| 显式成员归属 | 项目使用当前 `projectKey`；独立会话使用 `hostId + workspaceId`；同一带类型的引用只能有一个非默认归属 |
| Profile 访问记录 | 每个 Profile 中成功打开过的工作区及实际打开时间，足以在上次工作区失效后继续回退 |
| 最近选择 | 安装实例最近选择的 Profile，供新窗口初始化；不是强制所有窗口共享的当前选择 |

- 主进程通过一个本地服务边界提供读取、创建、重命名、排序、移动、删除、访问记录和选择持久化，以及跨窗口变更通知。渲染进程不直接访问 SQLite。
- 唯一默认、名称唯一、成员唯一及批量操作的一致性不能只靠 UI 保证。失败不得产生半个 Profile、半批移动或半次删除。
- 保留现有 `CollectionsProvider` 的本地共享数据语义；不得把它现有的固定 `LOCAL_PROFILE_KEY = "local"` 换成当前 Profile ID 来隔离窗格或运行状态。
- Profile 成员和访问记录等随对象数量增长的数据不得新增到渲染进程 `localStorage`。访问记录按本地已知工作对象维护，重复打开同一工作区不无限追加重复实体记录。
- Profile 迁移和迁移日志写入必须处于同一原子提交边界。故障注入后应保持完整的旧结构和日志；不留下部分新表。迁移失败时使用第 2 节的明确降级行为。
- 本版本仅做增量迁移，不新增数据库备份或向下迁移。发布回滚使用旧 Desktop 构建；已提交的 Profile 数据保留，供后续修复版使用，不手工删除用户表。

**为未来可选 GitHub 存储保留的边界：**

- 本地服务提供带版本的可序列化快照及原子写回能力，覆盖定义、排序、显式归属、访问记录和最近选择，不暴露数据库连接、内部行实现或凭据。
- 写回保留稳定 ID。相同快照重复应用不得生成重复 Profile 或改变归属；未知版本、重复身份、默认约束冲突，以及指向快照中不存在的 Profile 的成员/访问记录/选择引用，须整体拒绝，不能部分写入。校验不要求 Host 在线；本地对象暂时查不到不能成为丢弃其合法归属的理由。
- 本阶段只保证同一安装实例标识空间内的快照往返，不承诺跨设备 Host/项目标识协调。
- 不增加 GitHub 适配器、网络同步、导入/导出界面。保留服务能力不等于把未来同步功能带入本次范围。

### 9. 非功能要求与明确不做的事项

- 本地数据已缓存时，用户选择另一个 Profile 后，相关可见列表在受支持的 Desktop 硬件上于 **100 ms 内**更新；不能等待网络请求才完成切换。持久化失败需明确反馈，并避免旧请求覆盖新选择。
- Profile 读取、切换和本地管理不要求云端在线。PR 查询等已有联网功能仍遵循其现有网络要求；不能把“Profile 离线可用”表述为“离线也能获取新的 GitHub 数据”。
- 新增用户可见字符串使用 Lingui 显式 ID，完成所有已启用语言的翻译；用户输入的 Profile 名称保持原文。
- 控件可通过键盘完整操作，具备名称、焦点、状态播报及减少动态效果支持。实现后必须在真实 Desktop 验证展开/收起、缩放和手势行为，不能仅以类型检查代替。
- 不将 Profile 名称或成员标识加入分析数据。若记录运维信息，仅允许匿名计数及成功/失败；保留既有本地文件权限保护。
- 不新增远程功能开关，不恢复旧 V1/V2 产品切换。
- 不实现 Tasks、Automations、Pages、组织管理、远程多 Host 管理、Mobile 或 Web 的 Profile 能力。
- 不新增 Profile 专属账号、凭据、环境变量、插件、设置或资源限制；不新增嵌套 Profile、多重归属或实验已开启时的日常“所有 Profile”模式。停用整个实验后的无分类视图不构成新的 Profile。

## 二、与当前代码的集成依据

以下路径均以新工作区的仓库根目录为起点，描述当前真实入口，不是旧分支文件名的机械替换清单。具体修改步骤留给下一阶段的实施计划。

| 当前入口 | 已确认的事实及本功能必须遵守的边界 |
|---|---|
| `packages/local-db/src/schema/schema.ts`；`apps/desktop/src/main/lib/local-db/index.ts`；`apps/desktop/src/main/lib/app-environment.ts` | 当前本地数据库与迁移、`CHOROS_HOME_DIR` 及文件权限的归属位置；新增 Profile 状态继续放在 Desktop 层 |
| `apps/desktop/src/lib/trpc/routers/index.ts` | 现有 Electron 本地服务入口；新服务沿用 `electronTrpc`，不恢复已移除的云端接口 |
| `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` | 现有 LocalHostServiceProvider 与 HostWorkspacesProvider 不以旧 V2 开关为前提；Profile 逻辑位于原始工作数据边界之内，通知跳转必须能先处理 Profile |
| `apps/desktop/src/renderer/routes/_authenticated/providers/collections-provider/collections-provider.tsx` | 当前固定使用本地命名空间；不能以 Profile 切换替换全部底层集合 |
| `apps/desktop/src/renderer/hooks/host-projects/use-host-projects/use-host-projects.utils.ts` | `projectKey` 当前等于项目行 ID；不进行旧式仓库合并 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar/components/dashboard-sidebar-header/dashboard-sidebar-header.tsx` | 切换器嵌入当前展开/收起的侧栏头部，保留缩放、窗口控制和拖动区域 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar/dashboard-sidebar.tsx` | 状态集合当前从固定项、会话和项目分组生成；须区分后台资格集合与 Profile 可见集合 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/use-accessible-v2-workspaces/use-accessible-v2-workspaces.ts` | 工作区结果、搜索、筛选选项与项目映射应统一遵守 Profile；不能只过滤最终行数组 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/hooks/use-project-query-targets/use-project-query-targets.ts`；`apps/desktop/src/renderer/routes/_authenticated/_dashboard/pull-requests/$prNumber/page.tsx` | PR 查询在项目目标处限界，详情沿用项目参数解析归属；不能先查询其他 Profile 再只隐藏结果 |
| `apps/desktop/src/renderer/routes/_authenticated/components/dashboard-new-workspace-modal/components/new-workspace-screen/new-workspace-screen.tsx`；`apps/desktop/src/renderer/hooks/use-quick-create-workspace/use-quick-create-workspace.ts` | 全页创建与快速创建各有默认项目选择逻辑，都需要 Profile 约束 |
| `apps/desktop/src/renderer/stores/workspace-creates/use-workspace-creates.ts` | 乐观创建、Host 完成和正式 ID 的共享边界；归属以提交时上下文为准，在创建成功后持久化 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/add-repository-modals/hooks/use-folder-first-import/use-folder-first-import.ts`；`apps/desktop/src/renderer/react-query/projects/use-finalize-project-setup/use-finalize-project-setup.ts` | 新项目创建与已有项目 setup 共用部分收尾流程，不能无差别重写归属 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/navigation-controls/navigation-controls.tsx`；`apps/desktop/src/renderer/lib/persistent-hash-history/persistent-hash-history.ts` | 真正的按钮、快捷键和鼠标历史导航入口；当前 HistoryDropdown 未挂载，改它不能替代历史适配；现有路由历史不会持久化真实访问时间，不能据此伪造 Profile 的历史访问时间 |
| `apps/desktop/src/renderer/command-palette/ui/recently-viewed/recently-viewed-frame.tsx`；`apps/desktop/src/renderer/stores/last-active-v2-workspace.ts` | 最近访问和当前单一恢复目标需要统一的 Profile 导航语义，包含独立会话 |
| `apps/desktop/src/renderer/routes/_authenticated/components/v2-notification-controller/v2-notification-controller.tsx`；`apps/desktop/src/renderer/hooks/host-service/use-v2-notification-status/use-v2-notification-status.ts` | 保留后台资格、现有通知和 Dock 计数，不按当前 Profile 缩小订阅 |
| `apps/desktop/src/renderer/routes/_authenticated/settings/experimental/components/experimental-settings/experimental-settings.tsx`；同 settings 下的 `utils/settings-search/settings-search.ts`；`apps/desktop/src/renderer/stores/workspace-agents-row.ts` | 已有本地实验开关、搜索和持久化模式；Work Profiles 复用同一约定，但默认关闭 |
| `apps/desktop/src/renderer/routes/_authenticated/providers/profile-provider/profile-provider.tsx`；`apps/desktop/src/renderer/command-palette/modules/profiles/commands.ts`；`apps/desktop/src/renderer/routes/_authenticated/components/move-to-profile-menu/move-to-profile-menu.tsx` | 实验边界不能只有侧栏：provider 已承担注册表读取、投影、创建归属和导航，命令与右键菜单也有独立入口 |
| `packages/i18n` | 新文案与所有发布语言沿用现有提取、编译和检查流程 |

路由或符号中仍出现 `v2` 是当前 main 的现有命名，不意味着本功能要重建 V1/V2 模式切换。代码包沿用 `@choros/*`，不重新引入 `@superset/*` 依赖。

## 三、政策符合性

### 品牌与文案

沿用当前 Choros 侧栏和 `@choros/ui` 组件，不恢复 Superset 品牌。文档默认中文，先描述用户结果、取舍、风险和验收；标识符和命令保持原文。新增 UI 文案遵守仓库 Lingui 规则。

本轮加载了 `redesign` 指引，并核对了真实侧栏的展开、收起和窗口控制结构；未加载到独立的品牌规范，视觉细节仍须由设计负责人确认，不宣称已通过设计验收。

### 安全

Profile 不改变认证、授权、Host 访问权、GitHub 凭据或本地进程权限。服务校验名称、成员类型、对象标识和事务前置条件；数据沿用本地目录 `0700`、敏感文件 `0600` 的现有保护，不新增秘密或网络通道。

不引入新的权限模型不等于不需要审查：尚无针对本功能完成的独立安全审核，本地服务与迁移边界须由技术负责人或安全负责人确认。

### 合规

Profile 名称和成员信息留在设备上，不增加云同步、支付数据或个人信息传输。未加载到独立合规政策，需由产品/合规负责人确认本地分类及不采集约束足够；本文不替代正式合规结论。

### 用户体验与无障碍

所有手势都有点击和键盘替代。删除明确确认，错误不掩盖已创建工作，窗口选择互不干扰，后台提醒持续可见。功能实现后需要真实 Desktop 的视觉和交互证据；本次只有规格和源码核对，尚无 UI 验收结果。

## 四、验收时必须看到的结果

本次实验发布须先满足以下新增标准；其后的原有 Profile 验收表适用于开启状态。

| 场景 | 可观察的通过标准 |
|---|---|
| 未开启与已有数据升级 | 没有显式开启记录时默认关闭；已有非默认归属不会隐藏工作，不出现 Profile 切换器、管理/新建命令或移动菜单 |
| 主动开启与重启 | 在 Experimental 中可搜索并开启；相关入口与分类恢复，重启保留开启状态 |
| 关闭与再次开启 | 在非默认 Profile 使用后关闭，原工作对象仍可访问；再次开启保留定义、归属及访问记录，不发生删除或隐式迁移 |
| 关闭后的核心路径 | 侧栏、列表、搜索、历史、最近访问、通知、深链接和创建都不再受 Profile 分类限制；不轮询/订阅分类注册表，也不弹出停用导致的 Profile 故障提示 |
| 开关与进行中的工作 | 终端/agent 持续运行，草稿保留；已提交创建只完成一次且遵循原提交归属，迟到回调不覆盖新的导航意图 |

| 场景 | 可观察的通过标准 |
|---|---|
| 升级与重启 | 旧项目/独立会话仍在 Default；重启保留定义、归属和最近选择，不需要成员回填 |
| 基础管理 | 新建、重命名、排序、唯一名称校验可用；Default 不能删除；非空删除须明确移动到 Default 且原子完成 |
| 多种切换入口 | 点击、手势、方向键、命令面板结果一致；一次手势最多切换一次，首尾不循环，纵向滚动不误触 |
| 视图与筛选 | 侧栏、工作区、项目页、PR、搜索、目标选项只出现当前 Profile 的工作；设置和插件仍保持全局 |
| 创建与导入 | 快速创建不会使用其他 Profile 的默认项目；重新导入已有项目不改变归属；新项目和独立会话使用提交时的 Profile |
| 创建竞态与失败 | 创建期间切换不改变最终归属、不强制拉回窗口；正式 ID 可找回；归属失败保留对象并提供 Default 恢复路径 |
| 路由和访问恢复 | 删除、归档或移走上次工作区后按真实访问顺序回退；没有记录则进入空状态；所有入口不会留下错误 Profile 下的对象 |
| 历史与深链接 | 前进/后退跳过其他 Profile；最近访问包含独立会话且先筛后限量；明确深链接及通知先激活对象所属 Profile |
| 后台工作 | A 中终端/agent 运行时切到 B，A 继续运行且提醒不消失；计数不重复，不因切换标为已读；订阅规模不随 Profile 数量增长 |
| 多窗口 | 两个窗口可处于不同 Profile；定义/归属修改同步，当前选择不相互覆盖；删除正在使用的 Profile 时正确回退 |
| 离线与损坏 | Profile 本地读写、切换不要求云在线；Host 暂时不可用不清除归属；注册表不可用时明确显示 Default、保留工作并禁止假成功 |
| 事务与快照 | 迁移中途失败时结构和日志整体回滚；批量写失败零部分提交；快照往返保留 ID，相同快照重复写入不产生重复成员 |
| 性能、文案和无障碍 | 缓存就绪时列表在 100 ms 内更新；所有新增文案有显式 ID 和发布语言翻译；真实应用验证焦点、缩放、收起侧栏和减少动态效果 |

## 五、需重点人工评审的风险

- **实验关闭与核心路径（工程负责人）：** Profile 已接入导航和创建，不能只隐藏入口或将当前选择设为 Default；必须证明无分类状态仍可访问全部原有工作，并且开关不重建运行中的工作区子树。
- **本地迁移与降级（技术负责人，高风险）：** 迁移涉及持久数据；必须证明 DDL 与日志整体回滚。没有数据库备份/向下迁移是明确取舍，不能因旧方案曾批准就视为新版已通过。
- **历史、路由与创建竞态（工程负责人）：** 需要区分主动切换、普通历史和明确深链接；快速切换、后台完成及跨窗口移动不能相互覆盖。不能用多个组件各自补跳转来替代统一行为。
- **后台订阅成本（技术负责人）：** 保持现有订阅资格和缓存，既不能漏掉非当前 Profile，也不能为每个 Profile 复制观察器。需用实现前后实际数量及提醒场景验证。
- **交互与可理解性（设计负责人）：** 滑动阈值、缩放、收起侧栏、长名称和无障碍需在真实界面确认；设置/插件全局的事实不能被 Profile 标识误导。
- **本地数据边界（安全/合规负责人）：** 确认名称与归属不进入遥测、本地权限不削弱，不将分类误当作访问控制。
- **未来快照能力（架构负责人）：** 此次只提供同一标识空间内的版本化往返，不承诺跨设备协调，不顺带实现 GitHub 同步或导入界面。

## 作者与审批状态

- **作者：** xchunzhao（需求确认）与 agent（规格整理）。
- **状态：** `accepted`。产品负责人 xchunzhao 于 2026-09-07 在本次对话中明确回复“可以啊”，接受实验默认关闭、关闭后显示全部工作并保留已有分类的规格修订；agent 仅记录该人工决定。此次接受不替代新实施计划的工程接受，也不代表应用代码已修改或新开关已验证。
