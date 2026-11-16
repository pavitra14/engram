export type ThoughtKind = 'text' | 'voice' | 'link' | 'image' | 'video' | 'file';
export type LinkKind = 'auto' | 'manual';
export type Repeat = 'daily' | 'weekly' | 'monthly';

export type Thought = {
  id: string;
  kind: ThoughtKind;
  /** The body as plain words. Search and linking read this. */
  body: string;
  /** The body with its formatting, when it has any. */
  body_html: string | null;
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
  repeat: Repeat | null;
  /** 1 when marked important. */
  priority: number;
  done_at: number | null;
  notif_id: string | null;
  event_id: string | null;
  event_title: string | null;
  event_at: number | null;
  created_at: number;
  updated_at: number;
  /** The language this note was written in, when Engram has translated it; with its English title and body. */
  en_lang?: string | null;
  en_title?: string | null;
  en_body?: string | null;
};

export type Link = {
  a_id: string;
  b_id: string;
  kind: LinkKind;
  weight: number;
};

export type Tag = { id: string; name: string };

export type NewThought = {
  id?: string;
  kind: ThoughtKind;
  body: string;
  body_html?: string | null;
  title?: string | null;
  url?: string | null;
  source?: string | null;
  media_path?: string | null;
  duration_ms?: number | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  event_id?: string | null;
  event_title?: string | null;
  event_at?: number | null;
  created_at?: number;
};
