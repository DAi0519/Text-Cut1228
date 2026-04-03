# services/
> L2 | 父级: /CLAUDE.md

外部服务集成层 — 封装所有与外部 API 的通信。纯函数接口，副作用隔离于此层。

## 成员清单

geminiService.ts: Google Gemini AI 文字切分服务；接收原始长文 + CardConfig，输出 SplitResponse (segments[] + themeTag)；内含容量计算、占用率估算、Markdown 原子块保护与后处理逻辑

## 核心职责分布

```
splitTextIntoCards()
 ├─ getCapacityGuide()        — 按宽高比+字号计算目标词数
 ├─ estimateSegmentOccupancy() — 估算卡片文字占用率 (0-1)
 ├─ extractExplicitHeadings()  — 提取 Markdown 标题作分段线索
 ├─ [Gemini API Call]          — 语义切分 + JSON 响应
 └─ [Post-processing]          — 验证容量、补充封面卡、主题标签回退
```

## 关键设计决策

- CJK 字符按 1字符 ≈ 1词当量单独计数，与英文词频分开处理
- Markdown 代码块（fenced block）视为原子单元，不跨卡分割
- 切分结果末尾自动注入封底卡，首位自动注入封面卡（含 metadata）
- API Key 通过 `import.meta.env.VITE_GEMINI_API_KEY` 注入，不硬编码

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
