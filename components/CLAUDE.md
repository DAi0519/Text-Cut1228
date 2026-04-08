# components/
> L2 | 父级: /CLAUDE.md

> 最近更新: `Card.tsx` 中 `editorial` 构图标题行高统一为 `1.25`，封面卡与标准卡保持一致

UI 组件层 — 负责渲染、交互与用户输入捕获。无业务逻辑，状态向上提升至 App.tsx。

## 成员清单

Card.tsx: 单张卡片渲染器，支持 standard/cover 双布局、内联编辑、图片管理、溢出检测与重分配；`editorial` 构图标题使用统一行高常量 `1.25`；通过 forwardRef + useImperativeHandle 向父级暴露命令式 API (CardHandle)

Console.tsx: 全局控制面板，包含 AI 处理触发、配置切换、下载操作；以 ConsoleTabId 管理四个 Tab (input / edit / style / image)

Editor.tsx: 长文输入区 + 构图预设选择器，是用户进入编辑流程的第一入口；仅负责输入捕获，不持有文字处理逻辑

ImageCropModal.tsx: 图片裁剪/平移 Modal，支持鼠标滚轮缩放与拖拽平移，输出 { scale, panX, panY } 给父级存入 ImageConfig

StylePanel.tsx: 卡片样式侧栏，控制字体、字号、比例、背景类型与渐变参数；为 Console Style Tab 的内容区

## 组件间依赖关系

```
App.tsx
 ├─ Editor          (文字输入入口)
 ├─ Console         (全局控制面板)
 │    └─ StylePanel (样式配置子区域)
 ├─ Card × N        (卡片渲染列表)
 └─ ImageCropModal  (按需弹出)
```

## 关键契约

- `Card` 通过 `CardHandle` 对外暴露：`toggleLayout / startEdit / save / cancel / setImage / resolveOverflow / isOverflowing / getBodyOccupancy`
- 所有组件接受 `CardConfig` 作为样式配置源头，不持有独立样式状态
- 图片裁剪结果以 `ImageConfig { cropScale, cropPanX, cropPanY }` 写回 CardSegment

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
