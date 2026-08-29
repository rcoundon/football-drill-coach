# Handoff: Football Drill Tool — Intuitiveness Redesign

## Overview

The drill tool works, but its interface presents ~30 visually identical pill buttons across three
undifferentiated toolbar rows. A coach must read every label to find anything, and several core
concepts (how to add a player, what the two colour rows control, that a drill is made of phases)
are not discoverable at all.

This document specifies a reorganisation of the same feature set — no features removed, no new
capabilities required — so that the interface communicates its own model. Priority order is given
in **Implementation order** at the end; the work can ship incrementally.

## About the Design Files

There are no HTML prototypes in this bundle. This is a **written specification** derived from a
review of the current UI (screenshot in the originating conversation). Implement it in the
existing codebase using its established framework, component patterns, and state management.
Every measurement, colour, and string below is prescriptive — where this document conflicts with
the current implementation, this document wins; where it is silent, keep current behaviour.

## Files in this bundle

| File | What it is |
|---|---|
| `README.md` | This specification. Self-sufficient — implement from this alone if you only read one file. |
| `Drill Tool - Target Layout.dc.html` | **Clickable design reference** of the tablet-landscape target layout (1366×1024). Open it in a browser. It is a prototype, not production code: recreate its structure and styling in the real codebase's framework. Wired: tool switching, add player/ball/cone, object selection + inspector, Pitch/View/Drill/Share popovers, phase cards with duplicate/insert/delete, prev/next, play + scrub, duration stepper, undo toast. Not wired: drag-from-rail, phase reorder, actual drawing on the pitch. |
| `assets/logo-basketball.png` | App mark used in the header. |

## Fidelity

**High-fidelity for structure and tokens; not pixel-perfect from a mock.** Layout, grouping,
sizes, colours, typography, and copy are specified numerically. Fine visual polish (exact icon
optical alignment, shadow tuning) is at the implementer's discretion within the token set.

---

## Diagnosis (why each change is being made)

| # | Problem in current UI | Consequence |
|---|---|---|
| 1 | Tools, object creators, toggles, destructive actions, and file operations all render as the same pill | No scanning hierarchy; every action costs a full read |
| 2 | Two colour swatch rows with no labels and no visible selection | Coach cannot tell player colour from ink colour, or what is currently active |
| 3 | No affordance for adding a player to the pitch | The primary action of the tool is invisible |
| 4 | Phases ("BUILD THE DRILL 1 2 + Add a phase") are the smallest element on screen | The drill's actual structure is hidden; animation feels like a side feature |
| 5 | Ambiguous / near-duplicate labels: `Ball` vs `+ Ball`, `Takes 1 s`, `Copy`/`Delete` with no stated object | Coach guesses, then undoes |
| 6 | Notes panel is permanently ~25% of viewport width, usually empty | Pitch — the only thing that matters — is squeezed |
| 7 | `Clear players`, `Clear drawings`, `Reset` sit adjacent to routine controls | Destructive actions one mis-tap away |

---

## Target Layout

Three regions replace the three toolbar rows. Desktop ≥1280px:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER  56px                                                                  │
│ [mark] New drill 2 copy ▾   ·  Saved 2m ago      [Undo][Redo] [Share ▾] [?]  │
├────────┬─────────────────────────────────────────────────────┬───────────────┤
│ TOOL   │                                                     │ INSPECTOR     │
│ RAIL   │                    PITCH                            │ 300px         │
│ 72px   │                  (flex: 1)                          │ (collapsible) │
│        │                                                     │               │
│ ▣ Move │                                                     │ Contextual:   │
│ ✎ Draw │                                                     │  · nothing    │
│ → Run  │                                                     │    selected → │
│ ⇢ Pass │                                                     │    Drill      │
│ ─ Line │                                                     │    notes      │
│ ▲ Cone │                                                     │  · player     │
│ T Text │                                                     │    selected → │
│ ◌ Erase│                                                     │    player     │
│        │                                                     │    options    │
│ ──     │                                                     │               │
│ ⊕ Add ▾│                                                     │               │
│        │                                                     │               │
│ ──     │                                                     │               │
│ ▦ Pitch│                                                     │               │
│ ◉ View │                                                     │               │
├────────┴─────────────────────────────────────────────────────┴───────────────┤
│ PHASE TIMELINE  120px                                                         │
│ [ ▸ ] 00:03 / 00:06  ━━━━━━━●━━━━━━━━━━━━   │ ▢1 2s  ▢2 4s  [+ Add phase]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Region 1 — Header (56px, full width)

