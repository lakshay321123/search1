export type Cite = { id: string; url: string; title: string; snippet?: string };
export type Profile = { title: string; description?: string; extract?: string; pageUrl?: string; image?: string };
export type Candidate = { title: string; description?: string; pageUrl: string; image?: string };
export type Place = { id: string; name: string; address?: string; lat: number; lon: number; distance_m?: number; phone?: string; website?: string; category?: string; source: 'geoapify'|'osm'; osmUrl?: string };

export type Plan = {
  intent: 'people'|'company'|'local'|'general';
  subject?: string;
  needLocation?: boolean;
};
export type Orchestrated = {
  plan: Plan;
  profile?: Profile | null;
  candidates?: Candidate[];
  cites: Cite[];
  places?: Place[];
  status?: string;
};
