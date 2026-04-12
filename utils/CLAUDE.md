# utils/
> L2 | 父级: /CLAUDE.md

> 最近更新: 文档对齐当前调用关系；`textSplit.ts` 同时服务于 `geminiService`、`Card` 与 `App`，`gradientBackground.ts` 为首页 / 封面渐变提供生成与导出能力

纯函数工具层 — 零副作用，零外部依赖，可独立测试。两个模块各司其职：文字解析 vs 图形渲染。

## 成员清单

textSplit.ts: 多粒度文字切分工具集；提供 段落→句子→子句→标点 四层分割粒度，内建 CJK 标点识别与 Markdown 原子块保护；当前被 `geminiService.ts`、`Card.tsx` 与 `App.tsx` 消费

gradientBackground.ts: WebGL 渐变背景渲染引擎；以 GLSL Fragment Shader 实现 5 种渐变类型 × 14 种 Warp 变形；提供随机生成、DataURL 输出与颜色提取三个公开接口；当前主要用于 `App.tsx` 里的 editorial 渐变背景生成与导出；WebGL 不可用时降级为 Canvas 2D

## 导出接口速览

### textSplit.ts
| 函数 | 用途 |
|------|------|
| `splitIntoSentences(text)` | 句子切分，识别 CJK/英文双标点 |
| `splitIntoClauses(text)` | 子句切分（逗号、冒号） |
| `splitAtNearestPunctuation(text, max)` | 贪心截断到最近标点 |
| `splitFencedMarkdownBlock()` | 提取代码围栏块 |
| `isAtomicMarkdownBlock()` | 判断是否为不可分割块 |
| `carvePrefixForRebalance()` | 为溢出重分配裁出前缀 |
| `splitIntoMarkdownBlocks()` | 解析完整 Markdown 结构 |

### gradientBackground.ts
| 函数 | 用途 |
|------|------|
| `createDefaultGradientBackground()` | 随机生成渐变配置（含 seed） |
| `renderGradientBackgroundToDataUrl(config, w, h)` | 渲染为 Base64 DataURL |
| `getGradientColors(config)` | 提取配置中的颜色列表 |

## 设计原则

- textSplit 的分割层次遵循语义优先：不在句子中间截断，优先在段落边界分割
- gradientBackground 的 seed 参数保证相同 config 每次渲染结果一致（确定性）
- `renderGradientBackgroundToDataUrl()` 允许 UI 层在不持有 Canvas 实例的情况下直接获得可渲染的背景图
- 两个模块均无 React 依赖，可在 Node 环境或测试框架中直接运行

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
