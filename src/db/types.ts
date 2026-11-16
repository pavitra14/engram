export type ThoughtKind = 'text' | 'voice' | 'link' | 'image' | 'video' | 'file';
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
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  /** 1 when the thought is on the to-do list. */
  todo: number;
  remind_at: number | null;
  done_at: number | null;
  notif_id: string | null;
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
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  created_at?: number;
};
