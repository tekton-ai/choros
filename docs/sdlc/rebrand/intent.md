---
artifact: intent
feature: rebrand
author: XXLOKI
status: draft
created: 2026-09-01
---

# Intent — Retire the "Superset" brand

## Problem

法务发现 "Superset" 商标存在冲突，我们无法继续以此名义对外发布产品。今天这个名字出现在几乎所有面向用户的表面：桌面 app 的窗口标题、CLI 二进制、marketing 页面、文档、i18n glossary（明确列为"永不翻译"）、以及公开域名。只要有一处仍以 Superset 出现，我们就还暴露在同一个法务风险里。这是一个硬性合规问题，不是审美迭代。

Evidence：法务提出的商标冲突通知（驱动本次工作的唯一来源；ticket 编号待补入 spec 阶段）。

## Proposed outcome

产品对外不再以 "Superset" 呈现：新用户在下载页、桌面 app、CLI 帮助、文档、社群链接里看到的都是新品牌；老用户升级后本地 app 的窗口、菜单、更新通知也不再出现旧名字。法务能够合上这张 ticket，不再有"仍在使用 Superset"的残留露出。

## Affected users and systems

**用户：**
- 现有桌面 app 用户（升级路径需要处理旧配置目录、旧 auto-update feed）。
- Web app / marketing 站点访客（域名切换、SEO 迁移）。
- Mobile app 用户（App Store metadata、bundle id 是否可改需 spec 阶段确认）。
- 开发者/贡献者（CLI 命令名、包名、仓库名）。

**系统（初步扫描，spec 阶段补充精确文件路径）：**
- `apps/desktop/`（Electron app 名、about 面板、菜单）
- `apps/mobile/`（iOS bundle metadata）
- `apps/web/`, marketing pages
- `packages/cli/` (`superset` 二进制)
- `packages/i18n/`（glossary 中 "Superset" 条目 + 各 locale catalog 中出现的字符串）
- `packages/db/`（无用户可见字符串，但迁移文件里可能提及）
- `AGENTS.md` 及所有 `.agents/skills/*`（agent 面向的内部文档，不对外，但仍是旧名字的密集出现地）
- 公开域名 + DNS + 邮箱后缀
- Auto-update / release feed URL
- GitHub org / repo 名（待 spec 阶段决定是否重命名）

## Constraints

**硬约束：**
- 旧名字 "Superset" 在**当前发布版本**的任何用户可见表面必须消失（包名、bundle id、CLI 二进制名、窗口标题、UI 文案、公开域名、marketing 露出）。历史 git commit / 已发布归档保持不变（不改写历史）。
- 变更本身是法务驱动的合规行为，不能被其它优先级挤掉。
- 现有用户升级不能丢数据：本地存储路径若改名，必须提供自动迁移；auto-update 必须能从旧 feed 平滑切到新 feed。
- i18n：新名字进入 `packages/i18n/glossary.md` 的 never-translate 列表；`SUPPORTED_LOCALES` 中每一种语言的字符串必须同步替换，不能出现部分翻译（`compile --strict` 会挡）。

**软约束：**
- "尽快" —— 没有具体截止日期，但法务风险窗口开着，spec 阶段应向法务确认目标日期。

## Open questions

- **新品牌名叫什么？** 目前未定；spec 阶段前必须由 product owner + 法务共同确定（含商标检索）。这是所有下游工作的先决条件。
- **"彻底消失"边界到哪里？** 是否包含：(a) `packages/cli` 的 `superset` 二进制名（改名会影响所有既有用户脚本和 `AGENTS.md` 里的示例）；(b) npm 包名 `@superset/*`（发布过的旧版本无法撤回）；(c) Electron bundle id（改动会导致 macOS Gatekeeper 视为新 app、Keychain 条目失效）；(d) GitHub org / 仓库名（会影响所有外链）。选项不同，工作量差一个数量级。
- **旧域名的处置？** 用户勾选了"域名/URL"在范围内，但没说明旧域名策略：直接下线、301 到新域名、还是短期 hold 防钓鱼。法务视角可能有强意见。
- **marketing 社交账号是否在范围内？** 用户未勾选，但如果法务要求"旧名字彻底消失"，社交账号 handle 大概率也算，需要 product owner 明确。
- **法务给的目标日期是什么？** "尽快"需要落成具体日期，spec 阶段必须补齐。
- **代码内部标识符（变量名、模块名、类型名叫 `Superset*`）是否要改？** 不对用户可见，改动风险高、价值低；spec 阶段建议明确"内部标识符不在范围内"以控制爆炸半径。

## Author + Status

- **Author:** XXLOKI (xchunzhao@gmail.com)
- **Status:** `draft` — flip to `accepted` when the product owner merges this artifact
