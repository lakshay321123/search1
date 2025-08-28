export type Cite = { id: string; url: string; title: string; snippet?: string };
export type SearchResult = { title: string; url: string; snippet?: string; domain?: string };

export type Place = {
  id: string;
  name: string;
  address?: string;
  lat: number; lon: number;
  distance_m?: number;
  phone?: string;
  website?: string;
  source?: string;
};
