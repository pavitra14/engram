export type ThoughtKind = 'text' | 'voice' | 'link' | 'image' | 'video' | 'file';
export type LinkKind = 'auto' | 'manual';
export type Repeat = 'daily' | 'weekly' | 'monthly';
export type TodoList = 'waiting' | 'someday';

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
  /** When it was pinned to the top of Today, or null. */
  pinned: number | null;
  /** When it was moved to the trash, or null. */
  trashed_at: number | null;
  /** "Remember this": the showing that comes next (0 to 4), or 100 for a decision to look back on. */
  recall_step: number | null;
  recall_at: number | null;
  /** A parked to-do: waiting on someone, or someday. */
  list: TodoList | null;
  focus_min: number | null;
  /** Words read from a picture on this phone. */
  seen_text?: string | null;
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

/** What the person has said about a group: its name, and a goal and date if it is a project. */
export type Project = { id: string; name: string | null; goal: string | null; due_at: number | null; members: string[]; notif_id: string | null };

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
  /** To-do and phone-only state, carried over by a backup restore or a kept conflict copy. Missing means a fresh note. */
  todo?: number | null;
  remind_at?: number | null;
  repeat?: Thought['repeat'];
  priority?: number | null;
  done_at?: number | null;
  pinned?: number | null;
  trashed_at?: number | null;
  recall_step?: number | null;
  recall_at?: number | null;
  list?: Thought['list'];
  focus_min?: number | null;
};
