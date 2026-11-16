import { Feather } from '@expo/vector-icons';
import { type RefObject, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EnrichedTextInput, type EnrichedTextInputInstance, type OnChangeStateEvent } from 'react-native-enriched-html';

import { htmlToText, isFormatted, textToHtml } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

import type { IconName } from './ui';

export type NoteValue = { title: string; text: string; html: string | null };
export type NoteEditorHandle = {
  /** The note as it stands, read from the editor itself. */
  value: () => Promise<NoteValue>;
  format: (kind: FormatKind) => void;
};

export type FormatKind = 'bold' | 'italic' | 'underline' | 'strike' | 'heading' | 'bullets' | 'numbers' | 'checks' | 'quote';
type Active = Partial<Record<FormatKind, boolean>>;

/**
 * A note: a title and a body. The body keeps formatting (bold, headings, lists,
 * check boxes, quotes) and is the same editor everywhere a note is written.
 */
export function NoteEditor({
  ref,
  initialTitle,
  initialText,
  initialHtml,
  autoFocus,
  bodyPlaceholder = 'Write here',
  minHeight = 160,
  onChange,
  onBlur,
  onFocusBody,
  onActive,
}: {
  ref: RefObject<NoteEditorHandle | null>;
  initialTitle?: string | null;
  initialText?: string;
  initialHtml?: string | null;
  autoFocus?: 'title' | 'body';
  bodyPlaceholder?: string;
  /** The least room the body takes, so there is somewhere to tap when it is empty. */
  minHeight?: number;
  onChange?: (v: NoteValue) => void;
  onBlur?: () => void;
  onFocusBody?: (focused: boolean) => void;
  onActive?: (a: Active) => void;
}) {
  const { c } = useTheme();
  const body = useRef<EnrichedTextInputInstance | null>(null);
  const [title, setTitle] = useState(initialTitle ?? '');
  const now = useRef<NoteValue>({
    title: initialTitle ?? '',
    text: initialText ?? '',
    html: initialHtml ?? null,
  });
  // Read once: the editor keeps its own text after it is first shown.
  const [start] = useState(() => initialHtml ?? textToHtml(initialText ?? ''));

  const emit = (patch: Partial<NoteValue>) => {
    now.current = { ...now.current, ...patch };
    onChange?.(now.current);
  };

  useImperativeHandle(ref, () => ({
    value: async () => {
      try {
        const html = await body.current?.getHTML();
        if (typeof html === 'string') {
          now.current = { ...now.current, html: isFormatted(html) ? html : null, text: htmlToText(html) };
        }
      } catch {
        // Fall back to the last change the editor reported.
      }
      return now.current;
    },
    format: (kind) => {
      const e = body.current;
      if (!e) return;
      if (kind === 'bold') e.toggleBold();
      else if (kind === 'italic') e.toggleItalic();
      else if (kind === 'underline') e.toggleUnderline();
      else if (kind === 'strike') e.toggleStrikeThrough();
      else if (kind === 'heading') e.toggleH2();
      else if (kind === 'bullets') e.toggleUnorderedList();
      else if (kind === 'numbers') e.toggleOrderedList();
      else if (kind === 'checks') e.toggleCheckboxList(false);
      else if (kind === 'quote') e.toggleBlockQuote();
    },
  }));

  const state = (s: OnChangeStateEvent) =>
    onActive?.({
      bold: s.bold.isActive,
      italic: s.italic.isActive,
      underline: s.underline.isActive,
      strike: s.strikeThrough.isActive,
      heading: s.h2.isActive,
      bullets: s.unorderedList.isActive,
      numbers: s.orderedList.isActive,
      checks: s.checkboxList.isActive,
      quote: s.blockQuote.isActive,
    });

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          emit({ title: v });
        }}
        onBlur={onBlur}
        onSubmitEditing={() => body.current?.focus()}
        autoFocus={autoFocus === 'title'}
        placeholder="Title"
        placeholderTextColor={c.faint}
        accessibilityLabel="Title"
        returnKeyType="next"
        submitBehavior="submit"
        multiline
        scrollEnabled={false}
        style={[styles.title, { color: c.ink }]}
        selectionColor={c.accent}
      />
      <EnrichedTextInput
        ref={body}
        defaultValue={start}
        autoFocus={autoFocus === 'body'}
        placeholder={bodyPlaceholder}
        placeholderTextColor={c.faint}
        cursorColor={c.accent}
        selectionColor={c.accent}
        scrollEnabled={false}
        onChangeText={(e) => emit({ text: e.nativeEvent.value })}
        onChangeHtml={(e) => emit({ html: isFormatted(e.nativeEvent.value) ? e.nativeEvent.value : null })}
        onChangeState={(e) => state(e.nativeEvent)}
        onFocus={() => onFocusBody?.(true)}
        onBlur={() => {
          onFocusBody?.(false);
          onBlur?.();
        }}
        htmlStyle={{
          h2: { fontSize: 24, bold: true },
          blockquote: { borderColor: c.line, borderWidth: 3, gapWidth: 14, color: c.soft },
          code: { color: c.ink, backgroundColor: c.surface },
          a: { color: c.accent, textDecorationLine: 'underline' },
          ul: { bulletColor: c.soft, bulletSize: 6, marginLeft: 20, gapWidth: 12 },
          ol: { markerColor: c.soft, marginLeft: 20, gapWidth: 12 },
          ulCheckbox: { boxColor: c.accent, boxSize: 22, marginLeft: 20, gapWidth: 12 },
        }}
        style={{ ...styles.body, minHeight, color: c.ink }}
      />
    </View>
  );
}

const TOOLS: { kind: FormatKind; icon?: IconName; letter?: string; label: string }[] = [
  { kind: 'bold', icon: 'bold', label: 'Bold' },
  { kind: 'italic', icon: 'italic', label: 'Italic' },
  { kind: 'underline', icon: 'underline', label: 'Underline' },
  { kind: 'heading', icon: 'type', label: 'Heading' },
  { kind: 'checks', icon: 'check-square', label: 'Check list' },
  { kind: 'bullets', icon: 'list', label: 'Bulleted list' },
  { kind: 'numbers', letter: '1.', label: 'Numbered list' },
  { kind: 'quote', letter: '“', label: 'Quote' },
  { kind: 'strike', letter: 'S', label: 'Strike through' },
];

/** The row of formatting buttons that sits above the keyboard while the body is being edited. */
export function FormatBar({ active, onFormat }: { active: Active; onFormat: (kind: FormatKind) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: c.bg, borderTopColor: c.rule }]}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
        {TOOLS.map((t) => {
          const on = !!active[t.kind];
          return (
            <Pressable
              key={t.kind}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: on }}
              onPress={() => onFormat(t.kind)}
              style={({ pressed }) => [styles.tool, { backgroundColor: on ? c.ink : pressed ? c.surface : 'transparent' }]}>
              {t.icon ? (
                <Feather name={t.icon} size={20} color={on ? c.bg : c.ink} />
              ) : (
                <Text
                  style={[
                    type.labelStrong,
                    { color: on ? c.bg : c.ink, fontSize: 17, textDecorationLine: t.kind === 'strike' ? 'line-through' : 'none' },
                  ]}>
                  {t.letter}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.serifMedium, fontSize: 28, lineHeight: 34, letterSpacing: -0.4, padding: 0 },
  body: { fontFamily: font.serif, fontSize: 19, padding: 0 },
  bar: { borderTopWidth: 1 },
  tools: { paddingHorizontal: 8, paddingVertical: 4, gap: 2 },
  tool: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
