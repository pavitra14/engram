#!/usr/bin/env bash
# Installs the APK on a running emulator, walks through the app and fails if it
# crashed. Screenshots and the log go to ./smoke.
# Tap coordinates assume a 1080x2400 screen at 2.625 density (Pixel 6 profile).
set -uo pipefail

APK="${1:?path to apk}"
PKG=dev.pavitra.engram
OUT=smoke
mkdir -p "$OUT"

shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
tap() { adb shell input tap "$1" "$2"; }
open() { adb shell am start -W -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null; }
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null; }

# The emulator's own launcher sometimes hangs and puts a "not responding" dialog over
# everything, swallowing the test's taps. Hide such dialogs and let the system settle.
adb shell settings put global hide_error_dialogs 1 || true
sleep 20
adb install -r "$APK" || exit 1
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS || true
adb logcat -c
adb shell cmd uimode night no

launch
# A new install opens on the tour.
sleep 25; shot 01-tour
tap 900 2290; sleep 2; shot 01b-tour-page-2
# Then three questions. Linking by meaning: the test says "Not now" (left button), so the
# before-and-after meaning check below still starts from off. New versions: "No thanks",
# so CI never asks GitHub.
for _ in 1 2 3 4; do tap 900 2290; sleep 2; done; shot 01c-tour-meaning-question
tap 300 2290; sleep 2; shot 01d-tour-updates-question
tap 300 2290; sleep 2; shot 01e-tour-usage-question
# The last page asks about usage counts. The test answers no in Settings, so CI never sends any.
open "engram://settings?metrics=off"; sleep 5

open "engram://samples"; sleep 18; shot 02-home

# Type a thought in the capture bar and send it.
tap 420 2221; sleep 2
adb shell input text "Sourdough"; sleep 2; shot 03-typing
adb shell input keyevent 4; sleep 2
tap 953 2221; sleep 4; shot 04-captured

# Open the newest thought with its to-do menu, and ask to be reminded in a week
# (always the second choice from the bottom of the sheet).
open "engram://latest?menu=todo"; sleep 6; shot 05-thought-todo-menu
tap 540 2084; sleep 4; shot 07-thought-reminder
adb shell input keyevent 4; sleep 3; shot 08-home-todo
open "engram://todo"; sleep 4; shot 09-todo
adb shell dumpsys alarm | grep -i "$PKG" | head -5 > "$OUT/alarms.txt" || true
adb shell dumpsys appwidget | grep -i -A2 "provider.*$PKG" | head -12 > "$OUT/widgets.txt" || true

