# TextCuts — AI 驱动的长文切片卡片编辑器

> 最近更新: editorial 构图标题行高统一为 `1.25`，用于改善多行中文标题的呼吸感与可读性

React 19 + TypeScript + Vite + Tailwind CSS (CDN) + Google Gemini AI + html-to-image

## 一句话定位
将长文本通过 Gemini AI 语义切分为可视化排版卡片，支持多构图风格与渐变背景，并导出高质量 PNG。

<directory>
components/  - UI 组件层，卡片渲染与控制面板 (5文件: Card, Console, Editor, ImageCropModal, StylePanel)
services/    - 外部服务集成层，Gemini AI 文字切分 (1文件: geminiService)
utils/       - 纯函数工具层，文字解析与 WebGL 渐变渲染 (2文件: textSplit, gradientBackground)
public/      - 静态资源：自定义字体 (Chill/OPPO/Swei)、头像、图标
dist/        - Vite 构建产物，不提交
figma-preview/ - Figma 设计稿预览 HTML，仅供参考
PRD-Outputs/ - 产品需求文档存档
</directory>

<config>
vite.config.ts   - Vite 构建配置，dev 端口 3000，@ 路径别名，GEMINI_API_KEY 注入
tsconfig.json    - TypeScript 编译器配置
package.json     - 依赖声明与构建脚本 (dev / build / preview)
metadata.json    - 应用元信息 (名称、描述)
index.html       - HTML 模板，Tailwind CDN，Google Fonts，PWA meta
</config>

## 核心数据流

```
用户输入长文
    ↓
Editor → splitTextIntoCards (Gemini AI)
    ↓
CardSegment[]  ← App.tsx 全局状态
    ↓
Card × N  →  在线编辑 / 图片裁剪 / 溢出重分配
    ↓
html-to-image → PNG 导出 (含真圆角 Canvas Mask)
```

## 视觉系统三要素

| 维度 | 选项 |
|------|------|
| Composition | classic / technical / editorial |
| Colorway | snow (浅) / neon (深) |
| Background | none / grid / gradient (5类型 × 14变形) |

## 最近排版约定

- `editorial` 构图的标题行高统一使用 `1.25`
- 该约定同时作用于封面卡与标准卡标题，避免同一主题下多行标题松紧不一致

## 关键约束

- `CONFIG_VERSION = 9` — CardConfig 序列化版本，升版需迁移旧存档
- 渐变背景使用 WebGL Fragment Shader；环境不支持时 Canvas 降级
- CJK 字符容量计算与英文分开处理（单字符 ≈ 1词当量）
- 卡片溢出通过 `Card.resolveOverflow()` 语义重分配，不截断
- 导出 PNG 需额外 Canvas 圆角遮罩（html-to-image 本身不支持 border-radius）

## 环境变量

```
GEMINI_API_KEY=...   # .env.local，Gemini AI 必须
```

## 开发命令

```bash
npm run dev      # 启动开发服务器 localhost:3000
npm run build    # 生产构建 → dist/
npm run preview  # 预览构建产物
```
