# services/
> L2 | 父级: /CLAUDE.md

> 最近更新: 文档对齐当前实现；`splitTextIntoCards()` 对外返回 `CardSegment[]`，Gemini key 由 Vite 注入为 `process.env.API_KEY`

外部服务集成层 — 封装所有与外部 API 的通信。纯函数接口，副作用隔离于此层。

## 成员清单

geminiService.ts: Google Gemini AI 文字切分服务；接收原始长文 + CardConfig，最终输出 `CardSegment[]`；内部仍会消费 Gemini 的 JSON 结构（segments + themeTag），再经过容量校验、封面补齐、顺序流折叠与主题标签回退后返回

## 核心职责分布

```
splitTextIntoCards()
 ├─ getCapacityGuide()        — 按宽高比+字号计算目标词数
 ├─ estimateSegmentOccupancy() — 估算卡片文字占用率 (0-1)
 ├─ extractExplicitHeadings()  — 提取 Markdown 标题作分段线索
 ├─ [Gemini API Call]          — 语义切分 + JSON 响应
 ├─ [Post-processing]          — 验证容量、主题标签回退、顺序流折叠
 └─ [Fallback Splitter]        — API 失败时使用本地启发式切分兜底
```

## 关键设计决策

- CJK 字符按 1字符 ≈ 1词当量单独计数，与英文词频分开处理
- Markdown 代码块（fenced block）视为原子单元，不跨卡分割
- 切分结果首尾自动补齐封面 / 封底卡，并为 cover 注入共享主题标签
- 当源文没有显式标题结构时，会优先折叠为顺序阅读流，减少机械分段
- API Key 通过 `vite.config.ts` 注入为浏览器侧 `process.env.API_KEY`，避免源码硬编码

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
