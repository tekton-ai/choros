---
artifact: intent
feature: incident-2026-09-08-terminal-copy-link
author: xchunzhao + coding agent
status: accepted
created: 2026-09-08
---

# Intent — 修复终端 Copy Link Address 的目标地址语义

## Problem

[Choros issue #27](https://github.com/tekton-ai/choros/issues/27) 报告：TUI 显示 `baidu(https://www.baidu.com)` 时，在 `baidu` 上执行复制得到 `baidu`；在后面的 URL 上执行得到 `(https://www.baidu.com)`。两处都应复制 `https://www.baidu.com`。初始报告未注明具体 TUI 与菜单来源；后续用户确认是 Choros 内置终端中的 Oh My Pi，直接在链接上右键。

初始只读调查排除了仅凭同名菜单或去括号正则定位问题：

- 当前 V2 终端菜单在 `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/use-pane-registry/use-pane-registry.tsx:468-585` 定义，提供 `Copy`，从 `terminalRuntimeRegistry.getSelection()` 取文本并写剪贴板；该菜单没有 Copy Link Address。
- `apps/desktop/src/renderer/screens/main/components/workspace-view/content-view/tabs-content/terminal/link-providers/url-link-provider.ts:22-49,338-352` 从 HTTP(S) scheme 开始匹配，已有不平衡右括号裁剪。不能把“增加去括号正则”当作已确认修复。
- 同名 Copy Link Address 存在于浏览器菜单 `apps/desktop/src/main/lib/browser/browser-manager.ts:931-967`，复制 Electron 提供的 `linkURL`。同名文案不证明这是报告里的 TUI 路径。

**后续诊断：已确认并复现。** 使用本机 OMP 18.0.11 渲染器的实际 OSC 8 输出发现：真实 URI 不含外围括号，但显示 span 包含括号；xterm 右键优先选中整个超链接显示范围，原有 Copy 随后复制选区文本而非真实 URI。原菜单名为 Copy，不需要新增或改名。详见本目录 spec 与 plan 中的原始事件链和验证记录。

## Proposed outcome

在 Choros 内置终端中，从 OMP 链接的显示文本和 URL 两处直接右键执行现有 Copy，剪贴板内容均精确等于 `https://www.baidu.com`。手动选择后的 Copy 仍复制原选区，不被链接地址语义替代。

修复结果可追溯到实际应用实例、版本、操作位置及剪贴板观测；自动化检查与真实界面检查分别标记，不以较窄的合成示例冒充端到端验收。

## Affected users and systems

- 在 Choros 终端中使用 TUI、需要复制链接地址的用户；受影响人数及版本范围未知。
- 当前已定位的调查范围：V2 终端 pane 菜单、terminal runtime/link manager、URL link provider，以及上游 xterm 的 OSC 8 链接目标语义。
- 浏览器和 Markdown 的同名菜单只是排查线索；只有证据表明报告来自这些界面时才纳入修改范围。
- 独立的 fix-issue workflow 工作已由用户暂停，不包含在本 PR 中；本修复不扩张为终端全面重构。

## Constraints

- 遵循本仓库 SDLC：人工接受 intent、spec、plan 后才实现；Agent 不代替人类把状态改为 accepted。
- 不把普通文本选区当作链接地址，不只对 `baidu` 特判，也不无条件删除合法 URL 内的括号。
- 保留 OSC 8 的真实目标、普通 HTTP(S) 链接、换行链接和既有 Copy 行为；具体边界在 spec 中明确。
- 如需新增用户可见菜单文案，遵循 Lingui 显式 ID 和本仓库翻译检查。
- 只在归属本工作区的运行实例上验收。不得为方便验证而升级或修改用户当前运行中的其他实例。
- 不自动发布、push、合并或关闭 issue；这些不是本次诊断阶段的交付。

## Open questions

- 已解决：用户确认来源为 Oh My Pi 的终端输出，采用直接右键触发；未通过另造手动选区替代其复现。
- 已解决：使用 OMP 实际 OSC 8 metadata 复现；真实 URI 本来正确，问题出在复制显示范围。
- 已解决：不新增普通文本 `label(URL)` / Markdown label 的关联语法，仅复用已经解析出的链接目标。
- 已解决：回归覆盖自动/手动选择、重复复制、生命周期和范围边界；原始直接右键路径与手动选择都完成了实际桌面剪贴板验证。

## Author + Status

- **Author:** xchunzhao（需求与问题报告）+ coding agent（只读调查及草拟）
- **Status:** `accepted` — xchunzhao 在会话中明确批准并委托 Agent 记录；后续 spec/plan 修订、实现和验证亦已完成，用户已确认本地修复有效。
