---
artifact: plan
feature: incident-2026-09-08-terminal-copy-link
author: coding agent for xchunzhao
status: accepted
created: 2026-09-08
intent: ./intent.md
spec: ./spec.md
---

# Plan — 只保留两个文件的最小修复

用户明确批准最小版本，并要求回退其他改动。最终 PR 仅保留以下两个文件；此前审批文档和讨论资料退出最终 diff，已提交版本保留在 Git 历史。

## Files that change

| File | Change |
|---|---|
| `apps/desktop/src/renderer/screens/main/components/workspace-view/content-view/tabs-content/terminal/link-providers/multi-line-link-provider.ts` | 在现有 offsetToPosition 中按原生 cell 字符长度与宽度映射；无法映射时不生成错误范围。 |
| 同目录 `url-link-provider.test.ts` | 补齐 ASCII mock cell，加入截图中文前缀和真实 Unicode/wrap 边界回归。 |

## Order of work

1. 恢复 Copy manager、registry、pane 接线与共享 buffer helper，撤掉关联测试改动。
2. 落实已在内存对照中通过的单文件原生 cell 映射；不依赖共享 helper，不另写 Unicode 表。
3. 运行相关回归与类型/lint检查，并在新测试终端重放截图文本，检查实际高亮和原有 Copy。
4. 将旧流程资料归档，最终 PR diff 严格只有两个文件；不重置整仓或删除用户已有工作。

## Risks

- 宽字符的 padding cell 不计为额外字符；组合字符串的 UTF-16 长度可能超过物理列数，不能按 cols 截断字符串计数。
- 现有 Copy 恢复原样，因此之前单独新增的 OSC 8 URI 复制覆盖不再交付；不能宣称仍解决原 issue 的所有复制语义。

## Proof

只读对照已用真实 xterm buffer 覆盖 9 个针对性案例，单文件原生 cell 候选全部通过。落地后仍需相关测试、类型/lint及真实桌面截图场景验证。

无新依赖、无文案/菜单变更、无共享 helper 行为变化；最终以相对基线的两个文件 diff 验证范围。

## Author + Status

- **Author:** coding agent for xchunzhao
- **Status:** `accepted` — 用户明确要求按该最小修复版本实施，并回退其他任务改动。