Replaces the entire `DRILL` row.

- Left: app mark (24px) + drill name as an **editable text field styled as plain text** until
  focused (2px transparent border → `--brand-orange` on focus). Click to rename in place; no
  separate rename dialog.
- Next to the name: a `▾` menu button (Lucide `chevron-down`, 16px) containing
  **Open…**, **Save**, **Save As…**, **Duplicate**, **Import…**, **Delete Drill** (destructive,
  separated by a divider, red text).
- Centre-left, 13px `--text-muted`: autosave status — `Saved 2m ago` / `Saving…` / `Unsaved changes`.
  Autosave on every mutation with a 1s debounce; **the explicit `Save` button becomes optional**,
  which removes it from the working surface entirely.
- Right, in order: `Undo` / `Redo` as icon buttons (Lucide `undo-2` / `redo-2`, 20px, 40×40 hit
  area, disabled at 40% opacity when unavailable), a divider, then **Share ▾** containing
  **Export PNG**, **Export GIF**, **Export JSON**, and a **Help** icon button (Lucide `circle-help`).

Rationale: file operations are not part of drawing a drill. Moving nine of them into two menus
removes nine pills from the canvas chrome.

### Region 2 — Tool rail (72px, left edge, full height between header and timeline)

A **vertical segmented control** — exactly one tool active at a time, which is the truth of the
current model but is not currently expressed.

- Each item: 56×56px, 12px radius, Lucide icon 22px above a 10px uppercase label
  (letter-spacing 0.06em). Tooltip on hover shows label + single-key shortcut.
- Icons and shortcuts:

| Tool | Lucide icon | Key |
|---|---|---|
| Move | `move` | `V` |
| Draw | `pencil` | `D` |
| Run | `move-right` (with dashed treatment) | `R` |
| Pass | `arrow-right` | `P` |
| Line | `minus` | `L` |
| Cone | `triangle` | `C` |
| Text | `type` | `T` |
| Erase | `eraser` | `E` |

- **Active state:** ember gradient fill `linear-gradient(135deg,#ff6b35,#ee0a24)`, white icon and
  label, `box-shadow: 0 6px 16px -8px rgba(238,10,36,.55)`, and a 3px ember bar on the rail's
  inner edge. Scale-in on activation, 180ms `cubic-bezier(0.34,1.56,0.64,1)`.
- **Inactive:** transparent background, `--ink-3` icon; hover → `rgba(255,255,255,.06)` and
  `translateY(-1px)`.
- Below a divider: **`⊕ Add`** (Lucide `circle-plus`) opens the object palette (see below).
- Below a second divider: **`▦ Pitch`** and **`◉ View`** popovers (see below).

### Region 3 — Object palette (popover from `⊕ Add`, 260px wide)

Solves problem 3. Contains two labelled groups:

- **PLAYERS** — five 44px discs in the existing team colours (red `#EF4444`, blue `#3B82F6`,
  yellow `#FACC15`, purple `#A855F7`, black `#1F2937`), each with a `+` badge on hover.
  Under them, helper text in 13px `--ink-3`: `Drag onto the pitch, or click to drop at centre.`
- **OBJECTS** — `Ball`, `Cone`, `Text label`, each a 44px-tall row with icon + label.

