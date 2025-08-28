export type Focus = 'all' | 'web' | 'wikipedia' | 'social';
export type Style = 'simple' | 'expert';

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  source: 'google' | 'wikipedia' | 'brave' | 'serper' | 'tavily' | 'instagram' | 'facebook';
};

export type Cite = { id: string; url: string; title: string; snippet?: string };
