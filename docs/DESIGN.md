# Engram — design

## Direction

Engram should feel like looking into still water at night and seeing your thoughts lit up beneath it. Modern, minimal, a little futuristic, and calm enough to open twenty times a day.

**One loud thing.** The graph is the product and the only element allowed to glow, move and use colour freely. Every other surface is flat, quiet and text-first.

## What we took from award-winning apps

The 2026 Apple Design Awards and Google Play's recent picks were the reference set. We borrowed principles, not pixels.

| Reference | What stood out | How Engram uses it |
|---|---|---|
| Moonlitt (Apple Design Award 2026, Interaction) | A single fluid scene you explore directly with your fingers | The home screen is the graph itself, moved by direct touch, with no chrome between you and it |
| Tide Guide (Apple Design Award 2026, Visuals and Graphics) | Dense data made legible through a tight, consistent visual theme | Four kind colours used consistently everywhere a thought appears; nothing else is coloured |
| Google Play's 2025–26 productivity picks | Calm interfaces that surface only what matters in the moment | One dock for capture, three icons for navigation, detail only after you tap |
| Focus Friend (Google Play Best App 2025) | A simple idea with one clear action | Capture is always the same gesture in the same place |

## Colour

"Night water": a deep indigo field rather than black, so glow reads as light in a medium.

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0A0E1F` | Background |
| `inkRaised` | `#121733` | Cards, dock, inputs |
| `inkLifted` | `#1A2147` | Selected chips, notices |
| `halo` | `#1B2350` | Centre of the graph's radial wash |
| `text` | `#E9ECFF` | Primary text, solid buttons |
| `textSoft` | `#A3ABD6` | Secondary text |
| `textFaint` | `#6B739E` | Metadata, placeholders |
| `danger` | `#FF8A8A` | Destructive actions only |

Signal colours, one per kind of thought:

| Kind | Hex | |
|---|---|---|
| Note | `#9AA8FF` | periwinkle |
| Voice | `#5FE3D0` | aqua |
| Link | `#FFC46B` | amber |
| Image | `#F08BD0` | orchid |

Kind is never shown by colour alone: lists and cards pair the dot with the kind's name.

## Type

One family, **Sora**, in three weights. Its geometric forms carry the futuristic tone without a display face.

| Role | Weight | Size / line |
|---|---|---|
| Display | 600 | 28 / 34, tracking −0.6 |
| Title | 600 | 19 / 25, tracking −0.3 |
| Body | 400 | 15.5 / 23 |
| Body strong | 500 | 15.5 / 23 |
| Small | 400 / 500 | 13 / 18 |
| Thought text (detail) | 400 | 18 / 28 |

Sentence case everywhere. No all-caps labels.

## Shape and space

- Radii: pills for anything you tap (999), 28 for the dock and sheets, 20 for cards.
- Spacing scale: 6, 10, 16, 24, 36.
- Borders are hairlines in translucent periwinkle; there are no drop shadows. Depth comes from the three ink tones.
- Touch targets are at least 44 pt.

## The graph

- Nodes: filled circles, 5–12 pt radius by connection count, with a soft blurred copy underneath for glow.
- Edges: 1 pt lines at 30% opacity. Dimmed edges drop to 7%.
- Selecting or searching dims everything else to about 20% in 260 ms; nothing moves, so you keep your bearings.
- Pulses: 1.3 pt dots drifting along every other edge, slow enough to read as "alive", not "busy".
- New thought: one ring expands from the node over 1.4 s. This is the only attention-seeking animation in the app.
- Background: a radial wash from `halo` to `ink`, centred slightly above the middle.

## Motion

Motion answers a touch or marks one event (a thought landing). Screens cross-fade from the bottom. There are no decorative entrance animations.

## Layout

```
┌──────────────────────────────┐
│ engram            ⌕  ☰  ⚙   │  wordmark, count, three actions
│ 31 thoughts                  │
│                              │
│         ●───●                │
│       ●   ╲   ●──●           │  the graph, edge to edge
│     ●──●───●                 │
│              ●               │
│                        ⤢     │  fit to screen
│ ┌──────────────────────────┐ │
│ │ ● Voice        2 h ago   │ │  selection card (when a node is tapped)
│ │ Buy bread flour and rye… │ │
│ └──────────────────────────┘ │
│ ╭──────────────────────────╮ │
│ │ Capture a thought      🎙 │ │  capture dock
│ ╰──────────────────────────╯ │
└──────────────────────────────┘
```

## Voice

Plain, short, in the user's terms. Buttons say what happens ("Export a backup", "Delete everything"). Errors say what went wrong and what to do. Empty screens invite an action. The app never says "node", "edge" or "embedding"; it says thought and connection.

## Logo

A lowercase **e** drawn as a graph: one arc and one crossbar, with a thought at each end. The three nodes use the note, voice and link colours; the stroke runs periwinkle to aqua.

- Sources: `assets/brand/*.svg`
- App icon, adaptive foreground/background, monochrome (themed icons) and splash are rendered from those sources into `assets/images/`.

## Accessibility

- Every icon button has a spoken label; notices are announced as live regions.
- Text contrast on `ink`: `text` 16:1, `textSoft` 8.5:1, `textFaint` 4.2:1 (used for metadata only).
- The graph is a visual view; everything in it is also reachable through the list and search.
