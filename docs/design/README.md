# Design files

The mocks the app is built from. The live, editable canvas is at
<https://claude.ai/artifact/SShzkUjFEJ4VhXz8eBASAx> (private to the owner);
the files here are a snapshot of it.

## What is here

`mocks/` holds one self-contained HTML file per screen, sized 390 × 844. Open
them through the canvas, or read the markup: every colour, size and string is
inline, so they double as a spec.

| File | Screen |
|---|---|
| `Main.dc.html`, `OptionB-Stream.dc.html`, `OptionC-Orbit.dc.html` | The three home-screen directions that were explored. B's look with A's map was chosen. |
| `Home.dc.html` | 1. Today: the stream, the group pills, the capture bar |
| `Map.dc.html` | 2. Map of groups |
| `Group.dc.html` | 3. Inside a group |
| `Voice.dc.html` | 4. Recording a voice note |
| `Share.dc.html` | 5. Saved from another app's share sheet |
| `Thought.dc.html` | 6. A thought and what it links to |
| `Search.dc.html` | 7. Search |
| `Settings.dc.html` | 8. Settings |
| `*-Dark.dc.html` | The same eight screens in true black |
| `canvas.json` | Where each artboard sits on the canvas |
| `generate.py` | The script that produced screens 1 to 8 in both themes. Edit tokens here and re-run to restyle every screen at once. |

## Where the build differs from the mocks

- **Home has a third header button** for Settings, which the mock had no way to reach.
- **The capture field has an expand button** that opens the full-page note editor, and a "Save what you copied" prompt appears above it when the clipboard has text. Both were added after the mocks.
- **The voice screen has no Pause button.** Android's speech recogniser cannot pause and resume a session.
- **The share sheet is drawn over a dimmed Engram screen**, not over the app you shared from. A see-through share target needs a native translucent activity, which is not built yet.
- **Group circles are laid out automatically**, so their positions differ from the hand-placed mock.
