---
artifact: intent
feature: incident-2026-09-08-workspace-hide-freeze
author: agent for xchunzhao
status: draft
created: 2026-09-08
---

# Intent — 隐藏 workspace 后保持页面可交互

## Problem

用户在 [tekton-ai/choros#24](https://github.com/tekton-ai/choros/issues/24) 报告 Hide 后整页无法交互，必须重开窗口。用户在本工作区开发窗口演示后，agent 采集到 `body.style.pointerEvents = "none"`，同时菜单和对话框均为 0；随后独立复现。

最小已确认路径：侧边栏**项目**右键菜单 → **Remove from Sidebar** → 确认弹窗 → **Remove**。问题不依赖 workspace 的导航跳转；初始对单个 workspace 直接隐藏的测试没有复现，不能据此否定报告。

根因是 `@choros/ui` 的 Radix 依赖版本不一致：ContextMenu 2.3.7 使用 Menu 2.1.24、DismissableLayer 1.1.19、FocusScope 1.1.16；Dialog 1.1.15 使用 DismissableLayer 1.1.11、FocusScope 1.1.7。两套模块分别维护全局交互锁和焦点栈。确认弹窗在菜单仍上锁时保存了 `none`；菜单解锁后，弹窗关闭又把 `none` 写回 body。运行时调用栈定位到 Dialog 所用 DismissableLayer 的 effect cleanup。

复现和修复后验证均使用当前工作区的 Electron，renderer `http://localhost:3045`、CDP `127.0.0.1:9244`。初次 host 启动失败曾使 Open Folder 不可用；用户恢复后继续验证，未修改 host-service 源码。API `http://localhost:3041` 不可用，验证走当前应用支持的本地产品路径，不声称验证了远端登录会话。

## Proposed outcome

隐藏 workspace 后，该 workspace 不再显示于侧边栏，窗口仍能接受点击和键盘输入；用户可以切换到其他 workspace、打开菜单并继续工作，无需重开窗口。隐藏仍是可恢复的侧边栏操作，不删除 workspace 或工作目录。

## Affected users and systems

- 在 Choros 桌面端通过右键菜单打开确认弹窗的用户；受影响人数未知。
- `packages/ui/src/components/ui/context-menu.tsx`、`packages/ui/src/components/ui/dialog.tsx` 和 `packages/ui/src/atoms/alert/alert.tsx` 的共享依赖。
- 侧边栏项目删除显示入口是已复现案例；workspace 直接隐藏路径作为对照保留原实现。

## Constraints

- 不改变 Hide 的数据语义，不删除 workspace、文件或用户工作。
- 不强制清空 body 样式，不取消模态行为，不新增延时或全局修补逻辑。
- 对齐 ContextMenu 与既有 Dialog/Menu 的 Radix 版本，统一锁及焦点栈；保留菜单关闭动画和已有 Wayland pointerup 防护。
- 用真实 Electron UI 复现前后行为，并以 DOM 回归测试防止依赖再次拆出两套交互层。
- 用户在本次对话明确回复 `accepted`，批准先修复、验证，再补文档的紧急 hotfix 例外；本文与 spec 是当日补齐的记录，不把例外批准冒充逐阶段文档审批。

## Open questions

- 其他菜单到弹窗组合未逐项遍历。项目确认、取消、Escape 和临时 session 清理作为此次验证边界；共享依赖对齐不代表已验证所有弹窗业务。
- 后续 Radix 升级须保持共享依赖一致，并执行本次回归测试，不能单独升级 ContextMenu。

## Author + Status

- **Author:** agent for xchunzhao
- **Status:** `draft` — 紧急 hotfix 已获用户批准；事后记录待人工审阅。实现和验证结果见 [spec](./spec.md)。
