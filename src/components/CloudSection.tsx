import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { deleteAccount, signIn, signOut, signUp, syncNow, useCloud } from '@/cloud/cloud';
import { useDb } from '@/db/provider';
import { when } from '@/lib/text';
import { font, type, useTheme } from '@/theme';

import { Button } from './ui';

/**
 * Settings, Engram Cloud. Optional: signed out, Engram sends nothing anywhere.
 * Says plainly what goes to the cloud and what stays on the phone before asking for anything.
 */
export function CloudSection() {
  const db = useDb();
  const { c } = useTheme();
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async (job: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      setNote(await job());
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!cloud.available) {
    return <Text style={[type.meta, { color: c.soft }]}>This build of Engram has no cloud service set up. Everything stays on this phone.</Text>;
  }

  if (cloud.email) {
    const line =
      cloud.status === 'syncing'
        ? 'Syncing now'
        : cloud.status === 'error'
          ? 'Not synced'
          : cloud.waiting > 0
            ? `${cloud.waiting} ${cloud.waiting === 1 ? 'change' : 'changes'} waiting to be sent`
            : cloud.lastSynced
              ? `Up to date, synced ${when(cloud.lastSynced)}`
              : 'Signed in';
    return (
      <View style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={[type.bodyStrong, { color: c.ink }]}>{cloud.email}</Text>
          <Text style={[type.meta, { color: cloud.status === 'error' ? c.danger : c.soft }]}>{line}</Text>
        </View>
        {cloud.message ? <Text style={[type.meta, { color: c.soft }]}>{cloud.message}</Text> : null}
        {note ? <Text style={[type.meta, { color: c.soft }]}>{note}</Text> : null}
        <View style={styles.buttons}>
          <Button title="Sync now" disabled={busy || cloud.status === 'syncing'} onPress={() => void syncNow(db)} />
          <Button
            title="Sign out"
           
            disabled={busy}
            onPress={() => run(async () => (await signOut(db), 'Signed out. Your thoughts are still on this phone and in your cloud copy.'))}
          />
        </View>
        <Text style={[type.meta, { color: c.soft }]}>
          Synced: your notes, to-dos, tags and the links you make yourself. Not synced: photos, videos, recordings and files
          (they stay on the phone that has them), and your settings.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() =>
            Alert.alert(
              'Delete your Engram Cloud account?',
              'Your cloud copy is deleted and other phones stop syncing. Everything stays on this phone. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete account',
                  style: 'destructive',
                  onPress: () => void run(async () => (await deleteAccount(db), 'Your Engram Cloud account and its copy are deleted.')),
                },
              ],
            )
          }
          style={styles.link}>
          <Text style={[type.smallStrong, { color: c.danger }]}>Delete my cloud account</Text>
        </Pressable>
      </View>
    );
  }

  const ready = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 8;
  const field = [styles.field, { backgroundColor: c.surface, borderColor: c.line, color: c.ink }];
  return (
    <View style={{ gap: 12 }}>
      <Text style={[type.meta, { color: c.soft }]}>
        Optional. Sign in to keep a copy of your notes, to-dos and tags in Engram Cloud and see them on your other devices.
        Without an account your notes never leave this phone. The cloud copy is encrypted in transit and at rest, but it is not
        end-to-end encrypted: the service could read it.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={c.faint}
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={field}
        selectionColor={c.accent}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password, 8 characters or more"
        placeholderTextColor={c.faint}
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete="password"
        secureTextEntry
        style={field}
        selectionColor={c.accent}
      />
      {note || cloud.message ? <Text style={[type.meta, { color: c.soft }]}>{note ?? cloud.message}</Text> : null}
      <View style={styles.buttons}>
        <Button
          title={busy ? 'Working' : 'Sign in'}
          tone="solid"
          disabled={!ready || busy}
          onPress={() =>
            run(async () => {
              const r = await signIn(db, email, password);
              if (r === 'ok') return null;
              // This phone was synced with someone else's account before. Ask before mixing the two.
              return new Promise<string | null>((resolve) =>
                Alert.alert(
                  'Add this phone\'s thoughts to this account?',
                  'This phone was last synced with a different account. Signing in will copy the thoughts on this phone into the account you are signing in to.',
                  [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve('Not signed in.') },
                    { text: 'Add them', onPress: () => signIn(db, email, password, true).then(() => resolve(null), (e: Error) => resolve(e.message)) },
                  ],
                ),
              );
            })
          }
        />
        <Button
          title="Create account"
         
          disabled={!ready || busy}
          onPress={() =>
            run(async () =>
              (await signUp(db, email, password)) === 'confirm'
                ? 'Almost there. Open the email Engram Cloud just sent you and tap the link to confirm, then come back and sign in.'
                : null,
            )
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontFamily: font.regular, fontSize: 16 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  link: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
