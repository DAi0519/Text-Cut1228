# components/
> L2 | 父级: /CLAUDE.md

> 最近更新: `Editor.tsx` 的色板选项已收敛为 `snow / neon`，`StylePanel.tsx` 的字体选项已对齐到 `Chill / OPPO / Swei`

UI 组件层 — 负责渲染、交互与用户输入捕获。主状态统一上提到 App.tsx。

## 成员清单

Card.tsx: 单张卡片渲染器，支持 standard/cover 双布局、内联编辑、图片管理、溢出检测与重分配；`editorial` 构图标题使用统一行高常量 `1.25`；通过 forwardRef + useImperativeHandle 向父级暴露命令式 API (CardHandle)

Console.tsx: 全局控制面板，包含 AI 处理触发、配置切换、下载操作；当前以 ConsoleTabId 管理三个 Tab (`source / editor / style`)

Editor.tsx: 独立输入面板组件，提供长文输入、元信息编辑与色板切换；目前未直接挂载到 App.tsx 首页主流程，保留为备用/独立入口

ImageCropModal.tsx: 图片裁剪/平移 Modal，支持鼠标滚轮缩放与拖拽平移，输出 { scale, panX, panY } 给父级存入 ImageConfig

StylePanel.tsx: 独立样式配置面板，控制字体、字号与比例；当前字体选项与项目枚举保持一致，但此组件未直接接入 Console 当前实现

## 组件间依赖关系

```
App.tsx
 ├─ Hero Input UI   (首页输入入口，直接内联于 App.tsx)
 ├─ Console         (全局控制面板)
 ├─ Card × N        (卡片渲染列表)
 └─ ImageCropModal  (按需弹出)

Editor.tsx / StylePanel.tsx
 └─ 当前为独立备用面板，不在主运行链路中
```

## 关键契约

- `Card` 通过 `CardHandle` 对外暴露：`toggleLayout / startEdit / save / cancel / setImage / resolveOverflow / isOverflowing / getBodyOccupancy`
- `ConsoleTabId` 当前等价于 `style | editor | source`
- 运行态样式与输入控制以 `App.tsx + Console.tsx` 为主，`Editor / StylePanel` 不应假设自己仍在主流程内
- 图片裁剪结果以 `ImageConfig { cropScale, cropPanX, cropPanY }` 写回 CardSegment

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
