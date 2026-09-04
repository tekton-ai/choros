---
artifact: intent
feature: personal-first-product-scope
author: xiaochunzhao
status: accepted
created: 2026-09-03
---

# Intent — 明确个人优先的产品边界

## Problem

当前项目从 Superset 复刻而来，仍保留大量围绕 organization、team、member、invite、permission、billing、remote host、cloud workspace、automation 和第三方协作集成设计的云端能力。产品 owner 已明确产品只服务个人用户，但当前桌面端、CLI、认证、通用 API、数据库和部署边界仍按多人云产品设计，导致用户流程与维护成本远超实际需要。逐项审查同时确认，个人产品仍需要 GitHub/Google 登录、最小使用统计和最新版本下发；问题不是“完全无服务端”，而是服务端职责没有被收敛到这三个明确目的。

## Proposed outcome

产品成为带个人登录的本地优先开发工具：用户通过 GitHub 或 Google 创建个人账户，登录后只使用当前机器上的单一本地 profile；project、workspace、terminal、agent/chat history 和设置不归属云端账户，也不在设备之间同步。Choros 线上只保留三条窄能力：OAuth 认证、记录一次 `desktop_opened` 基础事件、发布静态最新版本 manifest。产品 owner 可直接查询数据库回答每日有多少登录用户打开过应用；除此之外，不再维护通用云产品 API、协作模型或服务端业务数据。

## Affected users and systems

- **主要用户：** 独立使用产品的个人开发者。
- **内部角色：** 需要查看每日活跃登录用户并维护发布版本的产品 owner。
- **客户端系统：** Electron desktop、仅本机可用的 host service、本地 workspace/terminal/agent/chat runtime，以及只保留本地能力的 CLI。
- **认证与统计系统：** GitHub/Google OAuth、个人 user/account/session，以及 authenticated `desktop_opened` 基础事件表。
- **版本系统：** 由发布流程生成并托管的只读静态版本 manifest；只提示更新，不阻断旧版本或离线使用。
- **仓库事项系统：** 通过用户本机 `gh`/Git credential 访问 GitHub Issue/PR，并支持 Issue/PR → Workspace/Agent；不经过 Choros 服务端 integration。
- **待退役系统：** organization/team/member/invite/role、Task 云系统、Linear、Automation、remote host、relay、cloud workspace、cloud chat、billing/paywall、API key、server-driven rich notices、PostHog product analytics 及其他服务端业务 integrations。

## Constraints

- 产品必须以个人用户为唯一使用者模型；不得用隐藏单人 organization 延续协作领域模型。
- 首次使用需要联网完成 GitHub 或 Google OAuth。登录过的用户可凭本机安全缓存离线继续；认证或统计服务不可用不得阻断本地功能。
- 服务端只持久化认证记录和基础使用事件，不存 project、workspace、task、automation、chat、repository 或其他产品业务数据。
- 本机只有一个与登录账户无关的 local profile。退出或切换账户不得删除、隐藏或切换本地 project、workspace、chat、credential 和设置。
- 首次登录后进入精简本地 onboarding，只引导模型凭据和第一个本地 project；Account UI 只显示当前身份与退出。
- 自有 Task 页面删除；GitHub Issue/PR 入口放在各自 Project 内，并继续支持创建 Workspace/Agent。
- 使用统计首版只记录 `desktop_opened`，字段限定为 event ID、user ID、event name、occurred-at、app version、platform 和 schema version，不允许任意 properties JSON；原始事件保留 365 天。
- 产品 owner 直接以只读方式查询数据库，不新增统计后台或读取 API。
- GitHub 与 Google 对所有人开放 OAuth 注册；沿用 Better Auth 当前行为，仅在 provider 确认相同 verified email 时隐式链接账户。不提供邮箱/密码注册、invite 或 allowlist。
- 静态版本 manifest 只包含 schema version、latest version、published-at 和发布/下载入口；不可达时静默继续，不作为本地使用门禁。
- Sentry 接入代码可以保留，但默认不配置 DSN、不发送；未来启用前必须确认目的地已替换为 owner 自己的项目。PostHog exception capture 与其他 product analytics 均移除。
- 产品尚未发布且没有真实旧用户数据或受支持旧客户端，因此不构建兼容迁移；允许重置全部开发数据库，但绝不删除用户磁盘上的 Git 仓库或文件。
- plan 仍必须追踪桌面、CLI、host-service、后台任务、webhook 和部署配置，完成无兼容层的干净切换。

## Open questions

- 首版不提供自助账户删除是否满足适用的隐私与平台政策？该项需要 Privacy/Legal 或 tech lead 明确审查。
- 产品 owner 已要求 telemetry opt-out/consent UI 延后；适用法律是否要求它在首次生产发布前完成？
- Sentry 当前配置是否仍指向 Superset 所有的项目；未来启用前需要怎样的 secret 轮换和数据边界审查？

## Author + Status

- **Author:** xiaochunzhao
- **Status:** `accepted` — 产品 owner 在逐项决策后于 2026-09-03 重新确认
