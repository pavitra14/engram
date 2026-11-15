export type ThoughtKind = 'text' | 'voice' | 'link' | 'image';
export type LinkKind = 'auto' | 'manual';

export type Thought = {
  id: string;
  kind: ThoughtKind;
  body: string;
  title: string | null;
  url: string | null;
  source: string | null;
  media_path: string | null;
  duration_ms: number | null;
  created_at: number;
  updated_at: number;
};

export type Link = {
  a_id: string;
  b_id: string;
  kind: LinkKind;
  weight: number;
};

export type Tag = { id: string; name: string };

export type NewThought = {
  kind: ThoughtKind;
  body: string;
  title?: string | null;
  url?: string | null;
  source?: string | null;
  media_path?: string | null;
  duration_ms?: number | null;
  created_at?: number;
};
