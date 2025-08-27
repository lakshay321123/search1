export type AskReq = {
  query: string;
  focus?: 'web'|'academic'|'youtube'|'gov';
  depth?: 'quick'|'standard'|'deep';
  style?: 'simple'|'expert';
};

export type CiteEvent = {
  id: string;
  url: string;
  title: string;
  snippet?: string;
  quote?: string;
  published_at?: string;
};

export type FinalSnapshot = {
  id: string;
  markdown: string;
  cites: CiteEvent[];
  timeline: any[];
  confidence: 'high'|'medium'|'low';
};
