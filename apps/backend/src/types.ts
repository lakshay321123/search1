export type Depth = 'quick'|'standard'|'deep';
export type Focus = 'web'|'academic'|'youtube'|'gov';
export type Style = 'simple'|'expert';

export interface AskBody {
  query: string;
  focus?: Focus;
  depth?: Depth;
  style?: Style;
}
