import { useEffect, useRef, useState } from 'react';

import { ActionSheet } from '@/components/ActionSheet';
import { useDb } from '@/db/provider';
import { readUsageAnswer, setUsage } from '@/lib/usage';
import { ASK_BODY, ASK_TITLE } from '@/lib/usage.logic';

/**
 * Asks once whether to share anonymous usage counts, for people who never saw the
 * tour's question: those updating from 0.7 and those who skipped the tour.
 * Closing the sheet without choosing counts as no. Nothing is counted until "yes".
 */
export function UsageQuestion() {
  const db = useDb();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void readUsageAnswer(db).then((a) => {
        if (live && a === null) setOpen(true);
      });
    }, 1200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [db]);

  const decided = useRef(false);
  const answer = (yes: boolean) => {
    decided.current = true;
    setOpen(false);
    void setUsage(db, yes);
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
      title={ASK_TITLE}
      message={ASK_BODY}
      options={[
        { label: 'Share anonymous counts', icon: 'bar-chart-2', onPress: () => answer(true) },
        { label: 'No thanks', icon: 'x', onPress: () => answer(false) },
      ]}
      onClose={closed}
    />
  );
}
