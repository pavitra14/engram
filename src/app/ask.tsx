import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFlag } from '@/cloud/flags';
import { Entry } from '@/components/Entry';
import { Button, Header } from '@/components/ui';
import { useDb } from '@/db/provider';
import type { Thought } from '@/db/types';
import { ask, restoreAsk, useAskState } from '@/lib/ask';
import { citedNumbers } from '@/lib/ask.logic';
import { font, type, useTheme } from '@/theme';
import { count, M } from '@/lib/usage';

/** Ask a question; get an answer written from your own notes, with the notes it used listed under it. */
export default function AskScreen() {
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const on = useFlag('ask');
  const model = useAskState();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Thought[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void restoreAsk(db);
  }, [db]);

  const go = async () => {
    const q = question.trim();
    if (!q || busy) return;
    count(M.ask);
    setBusy(true);
    setAnswer('');
    setSources([]);
    try {
      const r = await ask(db, q, setAnswer);
      setAnswer(r.text);
      setSources(r.sources);
    } catch (e) {
      setAnswer(`That could not be answered. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  // Notes the answer points at come first; the rest were read but not used.
  const cited = citedNumbers(answer ?? '', sources.length);
  const ordered = [...cited.map((n) => sources[n - 1]), ...sources.filter((_, i) => !cited.includes(i + 1))];

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <Header title="Ask your notes" back="Search" sub="Answered on this phone, from your notes only" />
        {!on ? (
          <Text style={[type.body, styles.pad, { color: c.soft }]}>This is not switched on yet.</Text>
        ) : model.status !== 'ready' ? (
          <View style={[styles.pad, { gap: 12 }]}>
            <Text style={[type.body, { color: c.soft }]}>
              {model.status === 'downloading'
                ? `Downloading the language model: ${Math.round(model.progress * 100)}%`
                : 'Asking needs a language model on this phone. Download it in Settings first.'}
            </Text>
            <Button title="Open Settings" onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : (
          <>
            <View style={styles.pad}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                onSubmitEditing={() => void go()}
                placeholder="What did I decide about the trip?"
                placeholderTextColor={c.faint}
                accessibilityLabel="Your question"
                returnKeyType="search"
                multiline
                style={[styles.field, { color: c.ink, borderColor: c.line, backgroundColor: c.surface }]}
                selectionColor={c.accent}
              />
            </View>
            <View style={styles.pad}>
              <Button title={busy ? 'Reading your notes' : 'Ask'} tone="solid" disabled={busy || !question.trim()} onPress={() => void go()} style={{ alignSelf: 'flex-start' }} />
            </View>
            {answer !== null ? (
              <View style={[styles.answer, { backgroundColor: c.surface, borderColor: c.line }]}>
                <Text selectable style={{ fontFamily: font.serif, fontSize: 18, lineHeight: 27, color: c.ink }} accessibilityLiveRegion="polite">
                  {answer || 'Finding the notes that might answer this.'}
                </Text>
                {!busy && sources.length > 0 ? (
                  <Text style={[type.meta, { color: c.soft }]}>Written by a small model on your phone. It can be wrong: check the notes below.</Text>
                ) : null}
              </View>
            ) : null}
            {ordered.length > 0 ? (
              <View>
                <Text style={[type.labelStrong, styles.pad, { color: c.ink }]}>From these notes</Text>
                {ordered.map((t, i) => (
                  <Entry
                    key={t.id}
                    thought={t}
                    size="small"
                    trailing={cited.includes(sources.indexOf(t) + 1) ? `[${sources.indexOf(t) + 1}]` : undefined}
                    divider={i < ordered.length - 1}
                    onPress={() => router.push({ pathname: '/thought/[id]', params: { id: t.id } })}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 24 },
  field: { minHeight: 64, maxHeight: 160, borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 16, fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  answer: { marginHorizontal: 16, padding: 20, borderRadius: 24, borderWidth: 1, gap: 12 },
});