Both interactions must work: **drag from palette to pitch** (the discoverable one) and **click to
drop at pitch centre** (the fast one). The palette stays open while dragging repeatedly and
closes on Escape or outside click. This also resolves `Ball` vs `+ Ball`: one entry adds a ball;
ball **visibility** moves to the View popover.

### Region 4 — Pitch popover (`▦ Pitch`, 240px)

Replaces `Blank / Full / Half / Rotate`. Four **thumbnails, not words** — 96×64px mini pitch
diagrams drawn in SVG showing Blank, Full, Half, and (as a toggle, not a fourth preset)
**Orientation: Portrait / Landscape** as a two-item segmented control.

### Region 5 — View popover (`◉ View`, 240px)

Toggle rows (44px tall, label left, switch right), replacing the `Labels` / `Notes` / `Ball` pills:

- `Player labels` — on
- `Ball` — on
- `Grid` — off (if the codebase supports it; omit otherwise)
- `Notes panel` — mirrors the inspector's collapsed state

### Region 6 — Inspector (300px, right, collapsible)

Solves problems 6 and 5 (`Copy` / `Delete` without a stated object).

- **Nothing selected:** header `DRILL NOTES` (11px, uppercase, 0.08em tracking, `--ink-3`) and a
  full-height textarea, placeholder `Setup, coaching points, progressions…`. Notes are stored
  **per drill** as today; additionally show a small `Phase 2 note` field beneath so coaches can
  annotate a single phase.
- **A player or object selected:** the panel becomes an object inspector — colour swatch row,
  a `Label` text input (e.g. `9`, `GK`, `CB`), and a row of actions: **Duplicate** (Lucide `copy`)
  and **Remove** (Lucide `trash-2`, red). This is where `Copy` and `Delete` live; they disappear
  from global chrome, so they always have an obvious subject.
- Collapse to a 40px strip with a `chevron-right` and a vertical `NOTES` label. Persist the
  collapsed state in local storage. **Default: collapsed**, so the pitch is full width on first run.

### Region 7 — Phase timeline (120px, full width, bottom)

Solves problem 4 — the drill's structure becomes the most legible thing after the pitch.

Left cluster (playback, 200px):
- `⏮` restart (Lucide `skip-back`) and a 48px circular **Play/Pause** button in the ember gradient
  (Lucide `play` / `pause`), then the clock in JetBrains Mono `tabular-nums`:
  `00:03 / 00:06`, 15px.
- The scrub bar spans the remaining left area: 4px track `rgba(255,255,255,.14)`, played portion in
  the ember gradient, 14px round handle. Phase boundaries are marked with 2px ticks so scrubbing
  relates visibly to phases.

Right cluster (phases, flex):
- A horizontal, scrollable strip of **phase cards**, 96×72px, 12px radius. Each card shows a
  live miniature render of that phase's pitch (reuse the pitch renderer at scale), a phase number
  top-left, and its duration bottom-right in mono (`2s`).
- The active card gets a 2px ember border and the ember glow; others `--surface-2` with a hairline
  border. Hover reveals a `⋯` overflow (Lucide `more-vertical`) with **Duplicate phase**,
  **Insert phase after**, **Delete phase** (destructive).
- Cards are **drag-to-reorder**.
- Duration editing replaces `Takes 1 s`: click the duration on the active card to edit inline, or
  use a stepper in the card's hover state. Label the field `Duration` with a `s` suffix.
- Trailing `+ Add phase` card: dashed 2px border, centred `plus` icon, same 96×72 footprint.
  A new phase **copies the current phase's state** (this is almost always what a coach wants) —
  state the behaviour in a one-time tooltip: `New phases start from a copy of the current one.`

### Destructive actions (problem 7)

`Clear players`, `Clear drawings`, and `Reset` leave the toolbar. They move into a
**`⋯` overflow menu in the header**, in a divider-separated destructive group with red text, and
each requires either a confirmation dialog (`Reset`) or an **undo toast**
(`Cleared 5 players.  [Undo]`, 6s) for the two clears. Undo toast is preferred — it is faster and
still safe.

