---
artifact: plan
feature: summer-virgo
author: agent
status: accepted
created: 2026-09-07
intent: ./intent.md
spec: ./spec.md
---

# Plan — Choros 官网产品化改版

前置条件：`intent.md` 与 `spec.md` 均已记录用户接受。此计划为待接受草案；以下为后续实际实施步骤，不表示页面、截图或验证已经完成。

## Files that change

| File | Change |
| --- | --- |
| `apps/site/src/site.ts` | 重做首页、共享页头/页脚和现有 `styles`；保留公开页面及跳转路径。增加受控的 `PUBLIC_SITE_ASSETS` 清单，在现有 `handlePublicSiteRequest` 中返回清单内的图片；新文案使用 Lingui 显式 ID，译文插入 HTML 时转义。 |
| `apps/site/public/assets/choros-logo-light.svg`（new） | 复制已选定的自有品牌素材，保留原比例与路径；不用参考站素材，不重新设计标志。 |
| `apps/site/public/assets/workspace-overview.webp`、`workspace-overview-mobile.webp`（new） | 从真实 Choros 演示环境捕获的桌面总览与手机局部版本。图片有确定尺寸，全部素材总量不超过 spec 的 1.5 MiB。 |
| `apps/site/public/assets/workspace-agents.webp`、`workspace-changes.webp`（new） | 同一真实演示场景的 Agent 进度与改动审查局部；为三段工作流提供具体内容。不得用伪造控件替代实际截图。 |
| `apps/site/src/build.ts` | 从同一资源清单复制图片；将现有 `withBasePath` 的纯字符串替换改为 Bun 原生 HTMLRewriter，处理 href、src、受控 srcset；保留 canonical 页面、旧路径静态跳转页、404 与 `.nojekyll` 输出。 |
| `apps/site/src/site.test.ts` | 保留 HTTP 状态、公开跳转、安全头契约；删除只锁定品牌大小写/标题字串的断言。增加公开图片内容类型/格式以及非白名单资源不能读取文件的行为验证。 |
| `apps/site/package.json` | 添加 `@choros/i18n` workspace 构建期依赖；不增加 React、Next.js、Tailwind、图片处理库或客户端脚本依赖。 |
| `bun.lock` | 由 Bun 更新新增 workspace 依赖关系，不手工编辑。 |
| `packages/i18n/lingui.config.ts` | 将 `apps/site/src` 加入现有 catalog 提取范围，沿用原来的排除、排序与严格编译规则。 |
| `packages/i18n/locales/*/messages.po`、`messages.ts` | 使用显式 `site.*` ID，为新首页与共享导航生成源语言并补齐 17 个已启用 locale 的新增消息；例如 `en`、`zh-CN`、`ja`，其余遵循 `SUPPORTED_LOCALES`。不重写未修改文档正文。 |
| `.github/workflows/deploy-pages.yml` | 沿用现有 CI 的 `bun install --frozen --ignore-scripts`；补齐共享 i18n、根 manifest 和 lockfile 等产物依赖的触发范围。继续构建 `/choros` 静态产物，不更换部署方式。 |

**明确不改：** `apps/auth/**`、桌面认证/回调、数据库、发布工作流、平台打包配置及现有法律正文。`apps/site/src/dev.ts` 的现有入口可保持不变：它已将所有 pathname 交给同一请求处理器，资源分支在该处理器中接入即可。根 `lingui.config.ts` 仅重导出真实配置，无需重复维护。

## Order of work

### 1. 固定现有契约与安全的素材来源

