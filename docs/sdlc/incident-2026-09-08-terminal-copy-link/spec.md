---
artifact: spec
feature: incident-2026-09-08-terminal-copy-link
author: coding agent for xchunzhao
status: accepted
created: 2026-09-08
intent: ./intent.md
---

# Spec — 最小 URL 单元格范围修复

用户明确要求只保留已确认的最小修复，其余任务改动全部回退。本规格取代此前 Copy 真实 URI 覆盖方案；最终 PR 只保留一个生产文件和一个测试文件，审批记录留在 Git 历史。

## Requirements & design spec

### Functional requirements

- `百度的网址是：https://www.baidu.com` 的 URL 范围必须是第 15–35 列，不能把 UTF-16 偏移 7 当作屏幕偏移 7。
- 使用 xterm 已有 cell 的 `getChars()` 与 `getWidth()` 换算，不手写 Unicode 宽度规则。
- 起止位置正确处理宽字符、组合字符、代理对、软换行、URL 内宽字符及行尾。
- Copy 菜单、快捷键、状态、事件接线全部恢复原样；不改变 OSC 8 label 的原始复制语义。

### Non-functional requirements

不新增依赖、全局状态或共享接口；只在 URL 现有偏移映射边界读取原生 cell。

### Out of scope

Copy URI 缓存、runtime 接线、点击策略回调调整、共享 buffer helper 修改、workflow 和文案变更。

## Integration with existing code

仅修改 `multi-line-link-provider.ts` 的偏移映射与无法映射时的空结果处理；仅在 `url-link-provider.test.ts` 补齐实际 cell 模型与回归。

## Policy compliance

### Brand

不改 UI 文案与菜单。

### Security

不访问网络、不新增权限或持久状态。

### Compliance

不采集或上传用户业务数据。

### UX

只纠正链接高亮及原生自动选区位置；复制行为不作额外覆盖。

## Areas of concern

先前共享 helper 试改并非此最小方案所需，必须撤回。最终仍需真实桌面验证，内存对照通过不等同于交付完成。

## Author + Status

- **Author:** coding agent for xchunzhao
- **Status:** `accepted` — 用户明确表示按最小修复版本实施，其他改动都不需要。
