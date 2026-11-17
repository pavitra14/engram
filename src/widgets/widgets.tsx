/**
 * The home-screen widgets. Android draws these outside the app, from a picture
 * the widget library makes of this layout, so they use the library's own
 * building blocks and fixed colours, not the app's components or theme.
 */
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export type WidgetTodo = { id: string; title: string; due: string | null; overdue: boolean };
export type WidgetNote = { id: string; title: string; when: string };
export type WidgetData = { dark: boolean; todos: WidgetTodo[]; open: number; older?: WidgetNote[] };

type Hex = `#${string}`;
const palette = (dark: boolean): { bg: Hex; surface: Hex; ink: Hex; soft: Hex; line: Hex; accent: Hex; onAccent: Hex; danger: Hex } =>
  dark
    ? { bg: '#000000', surface: '#16181D', ink: '#F3F2EE', soft: '#A3A7B0', line: '#2A2D34', accent: '#8EA2FF', onAccent: '#0A0F2C', danger: '#FF8A7A' }
    : { bg: '#F3F2EE', surface: '#FFFFFF', ink: '#16181D', soft: '#5B5F68', line: '#DAD8D0', accent: '#1F3FBF', onAccent: '#FFFFFF', danger: '#B3261E' };

const open = (uri: string) => ({ clickAction: 'OPEN_URI' as const, clickActionData: { uri } });

/** One row: write a thought, or speak one. */
export function QuickThoughtWidget({ dark = false }: { dark?: boolean }) {
  const c = palette(dark);
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.bg,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: c.line,
        paddingLeft: 20,
        paddingRight: 8,
      }}>
      <FlexWidget {...open('engram://compose')} style={{ flex: 1, height: 'match_parent', justifyContent: 'center' }}>
        <TextWidget text="Write a thought" maxLines={1} style={{ fontSize: 16, color: c.soft }} />
      </FlexWidget>
      <FlexWidget
        {...open('engram://todo')}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 6, borderWidth: 1, borderColor: c.line }}>
        <TextWidget text="✓" style={{ fontSize: 18, color: c.ink }} />
      </FlexWidget>
      <FlexWidget
        {...open('engram://voice')}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }}>
        <TextWidget text="●" style={{ fontSize: 16, color: c.onAccent }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** The next few to-dos, with a button to add a thought. */
export function TodoWidget({ dark = false, todos = [], open: count = 0 }: Partial<WidgetData>) {
  const c = palette(dark);
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        backgroundColor: c.bg,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: c.line,
        padding: 14,
      }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <FlexWidget {...open('engram://todo')} style={{ flex: 1 }}>
          <TextWidget text={count > 0 ? `To do, ${count}` : 'To do'} style={{ fontSize: 15, fontWeight: '600', color: c.ink }} />
        </FlexWidget>
        <FlexWidget
          {...open('engram://compose')}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent }}>
          <TextWidget text="+" style={{ fontSize: 20, color: c.onAccent }} />
        </FlexWidget>
      </FlexWidget>
      {todos.length === 0 ? (
        <FlexWidget {...open('engram://todo')} style={{ width: 'match_parent', flex: 1, justifyContent: 'center' }}>
          <TextWidget text="Nothing open. Tap + to write a thought." style={{ fontSize: 13, color: c.soft }} />
        </FlexWidget>
      ) : (
        todos.slice(0, 4).map((t) => (
          <FlexWidget key={t.id} {...open(`engram://thought/${t.id}`)} style={{ width: 'match_parent', flexDirection: 'column', paddingVertical: 4 }}>
            <TextWidget text={t.title} maxLines={1} truncate="END" style={{ fontSize: 14, color: c.ink }} />
            {t.due ? <TextWidget text={t.due} maxLines={1} style={{ fontSize: 11, color: t.overdue ? c.danger : c.soft }} /> : null}
          </FlexWidget>
        ))
      )}
    </FlexWidget>
  );
}

/** One older note at a time, changing through the day. Tap it to read it, or the arrow for another. */
export function MemoryWidget({ dark = false, note }: { dark?: boolean; note?: WidgetNote | null }) {
  const c = palette(dark);
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.bg,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: c.line,
        paddingLeft: 16,
        paddingRight: 10,
      }}>
      <FlexWidget {...open(note ? `engram://thought/${note.id}` : 'engram://compose')} style={{ flex: 1, height: 'match_parent', flexDirection: 'column', justifyContent: 'center' }}>
        <TextWidget text={note ? `You wrote this ${note.when}` : 'From your notes'} maxLines={1} style={{ fontSize: 11, color: c.soft }} />
        <TextWidget text={note ? note.title : 'Older notes appear here once you have some.'} maxLines={3} truncate="END" style={{ fontSize: 15, color: c.ink }} />
      </FlexWidget>
      <FlexWidget
        {...open('engram://surprise')}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 8, borderWidth: 1, borderColor: c.line }}>
        <TextWidget text="↻" style={{ fontSize: 18, color: c.ink }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Which of the stored older notes to show now: a different one every three hours. */
export function noteForNow(older: WidgetNote[] | undefined, now: number = Date.now()): WidgetNote | null {
  if (!older || older.length === 0) return null;
  return older[Math.floor(now / (3 * 3_600_000)) % older.length];
}
