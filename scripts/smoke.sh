#!/usr/bin/env bash
# Installs the APK on a running emulator, walks through the main screens and
# fails if the app crashed. Screenshots and the log are written to ./smoke.
set -uo pipefail

APK="${1:?path to apk}"
PKG=com.pavitra14.engram
OUT=smoke
mkdir -p "$OUT"

shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
open() { adb shell am start -W -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null; }

adb install -r "$APK" || exit 1
adb logcat -c

adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 25; shot 01-empty

open "engram://samples"; sleep 20; shot 02-graph
sleep 6; shot 03-graph-settled

# Tap the middle of the graph area, then type a thought in the dock.
adb shell input tap 540 1100; sleep 3; shot 04-tap

open "engram://stream"; sleep 6; shot 05-list
open "engram://settings"; sleep 6; shot 06-settings

adb shell am start -W -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "Sourdough\ hydration\ notes\ from\ the\ smoke\ test" "$PKG" >/dev/null
sleep 5; shot 07-share
sleep 4

adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 10; shot 08-after-share

adb logcat -d > "$OUT/logcat.txt"
if grep -E "FATAL EXCEPTION|Fatal signal" -A 25 "$OUT/logcat.txt" | grep -q "$PKG"; then
  echo "The app crashed. See smoke/logcat.txt"
  grep -E "FATAL EXCEPTION|Fatal signal" -A 25 "$OUT/logcat.txt" | head -80
  exit 1
fi
if ! adb shell pidof "$PKG" >/dev/null; then
  echo "The app is not running at the end of the test."
  exit 1
fi
grep -E "ReactNativeJS" "$OUT/logcat.txt" | tail -40 || true
echo "Smoke test passed."