---

## Tablet — current state and target

The tablet build already diverges from desktop: it has a **left rail** carrying the player
swatches, the eight tools stacked vertically, and the ink swatches at the bottom. That is the
right instinct and the target layout above is deliberately its successor — but it introduces its
own problems, plus one shared with desktop.

### Additional findings, tablet

| # | Problem | Fix |
|---|---|---|
| T1 | Desktop and tablet put the same controls in different places (swatches in the top row vs in the rail). A coach who plans on desktop and runs the drill on a tablet learns the tool twice | Converge both on the rail + header + timeline structure specified above. One model, two widths |
| T2 | Three toolbar rows still sit above the pitch, costing ~280px of a tablet's short axis while the rail sits half empty below the ink swatches | The header/menu consolidation removes two of the three rows outright; whatever remains folds into the 56px header |
| T3 | The rail is ~250px wide but its widest content is a 44px disc. Tools render as full-width text pills | Rail narrows to **88px** on tablet (72px desktop): icon + 10px label, 56×56 items, ≥44px targets preserved |
| T4 | Player swatches, tools, and ink swatches are one undivided vertical run — nothing says the top group creates objects and the bottom group colours strokes | Group with labelled dividers: eyebrow labels `ADD` and `INK` (11px, uppercase, 0.08em, `--ink-3`), and scope the ink group so it is visible only while a drawing tool is active |
| T5 | Drill notes are pushed **below** the pitch, off-screen without scrolling — the notes exist but are effectively unreachable while working | Notes become the collapsible inspector as a **right-edge bottom sheet** on tablet: a 44px `NOTES` tab pinned to the right edge, sliding a 360px sheet over the pitch |
| T6 | `+ Add a phase` is the only green element in the UI and reads as the primary action of the whole screen | Use the design system's success gradient only where an action is confirming/legal. `+ Add phase` becomes a dashed-border phase card at the end of the strip (see Region 7) |
| T7 | Phase numbers, playback, delete, duration, restart, play, and scrub are seven adjacent controls in one 60px strip | The 120px phase timeline replaces it; on tablet the phase cards shrink to 80×60px and the strip scrolls horizontally |

