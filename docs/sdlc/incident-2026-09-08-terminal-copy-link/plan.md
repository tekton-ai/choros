---
artifact: plan
feature: incident-2026-09-08-terminal-copy-link
author: coding agent for xchunzhao
status: accepted
created: 2026-09-08
intent: ./intent.md
spec: ./spec.md
---

# Plan — 修正现有 Copy 的自动超链接选区取值

用户明确批准按已复现根因修复。此前通用选区字符串清洗已撤回；本计划替代旧方案，workflow 继续暂停。

## Files that change

| File | Change |
|---|---|
| `apps/desktop/src/renderer/lib/terminal/terminal-link-manager.ts` | 保存 public hover 的 URI/range；观察 contextmenu 和 selection 事件，仅为右键自动选择记录真实地址；提供上下文 Copy 取值，释放监听及失效状态。 |
| `apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts` | 转发上下文 Copy 取值，在 detach 时重置；原 getSelection 保持不变。 |
| `apps/desktop/src/renderer/screens/main/components/workspace-view/content-view/tabs-content/terminal/link-providers/multi-line-link-provider.ts` | 现有 hover 回调补传已经计算好的 range，不修改检测/范围算法。 |
| 同目录 `url-link-provider.ts` | 将 URI/range 一起转发给 manager，与 OSC 8 回调一致。 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/use-pane-registry/use-pane-registry.tsx` | 原 Copy 的 onSelect 改用上下文专用取值；菜单文字、启用逻辑与其他操作不变。 |
| 同目录 `components/terminal-pane/terminal-pane.tsx` | link handler effect 依赖已有稳定的 getAction/getIntent 回调，不依赖每次 render 新建的 policy 容器对象，防止 hover 更新反复重装 provider。 |
| `terminal-link-manager.test.ts` | 验证真实地址与显示文本分离、右键自动/手动选择区别、重复复制、hover leave、无关菜单和生命周期失效。 |

## Order of work

1. 保存已复现的 OMP payload 与原有事件顺序作为回归依据，不改第三方 OMP/xterm 源码。
2. hover 保留 public URI/range；contextmenu 捕获阶段保存候选，selection-change 在该原生事件派发期间确认 xterm 的自动链接选择。手动 pointer selection 和无关上下文必须清理来源状态。
3. 上下文 Copy 同时核对当前选择范围与已记录的自动选择，返回真实 URI；否则返回原选区。比较范围时统一 xterm link 的 1-based inclusive 与 selection 的 0-based exclusive 坐标。
4. 对生命周期释放监听并清理状态；不使用通用字符串去括号，不修改菜单/翻译/公共 pane 接口。
5. 用同一份真实 OMP 渲染输出，执行原来的“无预选区→移动到链接→直接右键→Copy”，核对两个位置的实际剪贴板；再验证手动选择保持原样。

## Risks

- 仅凭字符串/范围相等不能确认自动选择：必须结合原始事件来源，手动重选相同范围仍应复制原文本。
- hover leave 会在进入菜单时出现，不能清掉已捕获的 Copy 目标。
- OMP 实际输出有 OSC 8 metadata；不再用无链接 metadata 的 printf 字符串冒充原始场景。
- 当前 policy hook 的返回对象每次 render 重建，原 effect 因而在 hover 更新时重装链接回调。仅改依赖为其已有 useCallback 函数，并让菜单目标在无内容变化的回调刷新中保持，不修改点击策略本身。
- 不同 xterm 坐标约定可能导致边界错误：按公开范围合同做一致转换，不改 selection 自身或 provider 命中范围。

## Proof

原始代码上的运行证据：

| 直接右键位置 | 右键前选区 | 真实 URI | 右键后选区与剪贴板 |
|---|---|---|---|
| OMP label | 空 | `https://www.baidu.com` | `baidu` |
| OMP URL span | 空 | `https://www.baidu.com` | `(https://www.baidu.com)` |

修复后必须两行都复制真实 URI。手动拖选 `(https://www.baidu.com)` 再右键仍保留括号；普通文本、合法内部括号和 URL 打开保持原状。

执行 manager/provider/runtime 定向测试、desktop typecheck，以及真实桌面菜单与系统剪贴板验证。只有数据来自真实 PTY、原有交互和实际剪贴板时才称为端到端通过；不把一次 mock 传参检查当作证明。

### 最终执行结果

- 定向测试：63 passed，0 failed；最终 `tsc --noEmit` 通过。
- 使用本机安装的 OMP 18.0.11 Markdown 渲染器生成 `[baidu](https://www.baidu.com)` 的实际 OSC 8 字节，经真实 PTY 输出。没有启动模型任务，也没有修改 OMP/xterm 依赖源码。
- 最终验证使用当前工作区的独立开发实例、专用测试数据目录和测试工作区，未将用户日常项目作为测试 fixture。
- 下列结果均通过原有鼠标选择/右键/Copy 菜单和实际系统剪贴板读回获得。测试准备使用 PTY 写入，生产实现未调用诊断中读取的私有 `_core`。

| 触发方式 | 右键前选区 | 右键后选区 | 剪贴板 |
|---|---|---|---|
| 直接右键 OMP label | 空 | `baidu` | `https://www.baidu.com` |
| 直接右键 OMP URL span | 空 | `(https://www.baidu.com)` | `https://www.baidu.com` |
| 在上次自动选区内重复右键 | `(https://www.baidu.com)` | 不变 | `https://www.baidu.com` |
| 手动拖选后右键 | `(https://www.baidu.com)` | 不变 | `(https://www.baidu.com)` |
| 手动双击选择后右键 | `(https://www.baidu.com)` | 不变 | `(https://www.baidu.com)` |
| 普通文本直接右键 | 空 | `notes` | `notes` |

- 菜单仍为原有 `Copy⌘C`，没有新增 Copy Link Address 操作或翻译。旧字符串清洗方案及其测试已移除。
- 诊断连接已释放；按用户此前的本地验收要求，开发窗口和这份 OMP 链接样例保持运行，方便直接右键验证。workflow 仍暂停。

无新文案/翻译，无迁移，无自动发布或关闭 issue。失败时撤回本次语义取值改动，不恢复已否定的字符串清洗补丁。

## Author + Status

- **Author:** coding agent for xchunzhao
- **Status:** `accepted` — 用户选择“按这个根因修复”，包括据此修订方案并直接实现、验证的明确授权。