- 在实施前确认文件相对本计划没有用户新增变更；保留所有无关工作，不重置或覆盖。
- 已查询 `handlePublicSiteRequest` 的引用：当前语言服务器不可用，使用文本搜索确认消费者为 `apps/site/src/build.ts`、`dev.ts`、`site.test.ts`。实施时再次优先使用可用的 LSP；该函数继续返回同步 `Response`，不为本次改版改变参数或调用约定。
- `PUBLIC_SITE_PATHS` 的 10 条页面、`PUBLIC_SITE_REDIRECTS` 的 3 条跳转及未知路径的 404 保持不变。图片不加入页面路径集合。
- 按 `cdp-verification` 的目标识别规则检查当前工作区真实 renderer 端口、进程归属与活动路由，不把 `.choros/ports.json` 的静态示例端口当成当前值，也不连接另一个工作区的应用冒充证据。
- 使用当前代码实际支持的登录/会话路径。该 skill 含历史 organization/email-password 例子，与当前个人登录范围不一致时不执行这些旧例子，不造组织数据、不运行 setup `--force`、不修改认证。
- 在专用的无敏感内容演示项目中创建真实工作区、打开 Agent/终端并显示实际改动，截图前清除画面中的私人项目、账号、路径和日志；不触碰用户已有项目。通过真实 UI 输入完成要展示的工作流，不调用内部状态伪造界面。
- 如果需要启动本分支开发实例，使用受监督进程并等待实际 readiness；不能通过改桌面代码、数据库或认证来制造宣传图。实际登录受阻时保留其他可完成工作并报告缺失条件。

### 2. 生成受控图片，统一开发与构建资源

- 通过 Chromium/CDP 的截图能力导出 WebP；必要的裁切/尺寸调整使用系统已有工具，不为素材转换新增项目依赖。保留可识别来源的原始截图作为验证证据，发布目录仅放经过隐私检查的版本。
- 主图展示工作区、Agent/终端与改动审查的实际关系；手机图是同一画面的合理局部，而不是另画的移动产品。原图链接可打开完整桌面图。
- 在 `site.ts` 中定义有限资源清单，键为固定 `/assets/...` URL、值指向仓库内确定的源文件；页面、开发服务器与构建复制消费同一清单。
- `handlePublicSiteRequest` 仅为精确命中的资源路径返回文件 Response，带正确图像 MIME 和 `nosniff`。不将请求路径任意拼接到文件系统，不开放整个仓库目录。非清单路径继续走真实 404。
- `build.ts` 在干净的现有 dist 目录中写入页面并复制所有清单资源；缺少必需素材时构建失败，不静默生成破图页面。

### 3. 落地首页与共享外观

- 在 `getPage('/')` 内实现 spec 的结构：左对齐产品主张、大幅产品图、三段工作流、平台下载区、原生 FAQ。
- 主行动统一跳到首页下载区；公共产品入口统一跳到首页工作流。使用 `/#download`、`/#product` 等根路径，保证从文档页也能正确返回首页锚点。
- 三个平台下载使用 spec 中已经验证的稳定 HTTPS URL，明确标注 Apple Silicon、Intel 与 Linux x86_64。不增加 UA/CPU 自动判断、下载代理、登录、自定义协议或 Windows 占位入口。
- 重用白色 C 形标志及现有 CSS 变量名称；主背景改为中性深色，系统无衬线字体、近白主按钮，绿色仅作小面积强调。移除倾斜终端、巨大的衬线/斜体荧光标题与背景网格。
- 样式仍由现有页面模板输出，不引入组件框架。增加手机双行导航、流式标题、适当触控尺寸、focus-visible、跳至正文、锚点滚动留白与减少动画偏好。
- 文档、更新日志、条款、隐私和状态页仅随共享外观调整；保留正文和链接目的地，不附带内容或政策重写。

### 4. 让译文与发布前缀在构建时正确落地

- 在独立站点模块初始化默认英文一次，通过 `@choros/i18n` 的现有非 React API 输出 `i18n._({ id, message })`。不在每次请求时切换全局 locale，不向浏览器加载 catalog。
- 对进入 HTML 文本或属性的翻译结果使用 `Bun.escapeHTML`。描述符直接出现在可被提取器识别的调用里，不新建会隐藏 message ID 的文案表或包装 DSL；HTML 结构留在模板中，不让译文携带任意标签。
- 添加站点到 Lingui 既有提取范围，生成英文后补齐已启用 locale 的新增消息，沿用引用排序及严格编译。默认英文网站保持无语言选择器，不扩展 locale 路由。
- 保留 `normalizeBasePath` 的既有根路径约定；`withBasePath` 仅对以单个 `/` 开头的站内 URL 添加前缀。HTTPS、协议相对 URL、页内锚点等不错误改写。
- 使用 Bun 原生 HTMLRewriter 处理 `href`、`src` 和 `source`/`img` 的受控 `srcset` 候选。所有 srcset 来源均为本站固定文件名与宽度描述符，不支持或引入 data URL、动态用户内容或通用 CSS URL 重写。
- 移除旧的只替换 `href="/` 的路径，不保留双重前缀处理；相应构建调用等待 HTMLRewriter 的结果。旧重定向页保持现有 meta-refresh/canonical 路径行为，本地 HTTP 308 契约不变。
- 将资产、翻译和构建改动作为同一可运行改版交付，不能先上线新 HTML 再补图或翻译。