# Share a picture in from "another app".
adb shell screencap -p /sdcard/Pictures/engram-test.png
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/engram-test.png >/dev/null; sleep 4
IMG_ID=$(adb shell content query --uri content://media/external/images/media --projection _id | tr -d '\r' | sed -n 's/.*_id=\([0-9]*\).*/\1/p' | tail -1)
echo "image id: ${IMG_ID:-none}"
if [ -n "${IMG_ID:-}" ]; then
  # Read access is only handed over for the intent's own address, so it is set as well as
  # the extra. (A real app's share carries it automatically.)
  adb shell am start -W -a android.intent.action.SEND -t image/png \
    -d "content://media/external/images/media/$IMG_ID" \
    --eu android.intent.extra.STREAM "content://media/external/images/media/$IMG_ID" \
    --grant-read-uri-permission "$PKG" >/dev/null
  sleep 3; shot 10-share-image
  sleep 5
  launch; sleep 8; shot 11-home-image
  tap 500 1500; sleep 1
fi
# The picture just shared, opened: any words read from it are shown under it.
open "engram://latest"; sleep 8; shot 11b-image-text
if [ -n "${IMG_ID:-}" ]; then
  # Tapping the picture opens it full screen; Back returns to the note.
  tap 540 700; sleep 3; shot 11c-picture-viewer
  adb shell input keyevent 4; sleep 2; shot 11d-picture-closed
fi
adb shell input keyevent 4; sleep 1

# Linking by meaning. Before: the garage thought shares no words with anything.
open "engram://search?q=garage"; sleep 5; shot 12-before-meaning
adb shell input keyevent 4; sleep 1
open "engram://settings?smart=on"; sleep 20; shot 13-meaning-starting
for i in $(seq 1 30); do
  sleep 10
  if adb logcat -d -s ReactNativeJS | grep -q "engram: meaning ready"; then break; fi
  if adb logcat -d -s ReactNativeJS | grep -q "engram: meaning error"; then break; fi
done
sleep 3; shot 14-meaning-done
open "engram://search?q=garage"; sleep 5; shot 15-after-meaning
adb shell input keyevent 4; sleep 1
tap 500 650; sleep 4; shot 15b-garage-thought
adb shell input keyevent 4; sleep 1

open "engram://map"; sleep 6; shot 16-map
open "engram://group/largest"; sleep 5; shot 17-group
# Hold the first note in the group: its menu slides up. Back closes it.
adb shell input swipe 500 950 500 950 700; sleep 2; shot 17b-hold-menu
adb shell input keyevent 4; sleep 2
open "engram://review"; sleep 5; shot 17c-review
adb shell input keyevent 4; sleep 2
# A note with a title: type the title, save, and check it appears.
open "engram://compose"; sleep 5
adb shell input text "Notepad"; sleep 2; shot 18-compose
tap 930 212; sleep 5; shot 18b-note-saved

# The two other home layouts, then back to the list.
# "engram://" is the home screen itself; without it the test would still be on whatever screen was open.
open "engram://settings?home=split"; sleep 3
open "engram://"; sleep 6; shot 18c-home-split
open "engram://settings?home=map"; sleep 3
open "engram://"; sleep 6; shot 18d-home-map
open "engram://settings?home=list"; sleep 3
open "engram://"; sleep 3
open "engram://settings"; sleep 5; shot 19-settings
adb shell input swipe 540 2000 540 500 300; sleep 1
adb shell input swipe 540 2000 540 500 300; sleep 2; shot 19b-settings-cloud

# Share text in from "another app".
adb shell am start -W -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "Sourdough\ hydration\ notes\ from\ the\ smoke\ test" "$PKG" >/dev/null
sleep 2; shot 20-share-text
sleep 5

# Shared while Engram is not running at all (issue #10): it must still be saved.
adb shell am force-stop "$PKG"; sleep 2
adb shell am start -W -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "Coldstart\ share\ from\ the\ smoke\ test" "$PKG" >/dev/null
sleep 6; shot 20b-share-cold
sleep 4
open "engram://search?q=coldstart"; sleep 5; shot 20c-share-cold-saved

# A reminder from plain words: the note keeps its words, a to-do is made, and a message offers Undo.
open "engram://"; sleep 4
tap 420 2221; sleep 2
adb shell input text "Call%sthe%sbank%stomorrow%s9am"; sleep 2
adb shell input keyevent 4; sleep 2
tap 953 2221; sleep 2; shot 24-plain-reminder
open "engram://todo"; sleep 5; shot 25-todo-boxes
adb shell input swipe 540 2000 540 700 300; sleep 2; shot 25b-todo-habits
open "engram://recap"; sleep 5; shot 26-recap
open "engram://map?play=1"; sleep 4; shot 27-map-playing
sleep 30
open "engram://trash"; sleep 4; shot 28-trash
open "engram://settings"; sleep 5
adb shell input swipe 540 2000 540 900 300; sleep 2; shot 29-settings-new
adb logcat -d -s ReactNativeJS | grep -E "engram: picture (read|not read)" | tail -3 > "$OUT/ocr.txt" || true
adb shell dumpsys package "$PKG" | grep -i -m3 "QuickTileService" > "$OUT/tile.txt" || true
adb shell dumpsys shortcut | grep -A12 "Package: $PKG" | head -30 > "$OUT/shortcuts.txt" || true

# The phone switches to dark while Engram has no screen open. On return it must follow, in true black.
adb shell cmd uimode night yes
launch; sleep 10; shot 21-home-black
open "engram://todo"; sleep 5; shot 22-todo-black
open "engram://map"; sleep 6; shot 23-map-black
adb shell cmd uimode night no; sleep 3

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
cat "$OUT/alarms.txt" || true
cat "$OUT/widgets.txt" || true
cat "$OUT/tile.txt" || true
echo "Text in pictures:"; cat "$OUT/ocr.txt" || true
cat "$OUT/shortcuts.txt" || true
echo "Smoke test passed."
