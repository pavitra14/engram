#!/usr/bin/env bash
# Installs the APK on a running emulator, walks through every screen in both
# themes and fails if the app crashed. Screenshots and the log go to ./smoke.
# Tap coordinates assume a 1080x2400 screen at 2.625 density (Pixel 6 profile).
set -uo pipefail

APK="${1:?path to apk}"
PKG=com.pavitra14.engram
OUT=smoke
mkdir -p "$OUT"

shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
open() { adb shell am start -W -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null; }
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null; }

adb install -r "$APK" || exit 1
adb logcat -c
adb shell cmd uimode night no

launch
sleep 25; shot 01-empty

open "engram://samples"; sleep 18; shot 02-home

# Type a thought in the capture bar and send it.
adb shell input tap 400 2221; sleep 2
adb shell input text "Sourdough"; sleep 2; shot 03-typing
adb shell input keyevent 4; sleep 2
adb shell input tap 953 2221; sleep 4; shot 04-captured

# Open the first thought in the stream.
adb shell input tap 500 900; sleep 4; shot 05-thought
adb shell input keyevent 4; sleep 2

open "engram://map"; sleep 6; shot 06-map
open "engram://group/largest"; sleep 5; shot 07-group
open "engram://search"; sleep 4
adb shell input text "sourdough"; sleep 3; shot 08-search
adb shell input keyevent 4; sleep 1
open "engram://compose"; sleep 4
adb shell input text "Notepad"; sleep 2; shot 09-compose
adb shell input keyevent 4; sleep 1
open "engram://settings"; sleep 5; shot 10-settings

# Share text in from "another app".
adb shell am start -W -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "Sourdough\ hydration\ notes\ from\ the\ smoke\ test" "$PKG" >/dev/null
sleep 2; shot 11-share
sleep 5

# The phone switches to dark while Engram has no screen open (it closed itself
# after the share). On return it must follow, in true black.
adb shell cmd uimode night yes
launch; sleep 10; shot 12-home-black
open "engram://map"; sleep 6; shot 13-map-black
open "engram://group/largest"; sleep 5; shot 14-group-black
open "engram://search"; sleep 4
adb shell input text "hampi"; sleep 3; shot 15-search-black
adb shell input keyevent 4; sleep 1
open "engram:///"; sleep 5
adb shell input tap 500 900; sleep 4; shot 16-thought-black
adb shell cmd uimode night no; sleep 4; shot 17-thought-light-again

# The in-app override: Settings, Appearance, Black, while the phone is light.
open "engram://settings"; sleep 5
adb shell input tap 852 677; sleep 3; shot 18-settings-forced-black
adb shell input tap 240 677; sleep 2

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