### 5. 接入 Pages，完成验证后再交付

- Pages 依赖安装复用 `.github/workflows/ci.yml` 的冻结 lockfile、忽略脚本模式，避免静态发布触发 Electron 原生模块重建。
- 部署 workflow 的路径过滤覆盖 `apps/site/**`、`packages/i18n/**`、根 `package.json`、`bun.lock` 和必要的现有构建配置；继续输出 `apps/site/dist`，保留 `/choros` 和 GitHub Pages 发布权限边界。
- 按下方 Proof 先运行真实页面与产物 smoke，再统一格式化本次源文件、执行针对性验证及 catalog 幂等检查。不为此增加整仓重构或额外监控服务。
- 清理此次创建的临时截图/验证脚本与演示资源，只移除自己的临时内容。保留正式产品素材和最终桌面/手机页面证据。现有网站正文无功能文档变化，因此不另建使用手册或编造更新日志。
- 实现 PR 关联本 `plan.md`，说明运行验证结果；不自动推送、合并、发布应用或部署线上站点。

资源采集和网页结构工作逻辑上独立，但最终图片尺寸与裁切必须在统一渲染前确定；翻译提取依赖文案稳定，Pages 验证依赖资源、文案和构建全部完成。由同一集成负责人负责 `site.ts`、路径重写与最终验收，避免对共享模板并发改写。

## Risks

- **素材不真实或泄露信息 — 中等概率，高隐私影响。** 演示必须在真实应用中完成且只用无敏感项目；以逐图人工可视检查为发布门槛。无法拿到合格素材时不宣称页面完成，不拿旧图/假 UI 兜底。
- **静态路径前缀漏改 — 高概率，中等可用性影响。** 当前 build 只改 href；加入原生 HTML 属性处理，并直接加载 `/choros` 构建产物验证 src、srcset、原图、跨页锚点和旧重定向，而非只看开发服务器。
- **文件服务越界 — 低概率，高安全影响。** 只服务精确资源清单，不新增任意文件路径解析；通过未知资产和越界形式请求确认 404。范围仍是公开静态文件，不涉及鉴权。
- **共享翻译目录产生缺失或噪声 — 高概率，中等跨包影响。** 显式新增站点提取范围、完整翻译新消息并运行严格编译；不重置用户的 catalog 变更。保持提取和引用排序工具一致。
- **CI 本地依赖掩盖发布缺口 — 中等概率，中等发布影响。** 在无现成 node_modules 的受控临时副本中验证冻结安装与 build；不靠本机已安装 workspace link 证明 CI 可运行。
- **移动端截图过小与共享样式回归 — 中等概率，中等 UX 影响。** 主图提供真实局部裁切及原图链接；四种宽度检查首页和深层文档，200% 放大检查可达性，避免把宽图硬缩成不可读缩略图。
- **下载资产在后续版本改名 — 低概率，中等下载影响。** 复用现有 release workflow 的稳定命名，发布前重新 HEAD 检查并保留正式 Releases 入口；不承诺此次已验证安装兼容性。
- **组织政策未独立成文 — 已知，中等审查风险。** 用户已接受 spec 的现有品牌/法律边界；技术与产品审查仍需核对截图隐私、素材许可及既有条款不变，不把用户接受解释为通过了不存在的认证。

## Proof

### 已完成的规划证据

- Bun 1.3.14 环境实际提供 `HTMLRewriter` 与 `Bun.escapeHTML`。内存探针已确认：`/#download` 变为 `/choros/#download`，图片 src 与两个 srcset 候选均得到一个 `/choros` 前缀，外部 GitHub Releases URL 保持不变。该探针不等于最终站点通过验证。
- spec 阶段已通过公开 GitHub API 确认正式版资产，三个稳定安装包链接的 HEAD 均为 200；没有已发布的 Windows 安装包。本次不重复下载数百 MB 安装包。
- 已确认站点请求处理器的实际消费者以及当前 CI 依赖安装模式；LSP 当前不可用，未假称进行过语言服务器引用分析。