### Tablet target layout (1024×768 landscape)

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER 56px   [mark] New drill 2 copy ▾  Saved  [↶][↷] [Share▾][?]│
├──────┬────────────────────────────────────────────────────┬──────┤
│ RAIL │                                                    │ N    │
│ 88px │                      PITCH                         │ O 44 │
│      │                                                    │ T    │
│ ADD  │                                                    │ E    │
│ ●●●●●│                                                    │ S    │
│ ⚽ ▲ T│                                                    │      │
│ ──── │                                                    │      │
│ TOOLS│                                                    │      │
│ ▣ ✎ →│  (single column, 56×56)                            │      │
│ ⇢ ─ ▲│                                                    │      │
│ T ◌  │                                                    │      │
│ ──── │                                                    │      │
│ INK  │  (only while a drawing tool is active)             │      │
│ ○○○○ │                                                    │      │
│ ──── │                                                    │      │
│ ▦ ◉  │                                                    │      │
├──────┴────────────────────────────────────────────────────┴──────┤
│ PHASE TIMELINE 104px   [▸] 00:03/00:06 ━━●━━ │ ▢1 ▢2 [+]         │
└──────────────────────────────────────────────────────────────────┘
```

On tablet the `⊕ Add` popover of the desktop spec is **inlined into the rail** as the `ADD` group
(five player discs at 44px, wrapped two per row, plus ball / cone / text) — there is room, and one
fewer popover is one fewer tap. Desktop may inline it identically if the rail is widened to 88px;
pick one and use it everywhere.

**Touch specifics.** Drag from a rail disc onto the pitch must work with a touch pointer
(`touch-action: none` on the disc, pointer events not mouse events). Tap-to-drop-at-centre is the
fallback. Long-press (500ms) on a pitch object opens the object inspector sheet directly. No
hover-only affordances anywhere: the phase-card `⋯` overflow must be permanently visible on
touch, and every tooltip's content must also exist in the Help panel.

---

## Interactions & Behavior

**Keyboard.** Single-key tool shortcuts as tabled (`V D R P L C T E`); `1`–`9` jump to phase N;
`Space` play/pause; `⌘/Ctrl+Z` undo, `⌘/Ctrl+Shift+Z` redo; `⌘/Ctrl+D` duplicate selection;
`Backspace`/`Delete` remove selection; `Escape` deselect and close popovers. Show all of these in
the Help panel, grouped by region.

**Selection.** Clicking an object with the Move tool selects it (2px white ring + 2px offset,
plus the ember inspector). Shift-click extends selection. Dragging on empty pitch with Move draws
a marquee. Any selection populates the inspector.

**Drag and drop.** Palette → pitch drag shows a 44px ghost at 70% opacity following the cursor and
a drop-target crosshair on the pitch. On drop, the object pops in
(`scale .8 → 1`, 180ms, pop easing).

**Empty state.** With no players on the pitch, overlay a centred, non-interactive prompt:
headline `Build your first phase` (24px, weight 800) and body
`Drag players from Add onto the pitch, then use Run and Pass to show movement.` Fades out on the
first object added; never returns.

**Motion.** Durations 160–300ms. Pop easing `cubic-bezier(0.34,1.56,0.64,1)` for tool/phase
activation and object drops; `ease-out` for popovers (fade + 4px rise). Hover lift
`translateY(-1px)`; press `scale(.97)`. Honour `prefers-reduced-motion: reduce` by dropping
transforms and keeping opacity only.

**Responsive.** ≥1280px: layout as specified. 1024–1280px (tablet landscape): rail 88px with the
inlined `ADD` group, notes as a right-edge sheet, timeline 104px — see the tablet section.
<1024px (tablet portrait / phone): rail becomes a bottom-anchored horizontal scroller directly
above the timeline, and the timeline collapses to playback plus a phase counter with `‹ 2/4 ›`
stepping. Touch targets never below 44px at any width.

## State Management

State the redesign needs beyond what the tool already holds:

- `activeTool: 'move'|'draw'|'run'|'pass'|'line'|'cone'|'text'|'erase'`
- `activeInk: string` — drawing colour, scoped to drawing tools
- `nextPlayerColor: string` — palette colour for the next player drop
- `selection: string[]` — ids of selected pitch objects; drives the inspector
- `openPopover: 'add'|'pitch'|'view'|'share'|'drillMenu'|null` — one at a time
- `inspectorCollapsed: boolean` — persisted
- `view: { labels, ball, grid }`
- `phases: Phase[]` with `{ id, durationSeconds, note, objects }`; `activePhaseId`
- `playback: { playing, elapsedMs }`
- `saveStatus: 'saved'|'saving'|'dirty'` + `lastSavedAt`
- `undoStack` / `redoStack` — unchanged if already present; must now also cover phase reorder,
  phase delete, and clear actions so the undo toast is honest

## Design Tokens

Warm-charcoal dark theme from the On Court design system (`_ds/.../colors_and_type.css`), which
keeps the tool dark — as today — while giving it brand warmth instead of blue-grey slate.

**Colour**

| Token | Value | Use |
|---|---|---|
| `--bg-app` | `#140E0A` | app background |
| `--surface-1` | `#1F1410` | header, rail, timeline |
| `--surface-2` | `#2A1810` | cards, popovers, inputs |
| `--border` | `rgba(255,255,255,.10)` | hairlines |
| `--border-strong` | `rgba(255,107,53,.30)` | focus / active borders |
| `--ink-1` | `#FFF8F3` | primary text |
| `--ink-2` | `rgba(255,248,243,.72)` | labels |
| `--ink-3` | `rgba(255,248,243,.48)` | helper text, inactive icons |
| brand gradient | `linear-gradient(135deg,#ff6b35,#ee0a24)` | active tool, play button, scrub fill |
| button gradient | `linear-gradient(180deg,#ff7a4d,#ee0a24)` | primary buttons |
| success | `linear-gradient(135deg,#a3e635,#65a30d)` with ink `#1A2E00` | confirm actions |
| flame | `linear-gradient(135deg,#facc15,#f97316)` | duration / count badges |
| error | `#EF4444` | destructive text and icons |
| pitch green | keep the existing pitch fill and line colours | pitch surface |

