import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import * as repo from '@/db/repo';

import { capture, deleteMedia, importMedia } from './capture';

export const SPEECH_LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'Hindi' },
] as const;

export function defaultSpeechLang(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (SPEECH_LANGS.some((l) => l.code === locale)) return locale;
  } catch {
    // fall through
  }
  return 'en-US';
}

export async function speechLang(db: Parameters<typeof repo.getMeta>[0]): Promise<string> {
  return (await repo.getMeta(db, 'speech_lang')) ?? defaultSpeechLang();
}

/** True when this phone can transcribe speech without sending audio anywhere. */
export function canTranscribeOnDevice(): boolean {
  try {
    return (
      Platform.OS === 'android' &&
      Number(Platform.Version) >= 33 &&
      ExpoSpeechRecognitionModule.isRecognitionAvailable() &&
      ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
    );
  } catch {
    return false;
  }
}

type Phase = 'idle' | 'listening' | 'saving';
type Mode = 'transcribe' | 'record';

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b).trim();

/**
 * Voice capture. Where the phone has on-device speech recognition, the note
 * is transcribed live and the audio is kept. Otherwise the audio alone is
 * recorded. Audio is never sent to a server.
 */
export function useVoice(onNotice: (message: string) => void) {
  const db = useSQLiteContext();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('transcribe');
  const [text, setText] = useState('');
  const [level, setLevel] = useState(0);
  const [startedAt, setStartedAt] = useState(0);

  const phaseRef = useRef<Phase>('idle');
  const modeRef = useRef<Mode>('transcribe');
  const finals = useRef('');
  const interim = useRef('');
  const audioUri = useRef<string | null>(null);
  const cancelled = useRef(false);
  const started = useRef(0);
  const fallbackPending = useRef(false);
  const notice = useRef(onNotice);
  useEffect(() => {
    notice.current = onNotice;
  });

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const reset = useCallback(() => {
    finals.current = '';
    interim.current = '';
    audioUri.current = null;
    cancelled.current = false;
    setText('');
    setLevel(0);
    go('idle');
  }, []);

  const save = useCallback(
    async (body: string, uri: string | null, mime: string, ext: string) => {
      go('saving');
      try {
        if (cancelled.current || (!body && !uri)) {
          if (uri) deleteMedia(uri);
          if (!cancelled.current) notice.current('Nothing was recorded.');
          return;
        }
        const media = uri ? await importMedia(uri, mime, ext) : null;
        if (uri && media) deleteMedia(uri);
        await capture(db, {
          kind: 'voice',
          body,
          media_path: media,
          duration_ms: Date.now() - started.current,
          source: 'voice',
        });
      } catch (e) {
        notice.current(`Could not save the voice note. ${e instanceof Error ? e.message : ''}`.trim());
      } finally {
        reset();
      }
    },
    [db, reset],
  );

  const startRecorder = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      notice.current('Microphone access is off. Turn it on in system settings to record.');
      reset();
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    modeRef.current = 'record';
    setMode('record');
    started.current = Date.now();
    setStartedAt(started.current);
    go('listening');
  }, [recorder, reset]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    cancelled.current = false;
    finals.current = '';
    interim.current = '';
    audioUri.current = null;
    setText('');
    try {
      if (!canTranscribeOnDevice()) {
        await startRecorder();
        return;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        notice.current('Microphone access is off. Turn it on in system settings to record.');
        return;
      }
      modeRef.current = 'transcribe';
      setMode('transcribe');
      started.current = Date.now();
      setStartedAt(started.current);
      go('listening');
      ExpoSpeechRecognitionModule.start({
        lang: await speechLang(db),
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: true,
        recordingOptions: { persist: true },
        volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
      });
    } catch (e) {
      notice.current(`Could not start recording. ${e instanceof Error ? e.message : ''}`.trim());
      reset();
    }
  }, [db, reset, startRecorder]);

  const switchToRecorder = useCallback(() => {
    if (!fallbackPending.current) return;
    fallbackPending.current = false;
    phaseRef.current = 'idle';
    startRecorder().catch(() => reset());
  }, [startRecorder, reset]);

  const finishRecorder = useCallback(async () => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // Stopping an already-stopped recorder is harmless.
    }
    await save('', recorder.uri ?? null, 'audio/mp4', 'm4a');
  }, [recorder, save]);

  const stop = useCallback(() => {
    if (phaseRef.current !== 'listening') return;
    if (modeRef.current === 'record') void finishRecorder();
    else ExpoSpeechRecognitionModule.stop();
  }, [finishRecorder]);

  const cancel = useCallback(() => {
    if (phaseRef.current !== 'listening') return;
    cancelled.current = true;
    if (modeRef.current === 'record') void finishRecorder();
    else ExpoSpeechRecognitionModule.abort();
  }, [finishRecorder]);

  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      finals.current = join(finals.current, t);
      interim.current = '';
    } else {
      interim.current = t;
    }
    setText(join(finals.current, interim.current));
  });

  useSpeechRecognitionEvent('volumechange', (e) => {
    // The recogniser reports roughly -2 (silence) to 10 (loud).
    setLevel(Math.max(0, Math.min(1, (e.value + 2) / 12)));
  });

  useSpeechRecognitionEvent('audioend', (e) => {
    if (e.uri) audioUri.current = e.uri;
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (phaseRef.current !== 'listening' || modeRef.current !== 'transcribe') return;
    if (e.error === 'aborted' || e.error === 'no-speech' || e.error === 'speech-timeout') return;
    const nothingYet = !finals.current && !interim.current;
    if (nothingYet && !cancelled.current) {
      // Usually the offline speech pack for this language is missing. Keep the note as audio.
      notice.current('On-device transcription is unavailable for this language, so this note is audio only. See Settings.');
      fallbackPending.current = true;
      setTimeout(switchToRecorder, 1500); // in case no "end" event follows
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (modeRef.current !== 'transcribe') return;
    if (phaseRef.current !== 'listening') return;
    if (fallbackPending.current) {
      switchToRecorder();
      return;
    }
    void save(join(finals.current, interim.current), audioUri.current, 'audio/wav', 'wav');
  });

  return { phase, mode, text, level, startedAt, start, stop, cancel };
}