### 代码与行为验证

1. **针对性检查：** 本次源文件使用仓库现有 Biome 格式化/检查；执行 `bun run --cwd apps/site typecheck` 与 `bun run --cwd apps/site test`。不依赖整仓测试通过来代替页面验证。
2. **保留有意义的回归覆盖：** canonical 页面 HTTP/MIME、3 个旧路径目的地、未知路径 404、安全头继续通过。删除仅检查 `CHOROS` 或特定标题的正文断言，不将它们重新绑定新文案。新增资产用例验证消费端可见的 MIME、图像格式及未知/越界路径 404，不测试内部清单的字段复制。
3. **国际化：** 提取、补全并严格编译后，按正常实现提交记录本次生成目录，再运行 `bun run --cwd packages/i18n check` 验证重跑无漂移。该检查包含 Git clean 要求；若目录有用户原有修改，保留并明确报告，不重置、藏匿或代提交这些修改。
4. **两种构建：** 分别以 `SITE_BASE_PATH=/`、`SITE_BASE_PATH=/choros` 执行 `bun run --cwd apps/site build`，保存到不同临时预览根下并实际启动静态服务器；不只断言生成文件内某段字符串存在。
5. **干净安装：** 在临时副本复用完整 workspace manifests 与 lockfile，运行 `bun install --frozen --ignore-scripts` 和与 Pages 相同的 build，确认无需 Electron 原生构建或额外秘密变量。检查所有资源被包含。

### 真实页面与产品图验证

- 遵循 `choros-browser`，为该工作区打开专用预览 pane，不覆盖用户当前网页；用 CDP/BrowserTab 的真实点击、键盘和截图检查结果。服务必须等待 readiness，再观察页面。
- 在 1440×900、768px 宽、390×844 和 320px 宽视口分别检查首页；截图必须与 DOM 测量的 viewport、scrollWidth、scrollY 及活动路由一致。若 pane 截图与观测不一致，重新确认目标，不把不匹配图作为证据。
- 路径：页头 Product → 工作流 → Download → 三个平台链接；深层 Docs 页面 → 页头 Download → 首页正确锚点。锚点不能被页头遮住，所有平台链接目的地与标签一致。
- 使用键盘 Tab、Enter/Space 操作导航和 FAQ；检查 focus-visible、跳至正文、44px 主触控目标、文本对比度、200% 缩放和减少动画偏好。禁用 JavaScript后仍能完整操作。
- 分别打开根路径与 `/choros` 产物中的首页、代表性深层文档、完整产品图及旧路径静态跳转，检查站内图片/资源无 404、控制台无新增错误；未知路径仍呈现真实 404 行为。静态 meta 跳转与开发服务器 308 按各自已有部署契约验证，不混为同一种状态码。
- 产品图来源记录目标工作区/renderer、实际演示场景及捕获结果；所有正式图片经隐私检查。只记录不含秘密的元数据，CDP token、会话和账户信息不进入产物或最终输出。
- 交付桌面与手机页面截图、临时预览地址、执行过的命令结果；确认未产生官网认证请求，没有登录/注册/账户/Dashboard 控件，没有未发布 Windows 下载入口。

### 发布边界与回退

- 不增加 feature flag、监控 SDK 或服务器告警：本次是无状态静态页面替换，没有新业务服务。现有 Pages job 的成功状态，加上产物页面、资源和下载路径检查是发布门槛。
- 本次不自动上线。负责人审查页面证据及实现 PR 后，按既有 main → Pages 流程发布；线上复查首页、深层文档、图片与下载目的地。
- 若线上出现空白、破图、错误前缀或不可用下载，先停止继续发布，定位对应页面/资产；由负责人选择正向修复或通过正常 revert commit 恢复上一版页面与资源。无数据库迁移、会话失效或桌面应用回滚。

## Author + Status

- **Author:** agent，依据已接受的 intent/spec、实际代码接口与 Bun 运行探针整理。
- **Status:** `accepted` — 用户于 2026-09-07 在收到“接受计划后开始实施”的说明后回复“继续”，授权执行本计划；agent 记录该人类接受决定。现在进入代码实施、产品图采集与真实页面验证。
