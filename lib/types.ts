export type Cite = { id: string; url: string; title: string; snippet?: string };
export type SearchResult = { title: string; url: string; snippet?: string; domain?: string };

export type Place = {
  id: string;
  name: string;
  type: string;              // doctor/clinic/hospital/restaurant/etc.
  address?: string;
  lat: number; lon: number;
  distance_m?: number;
  phone?: string;
  website?: string;
  osmUrl?: string;
};
