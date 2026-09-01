---
artifact: intent
feature: rebrand
author: XXLOKI
status: accepted
created: 2026-09-01
accepted: 2026-09-01
---

> **Scope clarification (2026-09-01, post-spec-draft):** later exploration confirmed this repo is a personal fork
> at `tekton-ai/superset` (owned by the author), not the upstream corporate Superset. The rebrand therefore
> only covers what the author actually controls: the fork's own code, config, docs, and any releases the author
> personally builds. Upstream `superset-sh` — including `superset.sh` domain, vendor integration console names,
> App Store presence, and the `@superset/*` npm scope — is out of scope. The stated legal driver is refined to
> "the author does not want to keep publishing personal work under the `Superset` name and accepts any personal
> trademark risk of adopting `Choros`" — treated as equivalent to a hard legal driver for planning purposes.

# Intent — Retire the "Superset" brand, adopt "Choros"

## Problem

法务发现 "Superset" 商标存在冲突，我们无法继续以此名义对外发布产品。这个名字今天出现在几乎所有面向用户的表面：桌面 app 窗口标题、CLI 二进制 `superset`、npm scope `@superset/*`、Electron/mobile bundle id、GitHub org `superset-sh/superset`、marketing 页面、文档、i18n glossary（明确列为"永不翻译"）、公开域名。只要有一处仍以 Superset 出现，我们就仍在同一个法务风险敞口里。这是硬性合规问题，不是审美迭代。

Evidence：法务提出的商标冲突通知（驱动本次工作的唯一来源；ticket 编号 spec 阶段补入）。

## Proposed outcome

产品对外不再以 "Superset" 呈现，改以 **Choros**（源自古希腊语 χορός，"合唱队/群舞"—— 众多表演者在一个指挥者下同步行动，直接对应产品定位"Bring Any Agent. Orchestrate Them All."）。新用户在下载页、桌面 app、CLI、文档、社群链接、GitHub 里看到的都是 Choros；老用户升级后本地 app、CLI 命令、菜单、更新通知也不再出现旧名字。法务能够合上这张 ticket，公开表面无残留露出。

## Affected users and systems

**用户：**
- 现有桌面 app 用户 —— bundle id 改变意味着 macOS 视为全新应用：Gatekeeper 需重新放行，Keychain 条目失效，需要显式迁移流程。
- 现有 CLI 用户 —— `superset` 命令被 `choros` 取代；用户脚本、shell alias、CI 配置需要更新。旧命令**不保留 alias**（决策：彻底消失）。
- 现有 npm 包消费者 —— `@superset/*` 停止发布新版本；`@choros/*` 全量接手。已发布版本因 registry 不可撤回而保留在历史里。
- Web / marketing 站点访客 —— 旧域名新域名上线后直接下线（**不做 301**）。
- Mobile app 用户 —— App Store bundle id 变更等同新上架，老用户不会自动迁移。
- 开发者/贡献者 —— GitHub org 与 repo 换名，外链、CI 徽章、文档全部要跟。
- 代码内贡献者 —— 内部标识符（`Superset*` 变量/类/模块名）一并改。

**系统（初步扫描，spec 阶段补精确文件路径）：**
- `apps/desktop/` —— Electron app 名、bundle id、about 面板、菜单、auto-update feed URL、本地存储路径迁移
- `apps/mobile/` —— iOS bundle id、App Store metadata
- `apps/web/`、`apps/marketing/` —— 品牌资产、hero copy（含 `packages/i18n` 的 marketing.hero.* 目录条目）、domain 相关配置
- `apps/api/`, `apps/admin/`, `apps/docs/`, `apps/discord-triage/` —— 面向用户或运营的所有 UI 字符串
- `packages/cli/`、`packages/cli-framework/` —— 二进制名 `superset` → `choros`，命令补全脚本、`AGENTS.md` 内所有示例
- `packages/i18n/` —— glossary 把 `Superset` 移除、加入 `Choros` 为 never-translate；所有 locale catalog 中 `Superset` 出现的字符串同步替换；`compile --strict` 会挡半迁移
- `packages/db/` —— 迁移文件与 seed 中提及旧名的地方
- 所有 `packages/*` —— npm scope `@superset/*` → `@choros/*`，`package.json`、`import` 语句、`tsconfig` paths、依赖图全线
- `AGENTS.md`、`.agents/skills/*`、`docs/` —— 内部文档中 Superset 出现处
- GitHub org（`superset-sh` → 新 org，具体名 spec 阶段决定）、repo 名、`.github/` 配置
- 公开域名、DNS、邮箱后缀、auto-update / release feed URL
- 代码内部标识符（`Superset*` 命名的变量、类、类型、模块、目录名）

