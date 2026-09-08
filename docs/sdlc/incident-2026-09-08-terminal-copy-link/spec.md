---
artifact: spec
feature: incident-2026-09-08-terminal-copy-link
author: coding agent for xchunzhao
status: accepted
created: 2026-09-08
intent: ./intent.md
---

# Spec — 沿现有 Copy 触发链复制超链接真实地址

用户否定了通用选区去括号方案，要求查清原触发行为；随后确认是 Oh My Pi 输出上直接右键。已用本机 OMP 18.0.11 的 Markdown 渲染器输出复现。用户选择“按这个根因修复”，明确批准本次修订。

## Requirements & design spec

### Functional requirements

- 保留现有 Copy 菜单、文案、启用条件和点击入口；不新增 Copy Link Address 菜单。
- xterm 右键自动选中超链接显示范围时，Copy 使用该链接已解析的真实 HTTP(S) URI，不使用显示文本。
- OMP 将 `[baidu](https://www.baidu.com)` 渲染成两个 OSC 8 span：显示 `baidu` 与 `(https://www.baidu.com)`，两者 target 均为 `https://www.baidu.com`。直接右键任一 span 后 Copy 均复制该真实地址。
- 明确区分自动链接选择与手动选择。拖选、双击选区以及非链接文本的普通 Copy 仍原样复制；不能对任意选区通用去括号。
- 打开菜单引起的 hover leave 不能丢失已捕获的链接目标；新的上下文菜单、手动选区、pane detach/dispose、滚动/resize/buffer 切换不能复用不相干目标。
- 复制不重新序列化 URI，保留合法括号、编码、query 和 fragment。原生快捷键 Copy、链接打开策略和文件链接不变。
- 用户后续指出普通 URL 的高亮多包含右括号：修正检测范围从排他终点到 xterm 包含终点的 off-by-one，不删除 OMP 输出的格式括号，不在剪贴板结果上裁剪。

### Non-functional requirements

复用现有 xterm public link hover/selection/event API，不读取私有 `_core` 做生产逻辑，不扫描全 scrollback、不新增依赖/持久状态/网络请求。

### Out of scope

通用字符串裁剪、新菜单/文案/翻译、Markdown label 猜测、provider 检测范围重构、workflow 实现。此前 wrapper-only 补丁及其测试已撤回。

## Integration with existing code

- `SelectionService._selectWordAtCursor` 优先选中 `currentLink.link.range`，而不是按 wordSeparator 分词。
- OMP 的括号在显示 span 中，但真实 URI 没有括号。Choros 的 Copy 使用 `terminalRuntimeRegistry.getSelection()`，因此复制了 span 显示文本。
- `TerminalLinkManager` 只从现有 hover 回调读取 URI；原生 contextmenu 引发 selection-change 时，用 `getSelectionPosition()` 给该选区记录复制值。所有保存的范围都来自同一个原生选区 API，不再让 provider 额外传递 range。registry 为原有 Copy 转发取值，普通 getSelection 不变。
- 普通 URL 的解析文本原本已无外围括号；错误在 `calculateLinkRange` 把排他 matchEnd 当成包含终点。只在生成最终范围时减去一个终点单元格，地址字符串本身不变。

## Policy compliance

### Brand

不改菜单和文案，不留下翻译修改。

### Security

仅复用既有 HTTP(S) 链接目标，不打开链接或扩大协议权限；上下文选择与手动选择分离，避免误改普通剪贴板内容。

### Compliance

不新增用户数据持久化或遥测，验证使用公开示例链接。

### UX

用户仍按原有方式直接右键再点 Copy；不要求先拖选，也不增加操作。不同显示文本指向同一 URI 时复制结果一致。

## Areas of concern

- 自动与手动选择的来源判定必须通过事件顺序和实际行为验证，不能仅因选区恰好等于 URL 就推断自动选择。
- 生产代码仅使用 public xterm API；诊断时读取的 `_core.linkifier.currentLink` 不进入实现。

## Author + Status

- **Author:** coding agent for xchunzhao
- **Status:** `accepted` — 用户在已展示原始失败链路后选择“按这个根因修复”；记录本次明确修订授权。
