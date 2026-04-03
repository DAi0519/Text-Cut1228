/**
 * [INPUT]: 无外部依赖（纯类型声明文件）
 * [OUTPUT]: 对外提供所有共享枚举与接口：FontStyle / AspectRatio / Colorway / BackgroundStyle /
 *           Composition / GradientType / WarpShape / GradientBackgroundConfig / CardConfig /
 *           ImageConfig / CardSegment / SplitResponse / Preset / ImageAspectRatio
 * [POS]: 全项目类型系统的单一真相源，被所有业务模块引用；禁止在此处放置运行时逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export enum FontStyle {
  CHILL = 'Chill',
  OPPO = 'Oppo',
  SWEI = 'Swei',
}

export enum AspectRatio {
  PORTRAIT = '3:4',
  SQUARE = '1:1',
  WIDE = '16:9',
}

export type Colorway = 'snow' | 'neon';
export type BackgroundStyle = 'none' | 'grid' | 'gradient';

export type Composition = 'classic' | 'technical' | 'editorial';
export type ImageAspectRatio = '1:1' | '4:3' | '16:9' | '3:4' | '21:9' | '9:21' | '9:16';
export type GradientType =
  | 'simple'
  | 'soft-bezier'
  | 'mesh-static'
  | 'mesh-grid'
  | 'sharp-bezier';
export type WarpShape =
  | 'simplex-noise'
  | 'circular'
  | 'value-noise'
  | 'worley-noise'
  | 'fbm-noise'
  | 'voronoi-noise'
  | 'domain-warping'
  | 'waves'
  | 'smooth-noise'
  | 'oval'
  | 'rows'
  | 'columns'
  | 'flat'
  | 'gravity';

export interface GradientControlPoint {
  x: number;
  y: number;
}

export interface GradientBackgroundConfig {
  gradientType: GradientType;
  warpShape: WarpShape;
  warp: number;
  warpSize: number;
  noise: number;
  seed: number;
  colors: string[];
  controlPoints: GradientControlPoint[];
}

export interface CardConfig {
  // Visuals
  colorway: Colorway;
  backgroundStyle: BackgroundStyle;
  backgroundColor: string;
  gradientBackground?: GradientBackgroundConfig;
  textColor: string;
  accentColor: string;
  fontStyle: FontStyle;
  composition: Composition;
  
  // Dimensions
  aspectRatio: AspectRatio;
  fontSize: number;
  cardScale: number;
  editorialTitleScale: number; // 0.6–1.6, multiplier for editorial title font size

  // Content
  showMetadata: boolean;
  authorName: string;
  authorAvatar?: string; // Image URL or Base64 data URL for author avatar
  title: string;
}

export interface ImageConfig {
  position: 'top' | 'bottom' | 'left' | 'right';
  heightRatio: number; // Legacy display-area ratio for non-cropped cards.
  aspectRatio?: ImageAspectRatio;
  cropScale?: number; // Crop-modal zoom level for generating the derived image.
  cropPanX?: number; // Crop-modal horizontal focus point in percent.
  cropPanY?: number; // Crop-modal vertical focus point in percent.
  scale: number; // 1 to 3
  panX: number; // 0-100%
  panY: number; // 0-100%
}

export interface CardSegment {
  id?: string;
  title: string;
  content: string;
  layout?: 'standard' | 'cover';
  image?: string; // Base64 data URL
  originalImage?: string; // Original uploaded image retained for re-cropping.
  imageConfig?: ImageConfig;
  editorialBrandLabel?: string; // Custom brand name override for editorial Cover
  editorialBadgeText?: string;  // Custom theme tag override for editorial Cover (e.g. "Design")
}

export interface SplitResponse {
  segments: CardSegment[];
  themeTag?: string;
}

export interface Preset {
  id: string;
  name: string;
  config: Partial<CardConfig>;
}
