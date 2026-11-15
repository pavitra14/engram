# Engram — design

_Version 2, November 2026. Replaces the dark "night water" direction of v1. The mocks are in [`design/`](design/README.md)._

## Direction

A calm, typographic notebook that happens to organise itself. Your words are the interface: thoughts are set in a reading serif, large and unhurried, and everything else steps back. The network is still there, as a map of named groups, but it no longer stands between you and what you wrote.

**One loud thing.** The capture control is the only large filled shape on any screen. Everything else is text, hairlines and quiet outlines.

## Principles, and where they come from

| Principle | Source | How Engram applies it |
|---|---|---|
| Content first; controls support it | Apple HIG (hierarchy, harmony, consistency) | Thought text is the largest thing on every screen. Buttons are outlines that float at the edges. |
| Make the main action unmissable | Material 3 Expressive research (key actions found up to 4x faster when given size, shape and colour) | One filled, accent-coloured mic/send button, 64 pt, always bottom right. |
| A phone graph must be readable | Reviews of graph views on mobile | The map shows named groups, not anonymous dots. Thoughts are always shown as words. |
| Calm, progressive disclosure | 2026 Apple Design Award winners (Structured, Moonlitt) | Home shows today. Groups, links and tags appear one tap deeper. |
| Never rely on colour alone | Guitar Wiz (ADA 2026, Inclusivity), WCAG | Kind is an icon plus a word. Groups are named; their colour is a secondary cue. |
| Works on both platforms | Material and HIG | 48 pt targets, safe-area insets, a visible back control plus the system back gesture, a theme override. |

## Colour

Two themes share one set of token names (`src/theme.tsx`).

| Token | Light | Black | Use |
|---|---|---|---|
| `bg` | `#F3F4F1` | `#000000` | Screen background |
| `surface` | `#FFFFFF` | `#111312` | Fields, cards, outline buttons |
| `ink` | `#15171A` | `#E8EAE4` | Text, selected pills |
| `soft` | `#5A5F66` | `#A3A8A0` | Secondary text |
| `faint` | `#7A8088` | `#7E847C` | Placeholders, interim transcript (large text only) |
| `line` | `#D5D8D2` | `#2A2D2B` | Borders |
| `rule` | `#DADDD6` | `#1F2220` | Dividers between rows |
| `accent` | `#1F3FBF` | `#8FA6FF` | The capture button, links, kind icons |
| `onAccent` | `#FFFFFF` | `#000000` | Icon or text on the accent |
| `danger` | `#B3261E` | `#F2B8B5` | Destructive actions |
| `highlight` | `#C7DEFF` | `#233971` | Search matches |

**Black** is true black so AMOLED pixels switch off. Text is off-white to avoid glare, and the accent is lighter because cobalt is too dim on black. Depth comes from the `surface` tone and borders; there are no shadows in either theme.

**Group colours** are eight hues at one lightness and chroma, so no group looks more important than another: fills at `oklch(0.93 0.04 h)` with borders at `oklch(0.72 0.09 h)` in light, `oklch(0.25 0.05 h)` and `oklch(0.52 0.09 h)` in black, for hues 75, 285, 185, 20, 140, 240, 330, 105. Groups take colours in size order.

Contrast (WCAG): `ink` on `bg` 16:1 light, 17:1 black. `soft` 5.8:1 light, 8.7:1 black. `accent` on `bg` 7.5:1 light, 9.1:1 black. `faint` is 3.6:1 in light and is used only at 24 pt and above or for placeholders.

## Type

| Role | Face | Size / line |
|---|---|---|
| Screen title | Newsreader Medium | 38 / 44, tracking −0.8 |
| Sheet title | Newsreader Medium | 28 / 34 |
| Thought, on its own screen | Newsreader Regular | 27 / 36 |
| Thought, in a list | Newsreader Regular | 22 / 30 (20 / 27 in dense lists) |
| Live transcript | Newsreader Regular | 32 / 42 |
| Note editor | Newsreader Regular | 21 / 31 |
| Body, buttons, labels | Inter Regular / Medium / SemiBold | 16, 15, 14 |
| Metadata | Inter Regular | 13 / 18 |

Newsreader is for the person's own words and for titles. Inter is for everything the app says. Sentence case everywhere; no all-caps labels. Both faces must scale with the system text-size setting.

## Shape and space

- Everything you can tap is a pill or a circle. Fields and buttons are 48, 56 or 64 pt tall with fully rounded ends.
- Cards and sheets use a 20 pt radius; the share sheet's top corners are 28.
- Screen margins are 24 pt for text and 16 pt for full-width controls.
- Rows in a list are separated by a 1 pt rule, not by cards.
- Minimum target 48 × 48 pt with at least 8 pt between targets.

## Motion and feedback

Motion answers a touch. Buttons shrink slightly while pressed. Screens slide in from the right; the voice screen and note editor rise from the bottom; search fades. The clipboard prompt and the share sheet ease in from below. Saving a thought and starting a recording give a light haptic tap. Nothing animates on its own.

## Screens

1. **Today** — the stream, newest first, grouped by day. Group pills across the top. Capture bar at the bottom.
2. **Map** — one circle per group, sized by count, with lines between related groups. Your latest thought and where it landed.
3. **Group** — the group's thoughts and the groups near it.
4. **Voice** — live transcript in large type, a level meter, one big save button.
5. **Share** — a sheet confirming the save and where the item was placed.
6. **Thought** — the text (editable in place), audio, group and tags, linked thoughts with the reason for each link.
7. **Search** — matches highlighted, kind filters with counts, matching groups first.
8. **Settings** — appearance, voice language, backup, data.
9. **Note editor** — a full page for longer notes.

## Voice and wording

Plain and specific. Buttons name the action ("Save what you copied", "Export"). Errors say what happened and what to do. People see "thought", "link" and "group"; never "node", "edge", "cluster" or "embedding". Every "placed in" line tells the truth about where a thought went.

## Brand

- **Name:** engram, lower case in the wordmark.
- **Mark:** a serif **e** followed by a dot: a thought, set down. On the icon the letter is paper-coloured on cobalt and the dot is the lighter accent.
- **Wordmark:** "engram." in Newsreader Medium, ink on paper, with the full stop in cobalt.
- **Sources:** `assets/brand/*.svg` (they reference the Newsreader font; render with it installed). The PNGs in `assets/images/` are rendered from them: app icon, adaptive foreground and background, monochrome for themed icons, and light and dark splash marks.

## Accessibility

- Every icon button has a spoken label; notices are live regions.
- Kind and group are never shown by colour alone.
- Layouts are stacks and wrapping rows so they reflow at large text sizes. This has not yet been tested at 200%.
