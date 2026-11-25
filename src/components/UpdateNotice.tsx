import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/ui';
import { useDb } from '@/db/provider';
import { showToast } from '@/lib/toast';
import { dismissUpdate, startUpdate, useAvailableUpdate } from '@/lib/updates';
import { font, type, useTheme } from '@/theme';

/**
 * Shown on Today when a newer version was found (only for people who said yes to
 * hearing about new versions, or pressed "Check now"). "Not now" hides it until a
 * newer one comes out.
 */
export function UpdateNotice() {
  const db = useDb();
  const { c } = useTheme();
  const found = useAvailableUpdate(db);
  const [reading, setReading] = useState(false);
  if (!found) return null;

  const update = () =>
    void startUpdate(found)
      .then((opened) => {
        if (!opened) showToast('Google Play has no update for this phone yet. Try again later.');
      })
      .catch(() => showToast(found.channel === 'play' ? 'Google Play could not start the update.' : 'The release page could not be opened.'));

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Text style={[type.meta, { color: c.soft }]}>New version</Text>
      <Text style={{ fontFamily: font.serifMedium, fontSize: 21, lineHeight: 27, color: c.ink }}>
        {found.channel === 'github' ? `Engram ${found.version} is out` : 'A new version of Engram is ready'}
      </Text>
      <View style={styles.row}>
        {found.channel === 'github' ? (
          <Button title="See what’s new" tone="solid" onPress={() => setReading(true)} />
        ) : (
          <Button title="Update" tone="solid" onPress={update} />
        )}
        <Button title="Not now" onPress={() => void dismissUpdate(db, found)} />
      </View>
      {found.channel === 'github' ? (
        <ActionSheet
          visible={reading}
          title={`What’s new in ${found.version}`}
          message={found.notes || 'The release page lists what changed.'}
          options={[
            { label: 'Open the release page', icon: 'external-link', onPress: update },
            { label: 'Not now', icon: 'x', onPress: () => void dismissUpdate(db, found) },
          ]}
          onClose={() => setReading(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 18, borderRadius: 20, borderWidth: 1, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
});
