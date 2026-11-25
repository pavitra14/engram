import { useEffect, useRef, useState } from 'react';

import { ActionSheet } from '@/components/ActionSheet';
import { useDb } from '@/db/provider';
import { ASK_UPDATES_TITLE, askUpdatesBody, readUpdatesAnswer, setUpdates } from '@/lib/updates';
import { readUsageAnswer } from '@/lib/usage';

/**
 * Asks once whether to hear about new versions, for people who never saw the tour's
 * question: those updating from 0.9 and those who skipped the tour. It waits until
 * the usage question is answered, so two sheets never open together. Closing the
 * sheet without choosing counts as no. Nothing is checked until "yes".
 */
export function UpdateQuestion() {
  const db = useDb();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void Promise.all([readUsageAnswer(db), readUpdatesAnswer(db)]).then(([usage, updates]) => {
        if (live && usage !== null && updates === null) setOpen(true);
      });
    }, 1500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [db]);

  const decided = useRef(false);
  const answer = (yes: boolean) => {
    decided.current = true;
    setOpen(false);
    void setUpdates(db, yes);
  };
  // The sheet calls onClose before a choice's own handler, so a choice made in the
  // same tap wins; closing it any other way (back, tapping outside) is a no.
  const closed = () => {
    setOpen(false);
    setTimeout(() => {
      if (!decided.current) answer(false);
    }, 0);
  };

  return (
    <ActionSheet
      visible={open}
      title={ASK_UPDATES_TITLE}
      message={askUpdatesBody()}
      options={[
        { label: 'Tell me about new versions', icon: 'bell', onPress: () => answer(true) },
        { label: 'No thanks', icon: 'x', onPress: () => answer(false) },
      ]}
      onClose={closed}
    />
  );
}
