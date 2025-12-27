
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

export type Composition = 'classic' | 'swiss' | 'technical' | 'zen' | 'neo';

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

export interface CardSegment {
  title: string;
  content: string;
  layout?: 'standard' | 'cover';
}

export interface SplitResponse {
  segments: CardSegment[];
}

export interface Preset {
  id: string;
  name: string;
  config: Partial<CardConfig>;
}