## Constraints

**硬约束：**
- 旧名字 "Superset" 在**当前发布版本**的任何表面必须消失 —— 包名、bundle id、CLI 二进制名、窗口/菜单/UI、公开域名、GitHub org、marketing 露出、代码内部标识符。历史 git commit / 已发布 npm tarball / 已归档桌面安装包不改写。
- CLI 不保留 `superset` alias —— 用户需明确切到 `choros`。
- 旧域名新域名上线后直接下线（不做 301 长期持有）。
- 桌面/mobile 现有用户升级不能丢数据：bundle id 变更时必须提供自动迁移路径（旧 app 启动一次即导出本地存储 → 新 app 首次启动导入 + Keychain 重新授权流程）。auto-update 必须能从旧 feed 平滑切到新 feed。
- npm 包切换需要在旧 scope 发布最终的 `deprecated` 版本，把消费者指向新 scope。已发布版本因 registry policy 不可撤回。
- i18n：`Choros` 进入 glossary never-translate；每个 `SUPPORTED_LOCALES` 中的 `Superset` 字符串同步替换，不能出现半翻译（`compile --strict` 会挡）。
- 合规驱动：本次变更优先级高于其它非合规工作，spec 阶段前不能被功能路线图挤掉。

**软约束：**
- "尽快" —— 具体截止日期待 spec 阶段向法务确认。
- 内部标识符改名工作量巨大且用户不可见，风险高、价值低，但用户已明确决定一并改（可接受爆炸半径换品牌一致性）。spec 阶段应估算工作量并给出分阶段执行策略。

## Open questions (spec 阶段解决)

- **法务硬截止日期是什么？** "尽快"必须落成具体日期，直接决定发布策略（大爆炸 vs 分阶段）。
- **新 GitHub org 具体叫什么？** `Choros` 已被 2014 年的休眠组织占用（无联系人、无活动、5 repo）。选项：(a) 走 GitHub dormant account 申诉流程认领，(b) 使用后缀 `choros-sh` / `getchoros` / `choros-labs` / `usechoros`。spec 阶段决定并做备份方案。
- **新域名根 zone？** `choros.dev` / `choros.ai` HTTP 200 响应（可能被占或停车页），需要 whois 与商标复查确认；.com 从当前 sandbox 无法 reach，也需查。
- **商标可用性：** 我在此做的只是 namespace 快查，不构成商标结论。spec 阶段必须由法务完成 Choros 在目标司法辖区的商标检索并出结论。若冲突，整个 intent 需回滚重选名字。
- **桌面本地存储迁移的确切机制？** 旧 app 何时导出（首次启动检测、退出 hook、还是显式菜单项）、新 app 何时导入、Keychain 项如何过渡（用户重新授权 vs 引导页）—— spec 阶段确定用户体验流。
- **marketing 社交账号 handle 是否也换？** 用户初次选择"scope"时未勾选，但既然 "彻底消失"含 GitHub org，社交账号大概率同标准。spec 阶段与 marketing 对齐。
- **发布节奏：** 桌面/CLI/npm/域名/GitHub org 同时切换还是分阶段？大爆炸风险大但敞口时间短；分阶段风险小但敞口时间长。取决于法务截止日期。

## Author + Status

- **Author:** XXLOKI (xchunzhao@gmail.com)
- **Status:** `accepted` — product owner 决策已入 frontmatter，进入 spec 阶段
