

export enum FontStyle {
  SANS = 'Sans',
  SERIF = 'Serif',
  MING_LIGHT = 'MingLight',
  MONO = 'Mono',
}

export enum AspectRatio {
  PORTRAIT = '3:4',
  SQUARE = '1:1',
  WIDE = '16:9',
}

export type Colorway = 'snow' | 'carbon' | 'neon';

export type Composition = 'classic' | 'technical' | 'zen' | 'flux';

export interface CardConfig {
  // Visuals
  colorway: Colorway;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontStyle: FontStyle;
  composition: Composition;
  
  // Dimensions
  aspectRatio: AspectRatio;
  fontSize: number;
  
  // Content
  showMetadata: boolean;
  authorName: string;
  title: string;
}

export interface ImageConfig {
  position: 'top' | 'bottom' | 'left' | 'right';
  heightRatio: number; // 0.2 to 0.8 (Acts as Width Ratio for Left/Right positions)
  aspectRatio?: '1:1' | '4:3' | '16:9' | '3:4'; 
  scale: number; // 1 to 3
  panX: number; // 0-100%
  panY: number; // 0-100%
}

export interface CardSegment {
  title: string;
  content: string;
  layout?: 'standard' | 'cover';
  image?: string; // Base64 data URL
  imageConfig?: ImageConfig;
}

export interface SplitResponse {
  segments: CardSegment[];
}

export interface Preset {
  id: string;
  name: string;
  config: Partial<CardConfig>;
}