---
artifact: spec
feature: incident-2026-09-08-workspace-hide-freeze
author: agent for xchunzhao
status: draft
created: 2026-09-08
intent: ./intent.md
---

# Spec — Hide 后释放页面交互锁

本文依据用户在本次对话以 `accepted` 批准的紧急 hotfix 例外，作为实现后的当日记录；不表示普通 intent/spec/plan 审批已完成。

## Requirements & design spec

### Functional requirements

- 侧边栏项目右键 → Remove from Sidebar → 确认后，项目从侧边栏消失，页面仍可点击、切换路由和输入。
- 取消或按 Escape 关闭确认弹窗时，保留项目并恢复页面交互。
- 弹窗打开期间维持正常模态交互锁；关闭最后一个模态层后恢复原始 pointer-events 值，不强制清空样式。
- 保留原有隐藏、导航、pane 清理和数据持久化语义，不删除业务项目或 workspace 文件。

### Non-functional requirements

只调整依赖图，不添加定时器、渲染监听器、全局 DOM 修补逻辑或运行时分配。复用既有 Radix 模态层生命周期与测试环境。

### Out of scope

不修改 host-service 启动、Open Folder、登录或文件导入代码；不升级整套 Radix，不改菜单文案，不改隐藏状态数据模型。

## Integration with existing code

- `packages/ui/package.json`：将 `@radix-ui/react-context-menu` 从 `2.3.7` 对齐到既有 `radix-ui@1.4.3` 版本集合中的 `2.2.16`。它与现有 Dialog/DropdownMenu 复用 Menu 2.1.16、DismissableLayer 1.1.11、FocusScope 1.1.7。
- `bun.lock`：通过 `bun install --ignore-scripts` 重建，移除独立的新版本交互层依赖链。
- `packages/ui/src/components/ui/context-menu.tsx`：保持原有包装器、动画和 Wayland pointerup 防护。调用方未使用新版本独有的 controlled `open` 属性，无需兼容层。
- 回归测试：`apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar/components/dashboard-sidebar-project-section/components/dashboard-sidebar-project-context-menu/dashboard-sidebar-project-context-menu.test.tsx`。在隔离 DOM 生命周期中组合真实共享 ContextMenu 与模态 Dialog，检查确认后触发行卸载、菜单/弹窗关闭、原始 `pointer-events: auto` 恢复，以及弹窗打开时锁仍为 `none`。不修改全局 alert 单例。

### Verification evidence

真实 Electron，renderer `http://localhost:3045`、CDP `127.0.0.1:9244`，进程及构建来自本工作区：

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 项目菜单 → Remove 确认 | 菜单/弹窗均消失，但 body pointer-events 为 `none` | 项目隐藏，body pointer-events 恢复为空，菜单/弹窗均为 0 |
| 确认弹窗保持打开 | 独立复现中菜单退出后 body 提前恢复为空 | body 保持 `none`，直到弹窗关闭 |
| Cancel | 未单独记录修复前数值 | 项目保留，body 恢复为空，Workspaces 导航成功 |
| Escape | 未单独记录修复前数值 | 项目保留，body 恢复为空，继续导航成功 |
| 确认后继续输入 | 冻结现场无法正常命中页面 | Workspaces 搜索输入 `main`，焦点位于搜索框，路由更新为 `#/v2-workspaces?q=main` |

修复前冻结现场、修复后弹窗和确认后搜索界面均已截图，保存在本次工具会话中。创建的空白 session `malachite-research` 已通过真实 UI 删除，确认弹窗关闭后仍无残留锁。项目保留并重新显示在侧边栏。未更改用户项目文件。

初始 DOM 回归组合在旧依赖下触发两套 FocusScope 互抢焦点、调用栈溢出；依赖对齐后通过。最终测试使用局部 Dialog 状态，避免测试污染全局 Alerter 单例。真实 Chromium 的 pointer-events 复现是本次根因和修复的主要证据，DOM 测试不冒充端到端测试。

最终验证命令（仓库根目录执行格式检查，测试命令在 `apps/desktop` 执行）：

```sh
bun x biome check packages/ui/package.json apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar/components/dashboard-sidebar-project-section/components/dashboard-sidebar-project-context-menu/dashboard-sidebar-project-context-menu.test.tsx
bun test src/renderer/routes/_authenticated/_dashboard/components/dashboard-sidebar/components/dashboard-sidebar-project-section/components/dashboard-sidebar-project-context-menu/dashboard-sidebar-project-context-menu.test.tsx src/renderer/routes/_authenticated/hooks/use-dashboard-sidebar-state/sidebar-mutations.test.ts src/renderer/components/redirect/redirect.test.tsx
```

最终结果：3 个测试文件共 12 项通过（31 次断言），格式与 lint 检查通过；`bun install --frozen-lockfile --ignore-scripts` 成功且无需变更依赖。关闭 CDP 连接前，真实窗口 body pointer-events 为空，项目仍在侧边栏，菜单和对话框均为 0。


## Policy compliance

### Brand

没有修改用户文案、主题或视觉布局。

### Security

不修改认证、权限或数据传输。不以取消 modal 或全局解锁方式掩盖缺陷，保留有效弹窗的交互隔离。

### Compliance

没有新增 PII、凭据、存储字段、数据库迁移或外部接口。

### UX

保持既有确认、取消、Escape、焦点和菜单交互模型；修复隐藏完成后页面失去点击能力的问题。

## Areas of concern

- 后续依赖升级负责人：Radix 的模态组件必须共享兼容的交互层；不能只升级 ContextMenu。此回归检查用户可观察的锁生命周期，而非固定版本字符串。
- 本地环境的 API 连接拒绝和字体加载 CORS 错误仍在，未观察到修复路径新增的 React 更新深度或调用栈错误；这些环境问题不属于本次修复。
- 未遍历应用内全部菜单和弹窗，也未验证远端认证会话或发布包。仅声称上述实际执行范围。

## Author + Status

- **Author:** agent for xchunzhao
- **Status:** `draft` — 紧急 hotfix 的当日事后记录，待人工审阅。
