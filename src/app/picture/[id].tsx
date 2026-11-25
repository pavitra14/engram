/**
 * A note's picture, full screen: the whole picture (never cropped), pinch or
 * double-tap to zoom, drag to look around when zoomed, swipe down or Back to
 * return to the note. "Open in another app" hands it to the phone's gallery.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture, useExclusiveGestures } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { RoundButton } from '@/components/ui';
import * as repo from '@/db/repo';
import { useDb } from '@/db/provider';
import type { Thought } from '@/db/types';
import { openFile } from '@/lib/open';
import { showToast } from '@/lib/toast';
import { type, useTheme } from '@/theme';

const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;
/** How far down a swipe at normal size must go to close the viewer. */
const CLOSE_DISTANCE = 120;

export default function PictureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [thought, setThought] = useState<Thought | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void repo.getThought(db, id).then((t) => {
      if (live) setThought(t);
    });
    return () => {
      live = false;
    };
  }, [db, id]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/thought/${id}`));

  /** Keeps a zoomed picture from being dragged off the screen. */
  const clamp = (value: number, size: number, s: number) => {
    'worklet';
    const limit = Math.max(0, (size * s - size) / 2);
    return Math.min(limit, Math.max(-limit, value));
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.set(Math.min(MAX_ZOOM, Math.max(1, savedScale.get() * e.scale)));
    },
    onDeactivate: () => {
      'worklet';
      savedScale.set(scale.get());
      if (scale.get() <= 1.01) {
        scale.set(withTiming(1, { duration: 160 }));
        savedScale.set(1);
        x.set(withTiming(0, { duration: 160 }));
        y.set(withTiming(0, { duration: 160 }));
        savedX.set(0);
        savedY.set(0);
      }
    },
  });

  // Set once a second finger joins, so a pinch that drifts downwards never closes the viewer.
  const multi = useSharedValue(false);

  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      if (e.numberOfPointers > 1) multi.set(true);
      if (savedScale.get() > 1 || scale.get() > 1.01) {
        x.set(clamp(savedX.get() + e.translationX, width, scale.get()));
        y.set(clamp(savedY.get() + e.translationY, height, scale.get()));
      } else if (!multi.get()) {
        // At normal size only a one-finger downward drag moves the picture, towards closing.
        y.set(Math.max(0, e.translationY));
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (savedScale.get() > 1 || scale.get() > 1.01) {
        savedX.set(x.get());
        savedY.set(y.get());
      } else if (!multi.get() && e.translationY > CLOSE_DISTANCE) {
        scheduleOnRN(close);
      } else {
        y.set(withTiming(0, { duration: 160 }));
      }
    },
    onFinalize: () => {
      'worklet';
      multi.set(false);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (e) => {
      'worklet';
      if (savedScale.get() > 1) {
        scale.set(withTiming(1, { duration: 200 }));
        x.set(withTiming(0, { duration: 200 }));
        y.set(withTiming(0, { duration: 200 }));
        savedScale.set(1);
        savedX.set(0);
        savedY.set(0);
      } else {
        // Zoom towards where the person tapped.
        const tx = clamp((width / 2 - e.x) * (DOUBLE_TAP_ZOOM - 1), width, DOUBLE_TAP_ZOOM);
        const ty = clamp((height / 2 - e.y) * (DOUBLE_TAP_ZOOM - 1), height, DOUBLE_TAP_ZOOM);
        scale.set(withTiming(DOUBLE_TAP_ZOOM, { duration: 200 }));
        x.set(withTiming(tx, { duration: 200 }));
        y.set(withTiming(ty, { duration: 200 }));
        savedScale.set(DOUBLE_TAP_ZOOM);
        savedX.set(tx);
        savedY.set(ty);
      }
    },
  });

  const gestures = useExclusiveGestures(doubleTap, useSimultaneousGestures(pinch, pan));

  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  const open = () => {
    if (!thought) return;
    void openFile(thought).catch(() => showToast('No app on this phone can open pictures.'));
  };

  return (
    <View style={[styles.fill, { backgroundColor: c.bg }]}>
      {thought?.media_path ? (
        <GestureDetector gesture={gestures}>
          <Animated.View style={[styles.fill, moved]} collapsable={false}>
            <Image
              source={{ uri: thought.media_path }}
              style={styles.fill}
              resizeMode="contain"
              accessibilityLabel={thought.title ? `Picture: ${thought.title}` : 'Picture'}
            />
          </Animated.View>
        </GestureDetector>
      ) : (
        <View style={[styles.fill, styles.center]}>
          <Text style={[type.small, { color: c.soft }]}>{thought === undefined ? '' : 'This picture is no longer here.'}</Text>
        </View>
      )}
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <RoundButton icon="x" label="Close picture" tone="solid" onPress={close} />
        {thought?.media_path ? <RoundButton icon="external-link" label="Open in another app" tone="solid" onPress={open} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
});
