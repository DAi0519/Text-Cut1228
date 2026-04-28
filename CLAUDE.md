# TextCuts — AI 驱动的长文切片卡片编辑器

> 最近更新: 首页 Hero 改为响应式视口布局（`100dvh` + 内部滚动），并完成一次工程级体检；当前 `npm run build` 与 `npx tsc --noEmit` 均通过

React 19 + TypeScript + Vite + Tailwind CSS (CDN) + Google Gemini AI + html-to-image

## 一句话定位
将长文本通过 Gemini AI 语义切分为可视化排版卡片，支持多构图风格与渐变背景，并导出高质量 PNG。

<directory>
components/  - UI 组件层，卡片渲染与控制面板 (5文件: Card, Console, Editor, ImageCropModal, StylePanel；其中 Editor / StylePanel 当前为备用独立面板)
services/    - 外部服务集成层，Gemini AI 文字切分 (1文件: geminiService)
utils/       - 纯函数工具层，文字解析与 WebGL 渐变渲染 (2文件: textSplit, gradientBackground)
public/      - 静态资源：自定义字体 (Chill/OPPO/Swei)、头像、图标
dist/        - Vite 构建产物，不提交
PRD-Outputs/ - 产品需求文档存档
output/      - 本地工具产物/调试输出
</directory>

<config>
vite.config.ts   - Vite 构建配置，dev 端口 3000、host 0.0.0.0，@ 路径别名，并将 `GEMINI_API_KEY` 映射注入为 `process.env.API_KEY`
tsconfig.json    - TypeScript 编译器配置
package.json     - 依赖声明与构建脚本 (dev / build / preview)
metadata.json    - 应用元信息 (名称、描述)
index.html       - HTML 模板，Tailwind CDN、本地字体声明、PWA meta、入口脚本
</config>

## 核心数据流

```
用户在 App Hero / Console Source 输入长文
    ↓
App.handleProcess() → splitTextIntoCards() (Gemini AI)
    ↓
CardSegment[]  ← App.tsx 全局状态
    ↓
Card × N  →  在线编辑 / 图片裁剪 / 溢出重分配
    ↓
Console / html-to-image → PNG 导出 (含真圆角 Canvas Mask)
```

## 视觉系统三要素

| 维度 | 选项 |
|------|------|
| Composition | classic / technical / editorial |
| Colorway | snow (浅) / neon (深) |
| Background | none / grid / gradient (5类型 × 14变形) |

## 当前运行约定

- `editorial` 构图的标题行高统一使用 `1.25`
- 首页 Hero 在无内容状态下允许内部纵向滚动，避免短屏桌面直接裁切
- Hero 标题使用 `clamp()` + 自动换行，输入面板按视口高度限制最大高度
- 当前可用 `Colorway` 仅为 `snow / neon`
- 当前可用 `FontStyle` 为 `Chill / OPPO / Swei / Smiley`

## 关键约束

- `CONFIG_VERSION = 9` — CardConfig 序列化版本，升版需迁移旧存档
- 渐变背景使用 WebGL Fragment Shader；环境不支持时 Canvas 降级
- CJK 字符容量计算与英文分开处理（单字符 ≈ 1词当量）
- 卡片溢出通过 `Card.resolveOverflow()` 语义重分配，不截断
- 导出 PNG 需额外 Canvas 圆角遮罩（html-to-image 本身不支持 border-radius）

## 环境变量

```
GEMINI_API_KEY=...   # .env.local，Gemini AI 必须；由 Vite 注入为浏览器侧的 process.env.API_KEY
```

## 开发命令

```bash
npm run dev      # 启动开发服务器 localhost:3000
npm run build    # 生产构建 → dist/
npm run preview  # 预览构建产物
npx tsc --noEmit # TypeScript 体检
```