**Type** — Satoshi (Fontshare) for UI; 700–800 for headings, buttons, and rail labels.
JetBrains Mono with `font-variant-numeric: tabular-nums` for **all** numerics: clock, durations,
phase numbers, player labels. Scale: 24/18/15/13/11px. Headings `letter-spacing:-0.02em`;
uppercase eyebrows `0.08em`.

**Radius** — 24px sheets/popovers, 16px cards and phase cards, 12px buttons and rail items,
50% player discs, full pill for chips.

**Shadow** — cards `0 4px 12px -4px rgba(0,0,0,.5)`; popovers `0 16px 40px -12px rgba(0,0,0,.65)`;
brand glow `0 8px 18px -8px rgba(238,10,36,.45)` plus `inset 0 1px 0 rgba(255,255,255,.25)` on
gradient buttons.

**Spacing** — 4px base; 8/12/16/24 the working steps. Rail item gap 4px; header gap 12px;
timeline padding 16px.

## Assets

- **Icons: Lucide** (https://lucide.dev), stroke ~2px, rounded caps, 16–22px. No emoji, no icon
  font. Use the codebase's existing Lucide package if present.
- **Fonts:** Satoshi (Fontshare), JetBrains Mono (Google Fonts / self-host).
- No new imagery. Pitch presets are hand-authored SVG thumbnails; phase-card miniatures reuse the
  existing pitch renderer at reduced scale — do not author separate artwork.

## Implementation order

Each step is independently shippable and ordered by intuitiveness gained per unit of work.

0. **Converge desktop and tablet on one structure** (header + rail + pitch + inspector +
   timeline). Do this first — every step below is then written once, not twice.
1. **Tool rail** — vertical segmented control with icons, labels, shortcuts, and an unmistakable
   active state. Removes the largest source of scanning cost.
2. **Header** — move all nine file/export operations into the drill menu and Share menu; add
   inline rename and autosave status.
3. **Add palette** — drag-or-click player and object placement, with the empty-state prompt.
4. **Phase timeline** — phase cards with miniatures, inline duration, reorder, per-card overflow.
5. **Inspector** — contextual panel; `Copy`/`Delete` become `Duplicate`/`Remove` on a selection;
   default collapsed.
6. **Pitch and View popovers** — thumbnails and switches replacing seven pills.
7. **Destructive actions** — overflow group, undo toasts, confirmation on Reset.
8. **Tokens and motion** — apply the warm-charcoal palette, Satoshi/JetBrains Mono, radii, and
   pop easing across the whole surface.

## Acceptance checks

- No control on the default working surface is a bare text pill except `+ Add phase`.
- Exactly one tool reads as active at any time, identifiable at a glance from 1m away.
- A first-time user can place a player without opening Help.
- Every destructive action is either confirmed or undoable via toast.
- Pitch width on first run is at least 80% of the viewport's content width.
- All numerics render in tabular mono and do not shift width while the clock runs.
- Full keyboard operation of tool switching, phase navigation, and playback.
- Drill notes are reachable on tablet without scrolling the page.
- No control depends on hover to be discoverable or operable.
- Desktop and tablet place the same control in the same region.
- `prefers-reduced-motion: reduce` removes all transform animation.
