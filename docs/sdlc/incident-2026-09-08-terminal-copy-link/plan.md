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

用户随后要求尝试等价精简。本次将复制值绑定到原生选区，撤回 provider 的额外 range 参数；并根据用户指出的实际高亮问题，追加已复现的排他/包含终点修正。未变更已验收的 Copy/手动选择语义。

## Files that change

| File | Change |
|---|---|
| `apps/desktop/src/renderer/lib/terminal/terminal-link-manager.ts` | hover 只保存 URI；原生选区建立时记录一份 CopySelection，菜单引用该记录；保留手动选择、输出刷新和重复右键的必要边界。 |
| `apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts` | 转发上下文 Copy 取值，在 detach 时重置；原 getSelection 保持不变。 |
| `apps/desktop/src/renderer/screens/main/components/workspace-view/content-view/tabs-content/terminal/link-providers/multi-line-link-provider.ts` | 撤回额外 range 回调参数；唯一剩余改动是修正排他 matchEnd 转换为包含终点时的 off-by-one。 |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/use-pane-registry/use-pane-registry.tsx` | 原 Copy 的 onSelect 改用上下文专用取值；菜单文字、启用逻辑与其他操作不变。 |
| 同目录 `components/terminal-pane/terminal-pane.tsx` | link handler effect 依赖已有稳定的 getAction/getIntent 回调，不依赖每次 render 新建的 policy 容器对象，防止 hover 更新反复重装 provider。 |
| `terminal-link-manager.test.ts` | 验证真实地址与显示文本分离、右键自动/手动选择区别、重复复制、hover leave、无关菜单和生命周期失效。 |
| `url-link-provider.test.ts` | 验证高亮不会包含外围右括号，以及 URL 恰好结束在行尾时不选入下一行标点。 |

## Order of work

1. 保存已复现的 OMP payload 与原有事件顺序作为回归依据，不改第三方 OMP/xterm 源码。
2. hover 只保留 URI；contextmenu 捕获候选，selection-change 在该原生事件期间记录其实际 `getSelectionPosition()`，不再维护多份链接范围。
3. 原有 Copy 返回当前菜单绑定选区的 URI，否则原样返回文本。复用上一次自动选区时，仍确认点击在该选区内；否则右键空白会错误复用旧 URI，这项删除尝试已被等价性测试阻止。
4. 对生命周期释放监听并清理状态；不使用通用字符串去括号，不修改菜单/翻译/公共 pane 接口。
5. 用同一份真实 OMP 渲染输出，执行原来的“无预选区→移动到链接→直接右键→Copy”，核对两个位置的实际剪贴板；再验证手动选择保持原样。

## Risks

- 仅凭字符串/范围相等不能确认自动选择：必须结合原始事件来源，手动重选相同范围仍应复制原文本。
- hover leave 会在进入菜单时出现，不能清掉已捕获的 Copy 目标。
- OMP 实际输出有 OSC 8 metadata；不再用无链接 metadata 的 printf 字符串冒充原始场景。
- 当前 policy hook 的返回对象每次 render 重建，原 effect 因而在 hover 更新时重装链接回调。仅改依赖为其已有 useCallback 函数，并让菜单目标在无内容变化的回调刷新中保持，不修改点击策略本身。
- 所有缓存范围统一来自原生选区 API，不再转换两套坐标约定。普通 URL 高亮的独立缺陷则在 provider 的最终范围出口修正，不能用复制后裁剪掩盖。

## Proof

原始代码上的运行证据：

| 直接右键位置 | 右键前选区 | 真实 URI | 右键后选区与剪贴板 |
|---|---|---|---|
| OMP label | 空 | `https://www.baidu.com` | `baidu` |
| OMP URL span | 空 | `https://www.baidu.com` | `(https://www.baidu.com)` |

修复后必须两行都复制真实 URI。手动拖选 `(https://www.baidu.com)` 再右键仍保留括号；普通文本、合法内部括号和 URL 打开保持原状。

执行 manager/provider/runtime 定向测试、desktop typecheck，以及真实桌面菜单与系统剪贴板验证。只有数据来自真实 PTY、原有交互和实际剪贴板时才称为端到端通过；不把一次 mock 传参检查当作证明。

### 初版执行结果

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

### 等价精简与高亮修正结果

- 原 63 项回归保持通过；增加空白点击等价性检查和两项终点回归后，66 passed、0 failed。最终类型检查和全仓 lint 通过。
- Copy 相关持久字段从 5 个收敛为 3 个，实际 URI/范围只保存在一份原生选区绑定中；`url-link-provider.ts` 完全恢复原状，两个 provider 都不再额外传递 range。
- 不能直接删除所有点击检查：无此检查时，在旧自动选区之外右键空白会错误复制旧 URI。保留了只针对现有选区的必要判断，没有放宽原行为。
- 同一份 OMP 输出上的原六种真实操作全部重跑通过，结果与上表一致。
- 用户看到的单个尾括号高亮来自无 OSC 8 元数据的普通 URL 检测。修复前测试得到 `https://www.baidu.com)`；根因是排他终点被当成包含终点。修复后实际终端范围结束在 `m`，后续 `)` 不再属于链接；右键选区和剪贴板均为 `https://www.baidu.com`。
- 高亮修正不删除显示文本里的括号；OMP 显式 OSC 8 span 的显示范围仍由 OMP 定义。

![自动检测 URL 的高亮止于地址末尾，右侧括号不在选区](./url-highlight-after.png)

无新文案/翻译，无迁移，无自动发布或关闭 issue。失败时撤回本次语义取值改动，不恢复已否定的字符串清洗补丁。

## Author + Status

- **Author:** coding agent for xchunzhao
- **Status:** `accepted` — 用户选择“按这个根因修复”，包括据此修订方案并直接实现、验证的明确授权。
