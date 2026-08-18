# Football Coach Tactics Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-only Vue 3 web app where a football coach drops coloured counters on a pitch, drags them around, draws runs and passes, marks who has the ball, and saves patterns in the browser for reuse.

**Architecture:** The board renders as a single SVG whose contents are driven by reactive state held in one composable singleton (`useBoard`). Only `useBoard` mutates state; components emit intent. Every mutation passes through a single `commit()` chokepoint that snapshots state for undo. All positions are stored in pitch units, never pixels, so nothing moves when the window resizes or the pitch type changes.

**Tech Stack:** Vue 3.5.41, Vite 8.2.1, TypeScript 7.0.2, Vitest 4.1.11, @vue/test-utils 2.4.11, jsdom 30.0.1. No runtime dependencies beyond Vue.

**Spec:** `docs/superpowers/specs/2026-08-18-football-coach-tactics-design.md`

## Global Constraints

- **Exact dependency versions only.** No `^`, no `~`, anywhere in `package.json`.
- **Coordinate space is 0–100 in x, 0–64.76 in y.** Exported as `PITCH_W = 100` and `PITCH_H = 64.76`. This supersedes the spec's `viewBox="0 0 100 100"`: a square viewBox over a 105×68 pitch would distort the centre circle into an ellipse. The scale factor is `100 / 105`, applied uniformly to both axes, so `68 × (100 / 105) = 64.76`.
- **Positions are never stored in pixels.** Any pixel value that reaches state is a bug.
- **`useBoard` is the only module that mutates board state.** Components call its methods; they never assign to state properties.
- **Every state change that a user would expect to undo goes through `commit()`.** Drags commit exactly once, on pointer-up.
- **All pointer input uses Pointer Events** (`pointerdown`/`pointermove`/`pointerup`), never mouse or touch events. This gives one code path for mouse, finger, and stylus.
- **localStorage keys:** `fct.patterns.v1` for the saved library, `fct.draft.v1` for the autosaved working board.
- **Pattern schema version is `1`.** A loader that meets any other version rejects the pattern rather than loading it partially.
- **Counter colours are exactly five:** `red`, `blue`, `yellow`, `green`, `black`.
- **TDD.** Every task writes the failing test first, watches it fail, then implements. Commit at the end of each task.

---

## File Structure

```
football-coach-tactics/
├── package.json                     Exact-pinned deps and scripts
├── tsconfig.json                    App TypeScript config
├── tsconfig.node.json               Config-file TypeScript config
├── vite.config.ts                   Vite + Vue plugin + Vitest config
├── index.html                       Entry HTML
├── src/
│   ├── main.ts                      Mounts App
│   ├── App.vue                      Layout, keyboard shortcuts
│   ├── types.ts                     All shared types; no logic
│   ├── geometry.ts                  Pure coordinate maths; no DOM, no state
│   ├── composables/
│   │   ├── useBoard.ts              State singleton, all mutations, undo/redo
│   │   ├── useStorage.ts            localStorage, serialisation, import merge
│   │   └── useExport.ts             SVG→PNG, JSON download/upload
│   └── components/
│       ├── Toolbar.vue              Tool mode, palette, pitch, rotate, undo, export
│       ├── PitchBoard.vue           The <svg>; pointer handling, tool dispatch
│       ├── PitchMarkings.vue        Pure markings render from pitch type
│       ├── PlayerCounter.vue        One counter
│       ├── BallToken.vue            The ball
│       ├── DrawingLayer.vue         Pen paths and arrows
│       └── PatternLibrary.vue       Saved patterns list
└── tests/
    ├── geometry.spec.ts
    ├── useBoard.spec.ts
    ├── useBoard.counters.spec.ts
    ├── useBoard.ball.spec.ts
    ├── useBoard.drawings.spec.ts
    ├── useStorage.spec.ts
    ├── PitchMarkings.spec.ts
    ├── PitchBoard.spec.ts
    ├── Toolbar.spec.ts
    └── PatternLibrary.spec.ts
```

**Why this split:** `geometry.ts` is pure maths with no DOM and no state, so it is trivially testable and is the module most likely to harbour subtle bugs. `useBoard.ts` holds all mutation so undo cannot be bypassed. Components are presentational and are tested through simulated pointer events rather than by inspecting internals.

---

## Task 1: Project scaffold, types, and pitch geometry constants

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/types.ts`, `src/geometry.ts`, `src/main.ts`, `src/App.vue`
- Test: `tests/geometry.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types in `src/types.ts` (`PitchType`, `CounterColor`, `Vec`, `Counter`, `Drawing`, `Ball`, `Frame`, `Pattern`, `ToolMode`, `Rect`); from `src/geometry.ts` — `PITCH_W: number`, `PITCH_H: number`, `COUNTER_COLORS: readonly CounterColor[]`, `viewBoxOf(rotated: boolean): string`, `toView(p: Vec, rotated: boolean): Vec`, `fromView(p: Vec, rotated: boolean): Vec`.

- [ ] **Step 1: Create the package manifest**

Create `package.json`:

```json
{
  "name": "football-coach-tactics",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "vue": "3.5.41"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "6.0.8",
    "@vue/test-utils": "2.4.11",
    "jsdom": "30.0.1",
    "typescript": "7.0.2",
    "vite": "8.2.1",
    "vitest": "4.1.11",
    "vue-tsc": "3.3.10"
  }
}
```

If `npm install` or `npm run build` fails because `vue-tsc` 3.3.10 cannot work with TypeScript 7.0.2 (the native-port release), downgrade `typescript` to the latest 6.x and record the reason in the commit message. Do not add a `^` to work around it.

- [ ] **Step 2: Create the TypeScript and Vite configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
```

Create `.gitignore`:

```
node_modules
dist
.DS_Store
*.local
```

- [ ] **Step 3: Create the entry point and a placeholder App**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Tactics Board</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`maximum-scale=1.0, user-scalable=no` is deliberate: without it, a two-finger slip while dragging a counter pinch-zooms the page on a tablet.

Create `src/main.ts`:

```ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

Create `src/App.vue`:

```vue
<template>
  <main class="app">
    <h1>Tactics Board</h1>
  </main>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
</style>
```

- [ ] **Step 4: Create the shared types**

Create `src/types.ts`:

```ts
export type PitchType = 'blank' | 'full' | 'half'

export type CounterColor = 'red' | 'blue' | 'yellow' | 'green' | 'black'

export type ToolMode = 'select' | 'pen' | 'arrow-run' | 'arrow-pass' | 'erase'

/** A position in pitch units: x in 0..PITCH_W, y in 0..PITCH_H. Never pixels. */
export type Vec = { x: number; y: number }

/** A screen-space rectangle, as returned by getBoundingClientRect. */
export type Rect = { left: number; top: number; width: number; height: number }

export type Counter = {
  id: string
  color: CounterColor
  label: string
  pos: Vec
}

export type PenDrawing = {
  id: string
  kind: 'pen'
  color: string
  points: Vec[]
}

export type ArrowDrawing = {
  id: string
  kind: 'arrow'
  color: string
  style: 'run' | 'pass'
  from: Vec
  to: Vec
}

export type Drawing = PenDrawing | ArrowDrawing

export type Ball = {
  pos: Vec
  /** Counter id when a player has the ball, null when it is free on the grass. */
  attachedTo: string | null
}

/**
 * One moment of the drill. v1 always has exactly one frame; record and
 * playback will append frames without any schema change.
 */
export type Frame = {
  counters: Counter[]
  ball: Ball
}

export type Pattern = {
  id: string
  name: string
  version: 1
  pitch: { type: PitchType; rotated: boolean }
  drawings: Drawing[]
  frames: Frame[]
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 5: Write the failing geometry test**

Create `tests/geometry.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PITCH_W,
  PITCH_H,
  COUNTER_COLORS,
  viewBoxOf,
  toView,
  fromView,
} from '../src/geometry'

describe('pitch dimensions', () => {
  it('is 100 units wide', () => {
    expect(PITCH_W).toBe(100)
  })

  it('preserves the 105x68 pitch aspect ratio at uniform scale', () => {
    expect(PITCH_H).toBeCloseTo(68 * (100 / 105), 2)
  })
})

describe('COUNTER_COLORS', () => {
  it('has exactly five colours', () => {
    expect(COUNTER_COLORS).toHaveLength(5)
  })

  it('contains the agreed colours', () => {
    expect([...COUNTER_COLORS]).toEqual(['red', 'blue', 'yellow', 'green', 'black'])
  })
})

describe('viewBoxOf', () => {
  it('is landscape when not rotated', () => {
    expect(viewBoxOf(false)).toBe(`0 0 ${PITCH_W} ${PITCH_H}`)
  })

  it('swaps the axes when rotated', () => {
    expect(viewBoxOf(true)).toBe(`0 0 ${PITCH_H} ${PITCH_W}`)
  })
})

describe('toView / fromView', () => {
  it('is the identity when not rotated', () => {
    const p = { x: 12, y: 34 }
    expect(toView(p, false)).toEqual(p)
    expect(fromView(p, false)).toEqual(p)
  })

  it('maps the pitch corners into the rotated view box', () => {
    // Top-left of the pitch lands at the top-right of a rotated board.
    expect(toView({ x: 0, y: 0 }, true)).toEqual({ x: PITCH_H, y: 0 })
    expect(toView({ x: PITCH_W, y: PITCH_H }, true)).toEqual({ x: 0, y: PITCH_W })
  })

  it('round-trips through the rotation', () => {
    const p = { x: 17, y: 41 }
    const back = fromView(toView(p, true), true)
    expect(back.x).toBeCloseTo(p.x, 10)
    expect(back.y).toBeCloseTo(p.y, 10)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npm install
npm test
```

Expected: FAIL — `Failed to resolve import "../src/geometry"`.

- [ ] **Step 7: Implement the geometry constants and rotation**

Create `src/geometry.ts`:

```ts
import type { CounterColor, Vec } from './types'

/**
 * A real pitch is 105m x 68m. We normalise the long side to 100 units and
 * apply the SAME scale to both axes, so circles stay circular.
 */
const PITCH_SCALE = 100 / 105

export const PITCH_W = 100
export const PITCH_H = Number((68 * PITCH_SCALE).toFixed(2)) // 64.76

export const COUNTER_COLORS = ['red', 'blue', 'yellow', 'green', 'black'] as const satisfies readonly CounterColor[]

/** Metres to pitch units. Used by the markings component. */
export function m(metres: number): number {
  return metres * PITCH_SCALE
}

export function viewBoxOf(rotated: boolean): string {
  return rotated ? `0 0 ${PITCH_H} ${PITCH_W}` : `0 0 ${PITCH_W} ${PITCH_H}`
}

/**
 * Pitch coordinates to view-box coordinates.
 * A rotated board is the pitch turned 90 degrees clockwise, which is the SVG
 * transform `translate(PITCH_H 0) rotate(90)`.
 */
export function toView(p: Vec, rotated: boolean): Vec {
  return rotated ? { x: PITCH_H - p.y, y: p.x } : { x: p.x, y: p.y }
}

/** The inverse of toView. */
export function fromView(p: Vec, rotated: boolean): Vec {
  return rotated ? { x: p.y, y: PITCH_H - p.x } : { x: p.x, y: p.y }
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS, 8 tests.

- [ ] **Step 9: Verify the app builds and boots**

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vue app with pitch geometry primitives"
```

---

## Task 2: Screen-to-pitch coordinate conversion

**Files:**
- Modify: `src/geometry.ts`
- Test: `tests/geometry.spec.ts`

**Interfaces:**
- Consumes: `PITCH_W`, `PITCH_H`, `fromView`, `toView` from Task 1; `Vec`, `Rect` from `src/types.ts`.
- Produces: `clientToPitch(rect: Rect, clientX: number, clientY: number, rotated: boolean): Vec`, `clampToPitch(p: Vec): Vec`, `distance(a: Vec, b: Vec): number`.

**Why this is its own task:** This is the conversion every drag depends on. It is pure maths over a plain rectangle — no `getScreenCTM`, no `DOMPoint` — precisely so it can be exhaustively tested in jsdom, which implements neither.

- [ ] **Step 1: Write the failing test**

Append to `tests/geometry.spec.ts`:

```ts
import { clientToPitch, clampToPitch, distance } from '../src/geometry'

describe('clientToPitch', () => {
  // An 800x600 element. The 100 x 64.76 view box fits by WIDTH:
  // scale = 800/100 = 8, rendered height = 64.76*8 = 518.1, so there is
  // (600 - 518.1)/2 = 40.95 of letterboxing above and below.
  const rect = { left: 0, top: 0, width: 800, height: 600 }

  it('maps the centre of the element to the centre of the pitch', () => {
    const p = clientToPitch(rect, 400, 300, false)
    expect(p.x).toBeCloseTo(PITCH_W / 2, 6)
    expect(p.y).toBeCloseTo(PITCH_H / 2, 6)
  })

  it('maps the top-left of the rendered pitch to the pitch origin', () => {
    const letterbox = (600 - PITCH_H * 8) / 2
    const p = clientToPitch(rect, 0, letterbox, false)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
  })

  it('accounts for the element being offset in the page', () => {
    const offset = { left: 120, top: 45, width: 800, height: 600 }
    const p = clientToPitch(offset, 120 + 400, 45 + 300, false)
    expect(p.x).toBeCloseTo(PITCH_W / 2, 6)
    expect(p.y).toBeCloseTo(PITCH_H / 2, 6)
  })

  it('maps the centre correctly when rotated', () => {
    const p = clientToPitch({ left: 0, top: 0, width: 600, height: 800 }, 300, 400, true)
    expect(p.x).toBeCloseTo(PITCH_W / 2, 6)
    expect(p.y).toBeCloseTo(PITCH_H / 2, 6)
  })

  it('puts the pitch origin at the top-RIGHT of a rotated board', () => {
    // Rotated view box is 64.76 wide x 100 tall in a 600x800 box:
    // scale = min(600/64.76, 800/100) = min(9.265, 8) = 8.
    const scale = 8
    const renderedW = PITCH_H * scale
    const offX = (600 - renderedW) / 2
    const p = clientToPitch({ left: 0, top: 0, width: 600, height: 800 }, offX + renderedW, 0, true)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
  })

  it('round-trips an arbitrary pitch position back to itself', () => {
    const original = { x: 73.5, y: 12.25 }
    const view = toView(original, false)
    const scale = 8
    const offY = (600 - PITCH_H * scale) / 2
    const p = clientToPitch(rect, view.x * scale, offY + view.y * scale, false)
    expect(p.x).toBeCloseTo(original.x, 6)
    expect(p.y).toBeCloseTo(original.y, 6)
  })
})

describe('clampToPitch', () => {
  it('leaves an in-bounds point alone', () => {
    expect(clampToPitch({ x: 50, y: 30 })).toEqual({ x: 50, y: 30 })
  })

  it('pulls an out-of-bounds point back onto the pitch', () => {
    expect(clampToPitch({ x: -20, y: 999 })).toEqual({ x: 0, y: PITCH_H })
  })
})

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `clientToPitch is not a function` (or an import resolution error naming `clientToPitch`).

- [ ] **Step 3: Implement the conversion**

Append to `src/geometry.ts`:

```ts
import type { Rect } from './types'

/**
 * Convert a pointer event's client coordinates into pitch units.
 *
 * The SVG uses the default preserveAspectRatio ("xMidYMid meet"), so the
 * view box is scaled by the smaller of the two axis ratios and centred,
 * leaving letterboxing on the other axis. We reproduce that here rather
 * than using getScreenCTM so the function stays pure and testable.
 */
export function clientToPitch(rect: Rect, clientX: number, clientY: number, rotated: boolean): Vec {
  const vw = rotated ? PITCH_H : PITCH_W
  const vh = rotated ? PITCH_W : PITCH_H

  const scale = Math.min(rect.width / vw, rect.height / vh)
  const offsetX = (rect.width - vw * scale) / 2
  const offsetY = (rect.height - vh * scale) / 2

  const viewX = (clientX - rect.left - offsetX) / scale
  const viewY = (clientY - rect.top - offsetY) / scale

  return fromView({ x: viewX, y: viewY }, rotated)
}

export function clampToPitch(p: Vec): Vec {
  return {
    x: Math.min(PITCH_W, Math.max(0, p.x)),
    y: Math.min(PITCH_H, Math.max(0, p.y)),
  }
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
```

Move the `import type { Rect }` line up to join the existing type import at the top of the file rather than leaving two import statements.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS, all geometry tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: convert pointer coordinates to pitch units"
```

---

## Task 3: Board state singleton with undo and redo

**Files:**
- Create: `src/composables/useBoard.ts`
- Test: `tests/useBoard.spec.ts`

**Interfaces:**
- Consumes: types from Task 1; `PITCH_W`, `PITCH_H` from Task 2's module.
- Produces: `useBoard(): BoardApi` where `BoardApi` includes reactive `state: BoardState`, `commit(): void`, `undo(): void`, `redo(): void`, `canUndo: ComputedRef<boolean>`, `canRedo: ComputedRef<boolean>`, `resetBoard(): void`, `setPitchType(t: PitchType): void`, `setRotated(r: boolean): void`, `toggleRotated(): void`, `loadSnapshot(s: BoardSnapshot): void`, `snapshot(): BoardSnapshot`, `newId(): string`. Also exports `type BoardState` and `type BoardSnapshot` and `UNDO_LIMIT: number`, and a test-only `__resetBoardForTests(): void`.

**Design note for the implementer:** `useBoard` returns the *same* object every call — it is a singleton, not a factory. Components share one board. Tests must reset it between cases, which is what `__resetBoardForTests` is for.

- [ ] **Step 1: Write the failing test**

Create `tests/useBoard.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, UNDO_LIMIT } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('useBoard singleton', () => {
  it('returns the same board to every caller', () => {
    expect(useBoard()).toBe(useBoard())
  })

  it('starts empty, on a blank landscape pitch', () => {
    const { state } = useBoard()
    expect(state.counters).toEqual([])
    expect(state.drawings).toEqual([])
    expect(state.ball.attachedTo).toBeNull()
    expect(state.pitch).toEqual({ type: 'blank', rotated: false })
  })

  it('mints unique ids', () => {
    const { newId } = useBoard()
    const ids = new Set([newId(), newId(), newId()])
    expect(ids.size).toBe(3)
  })
})

describe('pitch settings', () => {
  it('changes the pitch type', () => {
    const board = useBoard()
    board.setPitchType('full')
    expect(board.state.pitch.type).toBe('full')
  })

  it('toggles rotation', () => {
    const board = useBoard()
    board.toggleRotated()
    expect(board.state.pitch.rotated).toBe(true)
    board.toggleRotated()
    expect(board.state.pitch.rotated).toBe(false)
  })

  it('is undoable', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.undo()
    expect(board.state.pitch.type).toBe('blank')
  })
})

describe('undo and redo', () => {
  it('reports nothing to undo on a fresh board', () => {
    const board = useBoard()
    expect(board.canUndo.value).toBe(false)
    expect(board.canRedo.value).toBe(false)
  })

  it('restores the previous state', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.setPitchType('half')
    board.undo()
    expect(board.state.pitch.type).toBe('full')
    board.undo()
    expect(board.state.pitch.type).toBe('blank')
  })

  it('redoes what was undone', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.undo()
    board.redo()
    expect(board.state.pitch.type).toBe('full')
  })

  it('clears the redo stack when new work is committed', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.undo()
    board.setPitchType('half')
    expect(board.canRedo.value).toBe(false)
    board.redo()
    expect(board.state.pitch.type).toBe('half')
  })

  it('does nothing when there is nothing to undo', () => {
    const board = useBoard()
    expect(() => board.undo()).not.toThrow()
    expect(board.state.pitch.type).toBe('blank')
  })

  it('caps the undo stack', () => {
    const board = useBoard()
    for (let i = 0; i < UNDO_LIMIT + 20; i++) {
      board.setPitchType(i % 2 === 0 ? 'full' : 'half')
    }
    let undone = 0
    while (board.canUndo.value) {
      board.undo()
      undone++
      if (undone > UNDO_LIMIT + 50) break
    }
    expect(undone).toBe(UNDO_LIMIT)
  })

  it('snapshots are deep copies, not references into live state', () => {
    const board = useBoard()
    const snap = board.snapshot()
    board.setPitchType('full')
    expect(snap.pitch.type).toBe('blank')
  })
})

describe('loadSnapshot', () => {
  it('replaces the whole board', () => {
    const board = useBoard()
    board.loadSnapshot({
      counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
      ball: { pos: { x: 5, y: 5 }, attachedTo: null },
      drawings: [],
      pitch: { type: 'full', rotated: true },
    })
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.pitch.rotated).toBe(true)
  })

  it('does not share references with the snapshot it was given', () => {
    const board = useBoard()
    const snap = {
      counters: [{ id: 'a', color: 'red' as const, label: '1', pos: { x: 10, y: 10 } }],
      ball: { pos: { x: 5, y: 5 }, attachedTo: null },
      drawings: [],
      pitch: { type: 'full' as const, rotated: false },
    }
    board.loadSnapshot(snap)
    board.state.counters[0].pos.x = 99
    expect(snap.counters[0].pos.x).toBe(10)
  })
})

describe('resetBoard', () => {
  it('clears the board and is undoable', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.resetBoard()
    expect(board.state.pitch.type).toBe('blank')
    board.undo()
    expect(board.state.pitch.type).toBe('full')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/useBoard.spec.ts
```

Expected: FAIL — cannot resolve `../src/composables/useBoard`.

- [ ] **Step 3: Implement the board**

Create `src/composables/useBoard.ts`:

```ts
import { computed, reactive, ref } from 'vue'
import type { Ball, Counter, Drawing, PitchType } from '../types'
import { PITCH_H, PITCH_W } from '../geometry'

export const UNDO_LIMIT = 50

export type BoardState = {
  counters: Counter[]
  ball: Ball
  drawings: Drawing[]
  pitch: { type: PitchType; rotated: boolean }
}

/** A plain, disconnected copy of the board. */
export type BoardSnapshot = BoardState

function emptyState(): BoardState {
  return {
    counters: [],
    ball: { pos: { x: PITCH_W / 2, y: PITCH_H / 2 }, attachedTo: null },
    drawings: [],
    pitch: { type: 'blank', rotated: false },
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

const state = reactive<BoardState>(emptyState())
const undoStack = ref<BoardSnapshot[]>([])
const redoStack = ref<BoardSnapshot[]>([])

let idCounter = 0

/** A plain copy of the current state, safe to keep. */
function snapshot(): BoardSnapshot {
  return clone({
    counters: state.counters,
    ball: state.ball,
    drawings: state.drawings,
    pitch: state.pitch,
  }) as BoardSnapshot
}

function apply(snap: BoardSnapshot): void {
  const copy = clone(snap)
  state.counters = copy.counters
  state.ball = copy.ball
  state.drawings = copy.drawings
  state.pitch = copy.pitch
}

/**
 * Record the state as it was BEFORE the caller's mutation.
 *
 * Call this immediately before mutating. Everything that changes the board
 * goes through here — that is what makes undo correct by construction.
 */
function commit(): void {
  undoStack.value.push(snapshot())
  if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
  redoStack.value = []
}

function undo(): void {
  const previous = undoStack.value.pop()
  if (!previous) return
  redoStack.value.push(snapshot())
  apply(previous)
}

function redo(): void {
  const next = redoStack.value.pop()
  if (!next) return
  undoStack.value.push(snapshot())
  apply(next)
}

function newId(): string {
  idCounter += 1
  return `o${idCounter}`
}

function setPitchType(type: PitchType): void {
  commit()
  state.pitch.type = type
}

function setRotated(rotated: boolean): void {
  commit()
  state.pitch.rotated = rotated
}

function toggleRotated(): void {
  setRotated(!state.pitch.rotated)
}

function resetBoard(): void {
  commit()
  apply(emptyState())
}

function loadSnapshot(snap: BoardSnapshot): void {
  commit()
  apply(snap)
}

const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

const board = {
  state,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
  snapshot,
  loadSnapshot,
  resetBoard,
  setPitchType,
  setRotated,
  toggleRotated,
  newId,
}

export function useBoard() {
  return board
}

/** Test-only: put the singleton back to its just-loaded condition. */
export function __resetBoardForTests(): void {
  apply(emptyState())
  undoStack.value = []
  redoStack.value = []
  idCounter = 0
}
```

Note the ordering rule that makes this work: `commit()` saves the state *before* the change, so `undo()` restores it. Every mutation function below (in later tasks) calls `commit()` on its first line.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test tests/useBoard.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add board state singleton with snapshot undo"
```

---

## Task 4: Counters — add, move, label, delete

**Files:**
- Modify: `src/composables/useBoard.ts`
- Test: `tests/useBoard.counters.spec.ts`

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: added to the board object — `addCounter(color: CounterColor): Counter`, `moveCounter(id: string, pos: Vec): void`, `setCounterLabel(id: string, label: string): void`, `deleteCounter(id: string): void`, `counterById(id: string): Counter | undefined`, `nextLabelFor(color: CounterColor): string`.

**Behaviour that is easy to get wrong:** `moveCounter` must NOT call `commit()` — a drag calls it on every pointer-move and would flood the undo stack. `PitchBoard` calls `commit()` once on pointer-down, before the drag starts. This is stated in the test.

- [ ] **Step 1: Write the failing test**

Create `tests/useBoard.counters.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { PITCH_H, PITCH_W } from '../src/geometry'

beforeEach(() => __resetBoardForTests())

describe('addCounter', () => {
  it('drops the counter at the centre of the pitch', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    expect(c.pos).toEqual({ x: PITCH_W / 2, y: PITCH_H / 2 })
  })

  it('adds it to state with the requested colour', () => {
    const board = useBoard()
    board.addCounter('blue')
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].color).toBe('blue')
  })

  it('numbers counters from 1 within each colour independently', () => {
    const board = useBoard()
    expect(board.addCounter('red').label).toBe('1')
    expect(board.addCounter('red').label).toBe('2')
    expect(board.addCounter('blue').label).toBe('1')
    expect(board.addCounter('red').label).toBe('3')
  })

  it('is undoable', () => {
    const board = useBoard()
    board.addCounter('red')
    board.undo()
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('label numbering after deletion', () => {
  it('leaves a gap rather than renumbering surviving counters', () => {
    const board = useBoard()
    const one = board.addCounter('red')
    const two = board.addCounter('red')
    const three = board.addCounter('red')
    board.deleteCounter(two.id)
    expect(board.counterById(one.id)!.label).toBe('1')
    expect(board.counterById(three.id)!.label).toBe('3')
  })

  it('gives the next new counter a label above the highest in use', () => {
    const board = useBoard()
    board.addCounter('red')
    const two = board.addCounter('red')
    board.deleteCounter(two.id)
    // Highest surviving red label is 1, so the next is 2 — reusing the gap.
    expect(board.addCounter('red').label).toBe('2')
  })

  it('is not confused by a hand-edited non-numeric label', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, 'GK')
    expect(board.addCounter('red').label).toBe('1')
  })
})

describe('moveCounter', () => {
  it('moves the counter', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 10, y: 20 })
    expect(board.counterById(c.id)!.pos).toEqual({ x: 10, y: 20 })
  })

  it('clamps the counter to the pitch', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: -50, y: 5000 })
    expect(board.counterById(c.id)!.pos).toEqual({ x: 0, y: PITCH_H })
  })

  it('does NOT push an undo entry, because a drag calls it repeatedly', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 10, y: 10 })
    board.moveCounter(c.id, { x: 11, y: 11 })
    board.moveCounter(c.id, { x: 12, y: 12 })
    board.undo() // undoes the add, not any of the moves
    expect(board.state.counters).toHaveLength(0)
  })

  it('ignores an unknown id', () => {
    const board = useBoard()
    expect(() => board.moveCounter('nope', { x: 1, y: 1 })).not.toThrow()
  })
})

describe('setCounterLabel', () => {
  it('sets the label and is undoable', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, 'Sam')
    expect(board.counterById(c.id)!.label).toBe('Sam')
    board.undo()
    expect(board.counterById(c.id)!.label).toBe('1')
  })

  it('trims whitespace and caps the length at 4 characters', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, '   Rodriguez   ')
    expect(board.counterById(c.id)!.label).toBe('Rodr')
  })
})

describe('deleteCounter', () => {
  it('removes the counter and is undoable', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.deleteCounter(c.id)
    expect(board.state.counters).toHaveLength(0)
    board.undo()
    expect(board.state.counters).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/useBoard.counters.spec.ts
```

Expected: FAIL — `board.addCounter is not a function`.

- [ ] **Step 3: Implement counter operations**

In `src/composables/useBoard.ts`, add these functions above the `const board = {` declaration:

```ts
function counterById(id: string): Counter | undefined {
  return state.counters.find((c) => c.id === id)
}

/**
 * The lowest positive integer not currently used as a label by this colour.
 * Deleting a counter therefore frees its number for reuse, while surviving
 * counters keep the labels the coach has been calling them by.
 */
function nextLabelFor(color: CounterColor): string {
  const used = new Set(
    state.counters
      .filter((c) => c.color === color)
      .map((c) => Number(c.label))
      .filter((n) => Number.isInteger(n) && n > 0),
  )
  let n = 1
  while (used.has(n)) n += 1
  return String(n)
}

function addCounter(color: CounterColor): Counter {
  commit()
  const counter: Counter = {
    id: newId(),
    color,
    label: nextLabelFor(color),
    pos: { x: PITCH_W / 2, y: PITCH_H / 2 },
  }
  state.counters.push(counter)
  return counter
}

/** Called on every pointer-move of a drag, so it deliberately does not commit. */
function moveCounter(id: string, pos: Vec): void {
  const counter = counterById(id)
  if (!counter) return
  counter.pos = clampToPitch(pos)
}

function setCounterLabel(id: string, label: string): void {
  const counter = counterById(id)
  if (!counter) return
  commit()
  counter.label = label.trim().slice(0, 4)
}

function deleteCounter(id: string): void {
  const index = state.counters.findIndex((c) => c.id === id)
  if (index === -1) return
  commit()
  state.counters.splice(index, 1)
}
```

Extend the imports at the top of the file:

```ts
import type { Ball, Counter, CounterColor, Drawing, PitchType, Vec } from '../types'
import { PITCH_H, PITCH_W, clampToPitch } from '../geometry'
```

Add the new functions to the exported `board` object: `addCounter`, `moveCounter`, `setCounterLabel`, `deleteCounter`, `counterById`, `nextLabelFor`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add, move, label and delete counters"
```

---

## Task 5: Ball placement, possession, and snapping

**Files:**
- Modify: `src/composables/useBoard.ts`
- Test: `tests/useBoard.ball.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 3 and 4.
- Produces: added to the board object — `moveBall(pos: Vec): void`, `dropBall(pos: Vec): void`, `ballPosition(): Vec`, `SNAP_RADIUS: number` (exported as a module constant), `BALL_OFFSET: Vec` (exported constant).

**Behaviour:** `moveBall` is the drag-time call and does not commit. `dropBall` is the pointer-up call: it resolves snapping and does not commit either — `PitchBoard` commits on pointer-down. `deleteCounter` must be amended so that deleting the counter holding the ball leaves the ball free at that counter's last position.

- [ ] **Step 1: Write the failing test**

Create `tests/useBoard.ball.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, SNAP_RADIUS, BALL_OFFSET } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('dropBall', () => {
  it('leaves the ball free when it lands on empty grass', () => {
    const board = useBoard()
    board.addCounter('red')
    board.moveCounter(board.state.counters[0].id, { x: 10, y: 10 })
    board.dropBall({ x: 80, y: 40 })
    expect(board.state.ball.attachedTo).toBeNull()
    expect(board.state.ball.pos).toEqual({ x: 80, y: 40 })
  })

  it('attaches the ball to a counter dropped within the snap radius', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30 + SNAP_RADIUS * 0.5, y: 30 })
    expect(board.state.ball.attachedTo).toBe(c.id)
  })

  it('does not attach to a counter just outside the snap radius', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30 + SNAP_RADIUS * 1.5, y: 30 })
    expect(board.state.ball.attachedTo).toBeNull()
  })

  it('attaches to the NEAREST counter when two are in range', () => {
    const board = useBoard()
    const near = board.addCounter('red')
    const far = board.addCounter('blue')
    board.moveCounter(near.id, { x: 30, y: 30 })
    board.moveCounter(far.id, { x: 30 + SNAP_RADIUS * 0.9, y: 30 })
    board.dropBall({ x: 30.1, y: 30 })
    expect(board.state.ball.attachedTo).toBe(near.id)
  })

  it('detaches when dragged off a player onto empty grass', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    expect(board.state.ball.attachedTo).toBe(c.id)
    board.dropBall({ x: 90, y: 10 })
    expect(board.state.ball.attachedTo).toBeNull()
  })
})

describe('ballPosition', () => {
  it('is the stored position when the ball is free', () => {
    const board = useBoard()
    board.dropBall({ x: 12, y: 34 })
    expect(board.ballPosition()).toEqual({ x: 12, y: 34 })
  })

  it('rides at a fixed offset from the counter holding it', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    expect(board.ballPosition()).toEqual({ x: 30 + BALL_OFFSET.x, y: 30 + BALL_OFFSET.y })
  })

  it('follows the counter when the counter moves', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    board.moveCounter(c.id, { x: 70, y: 20 })
    expect(board.ballPosition()).toEqual({ x: 70 + BALL_OFFSET.x, y: 20 + BALL_OFFSET.y })
  })

  it('falls back to the free position if the holder vanishes', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    board.state.ball.attachedTo = 'ghost'
    expect(() => board.ballPosition()).not.toThrow()
  })
})

describe('deleting the counter that holds the ball', () => {
  it('frees the ball at that counter last position', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 44, y: 22 })
    board.dropBall({ x: 44, y: 22 })
    board.deleteCounter(c.id)
    expect(board.state.ball.attachedTo).toBeNull()
    expect(board.state.ball.pos).toEqual({ x: 44, y: 22 })
  })
})

describe('moveBall', () => {
  it('detaches the ball as soon as a drag starts', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    board.moveBall({ x: 31, y: 31 })
    expect(board.state.ball.attachedTo).toBeNull()
  })

  it('clamps to the pitch', () => {
    const board = useBoard()
    board.moveBall({ x: -10, y: -10 })
    expect(board.state.ball.pos).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/useBoard.ball.spec.ts
```

Expected: FAIL — `SNAP_RADIUS` is not exported / `board.dropBall is not a function`.

- [ ] **Step 3: Implement ball behaviour**

In `src/composables/useBoard.ts`, add the constants near `UNDO_LIMIT`:

```ts
/** How close to a counter the ball must land to be taken into possession, in pitch units. */
export const SNAP_RADIUS = 3.5

/** Where an attached ball sits relative to its holder, in pitch units. */
export const BALL_OFFSET: Vec = { x: 1.8, y: 1.8 }
```

Add these functions above the `const board = {` declaration:

```ts
/** Drag-time move. Detaches from any holder; does not commit. */
function moveBall(pos: Vec): void {
  state.ball.attachedTo = null
  state.ball.pos = clampToPitch(pos)
}

/** Pointer-up. Resolves possession; does not commit. */
function dropBall(pos: Vec): void {
  const at = clampToPitch(pos)
  state.ball.pos = at

  let nearest: Counter | undefined
  let nearestDistance = Infinity
  for (const counter of state.counters) {
    const d = distance(at, counter.pos)
    if (d < nearestDistance) {
      nearestDistance = d
      nearest = counter
    }
  }

  state.ball.attachedTo = nearest && nearestDistance <= SNAP_RADIUS ? nearest.id : null
}

/** Where the ball should actually be drawn. */
function ballPosition(): Vec {
  if (state.ball.attachedTo) {
    const holder = counterById(state.ball.attachedTo)
    if (holder) {
      return { x: holder.pos.x + BALL_OFFSET.x, y: holder.pos.y + BALL_OFFSET.y }
    }
  }
  return state.ball.pos
}
```

Amend `deleteCounter` so the ball is not orphaned:

```ts
function deleteCounter(id: string): void {
  const index = state.counters.findIndex((c) => c.id === id)
  if (index === -1) return
  commit()
  if (state.ball.attachedTo === id) {
    state.ball.pos = { ...state.counters[index].pos }
    state.ball.attachedTo = null
  }
  state.counters.splice(index, 1)
}
```

Extend the geometry import to include `distance`, and add `moveBall`, `dropBall`, `ballPosition` to the exported `board` object.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ball placement with possession snapping"
```

---

## Task 6: Drawings — freehand pen, arrows, and erase

**Files:**
- Modify: `src/composables/useBoard.ts`
- Test: `tests/useBoard.drawings.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces: added to the board object — `startPen(at: Vec, color: string): string`, `extendPen(id: string, at: Vec): void`, `startArrow(at: Vec, color: string, style: 'run' | 'pass'): string`, `updateArrow(id: string, to: Vec): void`, `finishDrawing(id: string): void`, `deleteDrawing(id: string): void`, `clearDrawings(): void`, `drawingById(id: string): Drawing | undefined`. Also exports `MIN_PEN_STEP: number` and `MIN_ARROW_LENGTH: number`.

**Behaviour:** `startPen` and `startArrow` commit once, at the beginning of the stroke, so the whole stroke is a single undo entry. `finishDrawing` discards a degenerate stroke (a tap that produced a one-point path, or an arrow shorter than `MIN_ARROW_LENGTH`) so a stray tap does not litter the board with invisible objects — and it also pops the undo entry that `startPen`/`startArrow` pushed, so a discarded stroke leaves no trace in history.

- [ ] **Step 1: Write the failing test**

Create `tests/useBoard.drawings.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useBoard,
  __resetBoardForTests,
  MIN_PEN_STEP,
  MIN_ARROW_LENGTH,
} from '../src/composables/useBoard'
import type { ArrowDrawing, PenDrawing } from '../src/types'

beforeEach(() => __resetBoardForTests())

describe('pen', () => {
  it('creates a path starting at the press point', () => {
    const board = useBoard()
    const id = board.startPen({ x: 10, y: 10 }, '#fff')
    const pen = board.drawingById(id) as PenDrawing
    expect(pen.kind).toBe('pen')
    expect(pen.points).toEqual([{ x: 10, y: 10 }])
  })

  it('appends points as the pointer moves', () => {
    const board = useBoard()
    const id = board.startPen({ x: 10, y: 10 }, '#fff')
    board.extendPen(id, { x: 20, y: 10 })
    board.extendPen(id, { x: 30, y: 10 })
    board.finishDrawing(id)
    expect((board.drawingById(id) as PenDrawing).points).toHaveLength(3)
  })

  it('discards points closer together than MIN_PEN_STEP, to keep saves small', () => {
    const board = useBoard()
    const id = board.startPen({ x: 10, y: 10 }, '#fff')
    board.extendPen(id, { x: 10 + MIN_PEN_STEP * 0.1, y: 10 })
    board.extendPen(id, { x: 10 + MIN_PEN_STEP * 0.2, y: 10 })
    expect((board.drawingById(id) as PenDrawing).points).toHaveLength(1)
  })

  it('clamps points to the pitch', () => {
    const board = useBoard()
    const id = board.startPen({ x: 10, y: 10 }, '#fff')
    board.extendPen(id, { x: -500, y: 10 })
    const pen = board.drawingById(id) as PenDrawing
    expect(pen.points[1].x).toBe(0)
  })

  it('is a single undo entry for the whole stroke', () => {
    const board = useBoard()
    const id = board.startPen({ x: 10, y: 10 }, '#fff')
    board.extendPen(id, { x: 40, y: 10 })
    board.extendPen(id, { x: 70, y: 10 })
    board.finishDrawing(id)
    board.undo()
    expect(board.state.drawings).toHaveLength(0)
    expect(board.canUndo.value).toBe(false)
  })

  it('discards a single-point tap and leaves no undo entry behind', () => {
    const board = useBoard()
    const id = board.startPen({ x: 10, y: 10 }, '#fff')
    board.finishDrawing(id)
    expect(board.state.drawings).toHaveLength(0)
    expect(board.canUndo.value).toBe(false)
  })
})

describe('arrows', () => {
  it('creates a zero-length arrow at the press point', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow.kind).toBe('arrow')
    expect(arrow.style).toBe('run')
    expect(arrow.from).toEqual({ x: 10, y: 10 })
    expect(arrow.to).toEqual({ x: 10, y: 10 })
  })

  it('tracks the pointer to set the head', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'pass')
    board.updateArrow(id, { x: 40, y: 25 })
    board.finishDrawing(id)
    expect((board.drawingById(id) as ArrowDrawing).to).toEqual({ x: 40, y: 25 })
  })

  it('records the pass style', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'pass')
    board.updateArrow(id, { x: 60, y: 10 })
    board.finishDrawing(id)
    expect((board.drawingById(id) as ArrowDrawing).style).toBe('pass')
  })

  it('discards an arrow shorter than MIN_ARROW_LENGTH', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    board.updateArrow(id, { x: 10 + MIN_ARROW_LENGTH * 0.5, y: 10 })
    board.finishDrawing(id)
    expect(board.state.drawings).toHaveLength(0)
    expect(board.canUndo.value).toBe(false)
  })

  it('is a single undo entry', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    board.updateArrow(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    board.undo()
    expect(board.state.drawings).toHaveLength(0)
  })
})

describe('deleteDrawing', () => {
  it('removes a drawing and is undoable', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    board.updateArrow(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    board.deleteDrawing(id)
    expect(board.state.drawings).toHaveLength(0)
    board.undo()
    expect(board.state.drawings).toHaveLength(1)
  })
})

describe('clearDrawings', () => {
  it('removes every drawing but leaves counters alone, and is undoable', () => {
    const board = useBoard()
    board.addCounter('red')
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    board.updateArrow(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    board.clearDrawings()
    expect(board.state.drawings).toHaveLength(0)
    expect(board.state.counters).toHaveLength(1)
    board.undo()
    expect(board.state.drawings).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/useBoard.drawings.spec.ts
```

Expected: FAIL — `board.startPen is not a function`.

- [ ] **Step 3: Implement drawings**

In `src/composables/useBoard.ts`, add the constants near `UNDO_LIMIT`:

```ts
/** Minimum spacing between recorded freehand points, in pitch units. */
export const MIN_PEN_STEP = 0.6

/** Arrows shorter than this are treated as an accidental tap. */
export const MIN_ARROW_LENGTH = 2
```

Add these functions above the `const board = {` declaration:

```ts
function drawingById(id: string): Drawing | undefined {
  return state.drawings.find((d) => d.id === id)
}

function startPen(at: Vec, color: string): string {
  commit()
  const id = newId()
  state.drawings.push({ id, kind: 'pen', color, points: [clampToPitch(at)] })
  return id
}

/** Drag-time; does not commit. Skips points too close to the previous one. */
function extendPen(id: string, at: Vec): void {
  const drawing = drawingById(id)
  if (!drawing || drawing.kind !== 'pen') return
  const point = clampToPitch(at)
  const last = drawing.points[drawing.points.length - 1]
  if (last && distance(last, point) < MIN_PEN_STEP) return
  drawing.points.push(point)
}

function startArrow(at: Vec, color: string, style: 'run' | 'pass'): string {
  commit()
  const id = newId()
  const point = clampToPitch(at)
  state.drawings.push({ id, kind: 'arrow', color, style, from: point, to: { ...point } })
  return id
}

/** Drag-time; does not commit. */
function updateArrow(id: string, to: Vec): void {
  const drawing = drawingById(id)
  if (!drawing || drawing.kind !== 'arrow') return
  drawing.to = clampToPitch(to)
}

/**
 * End a stroke. A stroke too small to be intentional is removed, and the
 * undo entry its start pushed is popped, so a stray tap leaves no trace.
 */
function finishDrawing(id: string): void {
  const drawing = drawingById(id)
  if (!drawing) return

  const degenerate =
    drawing.kind === 'pen'
      ? drawing.points.length < 2
      : distance(drawing.from, drawing.to) < MIN_ARROW_LENGTH

  if (!degenerate) return

  state.drawings = state.drawings.filter((d) => d.id !== id)
  undoStack.value.pop()
}

function deleteDrawing(id: string): void {
  const index = state.drawings.findIndex((d) => d.id === id)
  if (index === -1) return
  commit()
  state.drawings.splice(index, 1)
}

function clearDrawings(): void {
  if (state.drawings.length === 0) return
  commit()
  state.drawings = []
}
```

Add `startPen`, `extendPen`, `startArrow`, `updateArrow`, `finishDrawing`, `deleteDrawing`, `clearDrawings`, `drawingById` to the exported `board` object.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: freehand pen and run/pass arrows"
```

---

## Task 7: Pattern storage, autosave, and import

**Files:**
- Create: `src/composables/useStorage.ts`
- Test: `tests/useStorage.spec.ts`

**Interfaces:**
- Consumes: `Pattern`, `Frame` types from Task 1; `BoardSnapshot` from Task 3.
- Produces: `PATTERNS_KEY: string`, `DRAFT_KEY: string`, `useStorage(): StorageApi` with `listPatterns(): Pattern[]`, `savePattern(name: string, snap: BoardSnapshot, id?: string): Pattern`, `deletePattern(id: string): void`, `renamePattern(id: string, name: string): void`, `patternToSnapshot(p: Pattern): BoardSnapshot`, `saveDraft(snap: BoardSnapshot): void`, `loadDraft(): BoardSnapshot | null`, `importPatterns(json: string): Pattern[]`, `exportPatternsJson(patterns: Pattern[]): string`, `lastError: Ref<string | null>`. Also exports `parsePattern(value: unknown): Pattern` which throws on invalid input.

**Behaviour that matters:** corrupt storage never throws out of `listPatterns`; a bad import is rejected whole; an id collision on import produces a NEW id and a suffixed name so nothing is overwritten; a quota error surfaces in `lastError` without losing in-memory state.

- [ ] **Step 1: Write the failing test**

Create `tests/useStorage.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  useStorage,
  PATTERNS_KEY,
  DRAFT_KEY,
  parsePattern,
} from '../src/composables/useStorage'
import type { BoardSnapshot } from '../src/composables/useBoard'

function snap(): BoardSnapshot {
  return {
    counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    ball: { pos: { x: 5, y: 5 }, attachedTo: null },
    drawings: [],
    pitch: { type: 'full', rotated: false },
  }
}

beforeEach(() => {
  localStorage.clear()
  useStorage().lastError.value = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('savePattern and listPatterns', () => {
  it('round-trips a pattern', () => {
    const store = useStorage()
    const saved = store.savePattern('Press trigger', snap())
    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Press trigger')
    expect(listed[0].frames[0].counters[0].pos).toEqual({ x: 10, y: 10 })
    expect(listed[0].id).toBe(saved.id)
  })

  it('wraps the snapshot in a single frame', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    expect(saved.frames).toHaveLength(1)
    expect(saved.version).toBe(1)
  })

  it('keeps drawings at the pattern level, not inside the frame', () => {
    const store = useStorage()
    const withDrawing: BoardSnapshot = {
      ...snap(),
      drawings: [{ id: 'd1', kind: 'arrow', color: '#fff', style: 'run', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } }],
    }
    const saved = store.savePattern('Drill', withDrawing)
    expect(saved.drawings).toHaveLength(1)
    expect(saved.frames[0]).not.toHaveProperty('drawings')
  })

  it('updates in place when given an existing id', () => {
    const store = useStorage()
    const first = store.savePattern('Drill', snap())
    store.savePattern('Drill', snap(), first.id)
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('advances updatedAt but keeps createdAt when updating', () => {
    const store = useStorage()
    const first = store.savePattern('Drill', snap())
    const again = store.savePattern('Drill', snap(), first.id)
    expect(again.createdAt).toBe(first.createdAt)
  })
})

describe('patternToSnapshot', () => {
  it('unwraps the first frame back into a board snapshot', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const restored = store.patternToSnapshot(saved)
    expect(restored.counters[0].pos).toEqual({ x: 10, y: 10 })
    expect(restored.pitch.type).toBe('full')
  })
})

describe('deletePattern and renamePattern', () => {
  it('deletes', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    store.deletePattern(saved.id)
    expect(store.listPatterns()).toHaveLength(0)
  })

  it('renames', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    store.renamePattern(saved.id, 'Better name')
    expect(store.listPatterns()[0].name).toBe('Better name')
  })
})

describe('corrupt storage', () => {
  it('returns an empty library instead of throwing', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    expect(store.listPatterns()).toEqual([])
  })

  it('reports the problem', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    const store = useStorage()
    store.listPatterns()
    expect(store.lastError.value).toMatch(/could not be read/i)
  })

  it('does NOT clear the bad data, so it stays recoverable by hand', () => {
    localStorage.setItem(PATTERNS_KEY, '{not json at all')
    useStorage().listPatterns()
    expect(localStorage.getItem(PATTERNS_KEY)).toBe('{not json at all')
  })

  it('drops individual malformed entries but keeps the valid ones', () => {
    const store = useStorage()
    const good = store.savePattern('Good', snap())
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw.push({ id: 'junk', name: 'Bad' })
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))
    const listed = store.listPatterns()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(good.id)
  })
})

describe('parsePattern', () => {
  it('rejects an unknown schema version', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const future = { ...saved, version: 2 }
    expect(() => parsePattern(future)).toThrow(/version 2/i)
  })

  it('rejects a pattern with no frames', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    expect(() => parsePattern({ ...saved, frames: [] })).toThrow()
  })

  it('rejects a non-object', () => {
    expect(() => parsePattern('nope')).toThrow()
  })
})

describe('quota exceeded', () => {
  it('reports the error without throwing', () => {
    const store = useStorage()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const error = new Error('quota') as Error & { name: string }
      error.name = 'QuotaExceededError'
      throw error
    })
    expect(() => store.savePattern('Drill', snap())).not.toThrow()
    expect(store.lastError.value).toMatch(/out of space/i)
  })
})

describe('draft autosave', () => {
  it('round-trips the working board', () => {
    const store = useStorage()
    store.saveDraft(snap())
    expect(store.loadDraft()!.counters[0].id).toBe('a')
  })

  it('returns null when there is no draft', () => {
    expect(useStorage().loadDraft()).toBeNull()
  })

  it('returns null rather than throwing on a corrupt draft', () => {
    localStorage.setItem(DRAFT_KEY, 'garbage')
    expect(useStorage().loadDraft()).toBeNull()
  })
})

describe('import and export', () => {
  it('imports patterns from exported JSON', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportPatternsJson([saved])
    localStorage.clear()
    const imported = store.importPatterns(json)
    expect(imported).toHaveLength(1)
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('never overwrites an existing pattern on an id collision', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const json = store.exportPatternsJson([saved])
    const imported = store.importPatterns(json)
    expect(store.listPatterns()).toHaveLength(2)
    expect(imported[0].id).not.toBe(saved.id)
    expect(imported[0].name).toBe('Drill (imported)')
  })

  it('rejects a malformed file whole, importing nothing', () => {
    const store = useStorage()
    store.savePattern('Existing', snap())
    expect(() => store.importPatterns('[[[')).toThrow()
    expect(store.listPatterns()).toHaveLength(1)
  })

  it('rejects the file if ANY pattern in it is invalid', () => {
    const store = useStorage()
    const saved = store.savePattern('Drill', snap())
    const bad = JSON.stringify([saved, { id: 'x', name: 'broken' }])
    expect(() => store.importPatterns(bad)).toThrow()
    expect(store.listPatterns()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/useStorage.spec.ts
```

Expected: FAIL — cannot resolve `../src/composables/useStorage`.

- [ ] **Step 3: Implement storage**

Create `src/composables/useStorage.ts`:

```ts
import { ref } from 'vue'
import type { Pattern } from '../types'
import type { BoardSnapshot } from './useBoard'

export const PATTERNS_KEY = 'fct.patterns.v1'
export const DRAFT_KEY = 'fct.draft.v1'

const SCHEMA_VERSION = 1

const lastError = ref<string | null>(null)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate an untrusted value as a Pattern. Throws with a readable reason. */
export function parsePattern(value: unknown): Pattern {
  if (!isObject(value)) throw new Error('That is not a saved pattern.')

  if (value.version !== SCHEMA_VERSION) {
    throw new Error(
      `This pattern was saved by a newer version of the app (version ${String(value.version)}). Update the app to open it.`,
    )
  }

  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('That pattern is missing its name or id.')
  }

  if (!isObject(value.pitch) || typeof value.pitch.type !== 'string') {
    throw new Error('That pattern is missing its pitch settings.')
  }

  if (!Array.isArray(value.drawings)) throw new Error('That pattern is missing its drawings.')

  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error('That pattern has no frames.')
  }

  for (const frame of value.frames) {
    if (!isObject(frame) || !Array.isArray(frame.counters) || !isObject(frame.ball)) {
      throw new Error('That pattern has a damaged frame.')
    }
  }

  return value as unknown as Pattern
}

function readRaw(key: string): unknown {
  const text = localStorage.getItem(key)
  if (text === null) return null
  return JSON.parse(text)
}

function writeRaw(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    lastError.value =
      name === 'QuotaExceededError'
        ? 'The browser is out of space. Export some patterns to a file and delete them to free room.'
        : 'That could not be saved to this browser.'
    return false
  }
}

function listPatterns(): Pattern[] {
  let raw: unknown
  try {
    raw = readRaw(PATTERNS_KEY)
  } catch {
    lastError.value =
      'Your saved patterns could not be read. The stored data has been left untouched so it can be recovered.'
    return []
  }

  if (raw === null) return []
  if (!Array.isArray(raw)) {
    lastError.value = 'Your saved patterns could not be read.'
    return []
  }

  const patterns: Pattern[] = []
  let dropped = 0
  for (const entry of raw) {
    try {
      patterns.push(parsePattern(entry))
    } catch {
      dropped += 1
    }
  }
  if (dropped > 0) {
    lastError.value = `${dropped} damaged pattern(s) could not be read and were skipped.`
  }
  return patterns
}

function writePatterns(patterns: Pattern[]): boolean {
  return writeRaw(PATTERNS_KEY, patterns)
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function toPattern(name: string, snap: BoardSnapshot, id: string, createdAt: string): Pattern {
  const copy = structuredClone(snap)
  return {
    id,
    name,
    version: SCHEMA_VERSION,
    pitch: copy.pitch,
    drawings: copy.drawings,
    frames: [{ counters: copy.counters, ball: copy.ball }],
    createdAt,
    updatedAt: nowIso(),
  }
}

function savePattern(name: string, snap: BoardSnapshot, id?: string): Pattern {
  const patterns = listPatterns()
  const existing = id ? patterns.find((p) => p.id === id) : undefined
  const pattern = toPattern(name, snap, existing?.id ?? id ?? makeId(), existing?.createdAt ?? nowIso())

  const index = patterns.findIndex((p) => p.id === pattern.id)
  if (index === -1) patterns.push(pattern)
  else patterns[index] = pattern

  writePatterns(patterns)
  return pattern
}

function deletePattern(id: string): void {
  writePatterns(listPatterns().filter((p) => p.id !== id))
}

function renamePattern(id: string, name: string): void {
  const patterns = listPatterns()
  const pattern = patterns.find((p) => p.id === id)
  if (!pattern) return
  pattern.name = name
  pattern.updatedAt = nowIso()
  writePatterns(patterns)
}

function patternToSnapshot(pattern: Pattern): BoardSnapshot {
  const copy = structuredClone(pattern)
  const frame = copy.frames[0]
  return {
    counters: frame.counters,
    ball: frame.ball,
    drawings: copy.drawings,
    pitch: copy.pitch,
  }
}

function saveDraft(snap: BoardSnapshot): void {
  writeRaw(DRAFT_KEY, snap)
}

function loadDraft(): BoardSnapshot | null {
  try {
    const raw = readRaw(DRAFT_KEY)
    if (!isObject(raw) || !Array.isArray(raw.counters) || !isObject(raw.pitch)) return null
    return raw as unknown as BoardSnapshot
  } catch {
    return null
  }
}

function exportPatternsJson(patterns: Pattern[]): string {
  return JSON.stringify(patterns, null, 2)
}

/**
 * Validate an exported file whole, then merge. A pattern whose id already
 * exists is added under a NEW id with a suffixed name, so importing can
 * never silently overwrite the coach's existing work.
 */
function importPatterns(json: string): Pattern[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!Array.isArray(raw)) throw new Error('That file does not contain a list of patterns.')

  const incoming = raw.map((entry) => parsePattern(entry))

  const patterns = listPatterns()
  const existingIds = new Set(patterns.map((p) => p.id))

  const added = incoming.map((pattern) => {
    if (!existingIds.has(pattern.id)) return pattern
    return { ...pattern, id: makeId(), name: `${pattern.name} (imported)` }
  })

  writePatterns([...patterns, ...added])
  return added
}

const storage = {
  listPatterns,
  savePattern,
  deletePattern,
  renamePattern,
  patternToSnapshot,
  saveDraft,
  loadDraft,
  importPatterns,
  exportPatternsJson,
  lastError,
}

export function useStorage() {
  return storage
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: persist patterns to localStorage with import and recovery"
```

---

## Task 8: Pitch markings

**Files:**
- Create: `src/components/PitchMarkings.vue`
- Test: `tests/PitchMarkings.spec.ts`

**Interfaces:**
- Consumes: `PITCH_W`, `PITCH_H`, `m` from `src/geometry.ts`; `PitchType` from `src/types.ts`.
- Produces: a component taking one prop, `type: PitchType`, rendering SVG markings inside the pitch coordinate space. It holds no state and emits nothing.

**Geometry the implementer needs, in metres, converted with `m()`:** pitch 105×68; halfway line at x=52.5; centre circle r=9.15; penalty area 16.5 deep by 40.32 wide; six-yard box 5.5 deep by 18.32 wide; penalty spot 11 from the goal line; penalty arc r=9.15 centred on the spot; corner arcs r=1; goal 7.32 wide.

**Half pitch:** the left half of the full pitch is exactly 50 units wide at the same scale, so half-pitch markings are the full pitch's left-half elements translated 25 units right, leaving an equal margin either side. This is why switching pitch type never moves a counter.

- [ ] **Step 1: Write the failing test**

Create `tests/PitchMarkings.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PitchMarkings from '../src/components/PitchMarkings.vue'

function render(type: 'blank' | 'full' | 'half') {
  return mount(PitchMarkings, { props: { type } })
}

describe('blank pitch', () => {
  it('draws no markings', () => {
    const wrapper = render('blank')
    expect(wrapper.findAll('[data-marking]')).toHaveLength(0)
  })
})

describe('full pitch', () => {
  it('draws the halfway line', () => {
    expect(render('full').find('[data-marking="halfway"]').exists()).toBe(true)
  })

  it('draws the centre circle', () => {
    expect(render('full').find('[data-marking="centre-circle"]').exists()).toBe(true)
  })

  it('draws both penalty areas', () => {
    expect(render('full').findAll('[data-marking="penalty-area"]')).toHaveLength(2)
  })

  it('draws both six-yard boxes', () => {
    expect(render('full').findAll('[data-marking="six-yard"]')).toHaveLength(2)
  })

  it('draws four corner arcs', () => {
    expect(render('full').findAll('[data-marking="corner"]')).toHaveLength(4)
  })
})

describe('half pitch', () => {
  it('draws exactly one penalty area', () => {
    expect(render('half').findAll('[data-marking="penalty-area"]')).toHaveLength(1)
  })

  it('is inset so that it stays within the same coordinate space', () => {
    const group = render('half').find('[data-pitch-group]')
    expect(group.attributes('transform')).toContain('translate(25')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/PitchMarkings.spec.ts
```

Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the markings**

Create `src/components/PitchMarkings.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { PitchType } from '../types'
import { PITCH_H, PITCH_W, m } from '../geometry'

const props = defineProps<{ type: PitchType }>()

const isHalf = computed(() => props.type === 'half')
const showMarkings = computed(() => props.type !== 'blank')

/** The left half is exactly 50 units wide, so centring it needs a 25-unit inset. */
const groupTransform = computed(() => (isHalf.value ? 'translate(25 0)' : ''))

const width = computed(() => (isHalf.value ? PITCH_W / 2 : PITCH_W))

const penaltyDepth = m(16.5)
const penaltyWidth = m(40.32)
const penaltyTop = (PITCH_H - penaltyWidth) / 2
const sixDepth = m(5.5)
const sixWidth = m(18.32)
const sixTop = (PITCH_H - sixWidth) / 2
const spotFromGoal = m(11)
const arcRadius = m(9.15)
const cornerRadius = m(1)
const goalWidth = m(7.32)
const goalTop = (PITCH_H - goalWidth) / 2
const goalDepth = m(2)
</script>

<template>
  <g data-pitch-group :transform="groupTransform">
    <rect data-grass :x="0" :y="0" :width="width" :height="PITCH_H" fill="#2e7d32" />

    <g
      v-if="showMarkings"
      fill="none"
      stroke="#ffffff"
      stroke-width="0.35"
      stroke-opacity="0.85"
    >
      <rect data-marking="touchlines" :x="0" :y="0" :width="width" :height="PITCH_H" />

      <!-- Halfway line: the right-hand edge on a half pitch, the middle on a full one. -->
      <line
        data-marking="halfway"
        :x1="width"
        :y1="0"
        :x2="width"
        :y2="PITCH_H"
        v-if="isHalf"
      />
      <line
        data-marking="halfway"
        :x1="PITCH_W / 2"
        :y1="0"
        :x2="PITCH_W / 2"
        :y2="PITCH_H"
        v-else
      />

      <!-- Centre circle: a full circle on a full pitch, the left half of one otherwise. -->
      <circle
        data-marking="centre-circle"
        v-if="!isHalf"
        :cx="PITCH_W / 2"
        :cy="PITCH_H / 2"
        :r="arcRadius"
      />
      <path
        data-marking="centre-circle"
        v-else
        :d="`M ${width} ${PITCH_H / 2 - arcRadius} A ${arcRadius} ${arcRadius} 0 0 0 ${width} ${PITCH_H / 2 + arcRadius}`"
      />
      <circle data-marking="centre-spot" :cx="isHalf ? width : PITCH_W / 2" :cy="PITCH_H / 2" r="0.4" fill="#ffffff" />

      <!-- Left goal end -->
      <rect data-marking="penalty-area" :x="0" :y="penaltyTop" :width="penaltyDepth" :height="penaltyWidth" />
      <rect data-marking="six-yard" :x="0" :y="sixTop" :width="sixDepth" :height="sixWidth" />
      <circle data-marking="penalty-spot" :cx="spotFromGoal" :cy="PITCH_H / 2" r="0.4" fill="#ffffff" />
      <path
        data-marking="penalty-arc"
        :d="`M ${penaltyDepth} ${PITCH_H / 2 - 5.5} A ${arcRadius} ${arcRadius} 0 0 0 ${penaltyDepth} ${PITCH_H / 2 + 5.5}`"
      />
      <rect data-marking="goal" :x="-goalDepth" :y="goalTop" :width="goalDepth" :height="goalWidth" />
      <path data-marking="corner" :d="`M 0 ${cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 0 ${cornerRadius} 0`" />
      <path
        data-marking="corner"
        :d="`M 0 ${PITCH_H - cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 1 ${cornerRadius} ${PITCH_H}`"
      />

      <!-- Right goal end, full pitch only -->
      <template v-if="!isHalf">
        <rect
          data-marking="penalty-area"
          :x="PITCH_W - penaltyDepth"
          :y="penaltyTop"
          :width="penaltyDepth"
          :height="penaltyWidth"
        />
        <rect
          data-marking="six-yard"
          :x="PITCH_W - sixDepth"
          :y="sixTop"
          :width="sixDepth"
          :height="sixWidth"
        />
        <circle data-marking="penalty-spot" :cx="PITCH_W - spotFromGoal" :cy="PITCH_H / 2" r="0.4" fill="#ffffff" />
        <path
          data-marking="penalty-arc"
          :d="`M ${PITCH_W - penaltyDepth} ${PITCH_H / 2 - 5.5} A ${arcRadius} ${arcRadius} 0 0 1 ${PITCH_W - penaltyDepth} ${PITCH_H / 2 + 5.5}`"
        />
        <rect data-marking="goal" :x="PITCH_W" :y="goalTop" :width="goalDepth" :height="goalWidth" />
        <path
          data-marking="corner"
          :d="`M ${PITCH_W} ${cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 1 ${PITCH_W - cornerRadius} 0`"
        />
        <path
          data-marking="corner"
          :d="`M ${PITCH_W} ${PITCH_H - cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 0 ${PITCH_W - cornerRadius} ${PITCH_H}`"
        />
      </template>
    </g>
  </g>
</template>
```

Note the half-pitch corner-arc count: the test expects four arcs on a full pitch. A half pitch renders two, which the test does not assert — that is deliberate, since asserting exact marking counts on the half pitch would restate the template.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test tests/PitchMarkings.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Visually check the pitch**

```bash
npm run dev
```

Temporarily render the component from `App.vue` inside an `<svg :viewBox="viewBoxOf(false)">` and confirm in the browser that the centre circle is round, the boxes are the right way round, and nothing overflows. Revert the temporary `App.vue` change before committing — Task 10 builds the real layout.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: draw full, half and blank pitch markings"
```

---

## Task 9: The board SVG, counters, ball, and pointer interaction

**Files:**
- Create: `src/components/PlayerCounter.vue`, `src/components/BallToken.vue`, `src/components/DrawingLayer.vue`, `src/components/PitchBoard.vue`
- Test: `tests/PitchBoard.spec.ts`

**Interfaces:**
- Consumes: `useBoard` and all its methods from Tasks 3–6; `PitchMarkings` from Task 8; `clientToPitch`, `viewBoxOf`, `toView`, `PITCH_W`, `PITCH_H` from geometry.
- Produces: `PitchBoard.vue` with prop `tool: ToolMode` and `drawColor: string`; exposes `svgEl` via `defineExpose({ svgEl })` so Task 12's PNG export can reach the element. `PlayerCounter.vue` props `counter: Counter`, `rotated: boolean`, `hasBall: boolean`; emits `grab` with the pointer event. `BallToken.vue` props `pos: Vec`; emits `grab`. `DrawingLayer.vue` prop `drawings: Drawing[]`; emits `hit` with a drawing id.

**Interaction contract, which the tests enforce:**
- `pointerdown` on a counter in `select` mode calls `commit()` ONCE, then drags via `moveCounter` on each `pointermove`.
- `pointerdown` on empty grass in a drawing mode starts a stroke; `pointerup` finishes it.
- `pointerdown` in `erase` mode on a counter deletes it; on a drawing, deletes that drawing.
- The SVG captures the pointer so a fast drag that leaves the element still tracks.

- [ ] **Step 1: Write the failing test**

Create `tests/PitchBoard.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PitchBoard from '../src/components/PitchBoard.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { PITCH_H, PITCH_W } from '../src/geometry'

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }

function mountBoard(tool = 'select') {
  const wrapper = mount(PitchBoard, { props: { tool, drawColor: '#ffffff' }, attachTo: document.body })
  const svg = wrapper.find('svg').element as unknown as SVGSVGElement
  // jsdom gives every element a zero-sized rect; supply a realistic one.
  svg.getBoundingClientRect = () => RECT as DOMRect
  // jsdom does not implement pointer capture.
  ;(svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn()
  ;(svg as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = vi.fn()
  return wrapper
}

/** Client coordinates for a given pitch position, matching RECT above. */
function clientFor(x: number, y: number) {
  const scale = 800 / PITCH_W
  const offsetY = (600 - PITCH_H * scale) / 2
  return { clientX: x * scale, clientY: offsetY + y * scale, pointerId: 1 }
}

beforeEach(() => {
  __resetBoardForTests()
  document.body.innerHTML = ''
})

describe('rendering', () => {
  it('renders one circle per counter', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('blue')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-counter]')).toHaveLength(2)
  })

  it('shows the counter label', async () => {
    useBoard().addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-counter-label]').text()).toBe('1')
  })

  it('rings the counter that has the ball', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-possession-ring]').exists()).toBe(true)
  })

  it('renders the ball', async () => {
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-ball]').exists()).toBe(true)
  })
})

describe('dragging a counter', () => {
  it('moves it to where the pointer goes', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter]').trigger('pointerdown', clientFor(50, 32))
    await wrapper.find('svg').trigger('pointermove', clientFor(20, 10))
    await wrapper.find('svg').trigger('pointerup', clientFor(20, 10))

    const moved = board.counterById(c.id)!
    expect(moved.pos.x).toBeCloseTo(20, 4)
    expect(moved.pos.y).toBeCloseTo(10, 4)
  })

  it('produces exactly ONE undo entry for the whole drag', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter]').trigger('pointerdown', clientFor(50, 32))
    await wrapper.find('svg').trigger('pointermove', clientFor(30, 20))
    await wrapper.find('svg').trigger('pointermove', clientFor(25, 15))
    await wrapper.find('svg').trigger('pointermove', clientFor(20, 10))
    await wrapper.find('svg').trigger('pointerup', clientFor(20, 10))

    board.undo() // undoes the drag
    expect(board.state.counters[0].pos.x).toBeCloseTo(PITCH_W / 2, 4)
    board.undo() // undoes the add
    expect(board.state.counters).toHaveLength(0)
  })

  it('ignores pointer moves after the pointer is released', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter]').trigger('pointerdown', clientFor(50, 32))
    await wrapper.find('svg').trigger('pointerup', clientFor(20, 10))
    await wrapper.find('svg').trigger('pointermove', clientFor(90, 60))

    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(20, 4)
  })
})

describe('dragging the ball', () => {
  it('drops it where released and attaches it to a nearby counter', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 70, y: 40 })
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-ball]').trigger('pointerdown', clientFor(50, 32))
    await wrapper.find('svg').trigger('pointermove', clientFor(70, 40))
    await wrapper.find('svg').trigger('pointerup', clientFor(70, 40))

    expect(board.state.ball.attachedTo).toBe(c.id)
  })
})

describe('drawing', () => {
  it('draws a freehand path in pen mode', async () => {
    const board = useBoard()
    const wrapper = mountBoard('pen')
    await wrapper.vm.$nextTick()

    await wrapper.find('svg').trigger('pointerdown', clientFor(10, 10))
    await wrapper.find('svg').trigger('pointermove', clientFor(40, 10))
    await wrapper.find('svg').trigger('pointermove', clientFor(70, 10))
    await wrapper.find('svg').trigger('pointerup', clientFor(70, 10))

    expect(board.state.drawings).toHaveLength(1)
    expect(board.state.drawings[0].kind).toBe('pen')
  })

  it('draws a run arrow', async () => {
    const board = useBoard()
    const wrapper = mountBoard('arrow-run')
    await wrapper.vm.$nextTick()

    await wrapper.find('svg').trigger('pointerdown', clientFor(10, 10))
    await wrapper.find('svg').trigger('pointermove', clientFor(60, 30))
    await wrapper.find('svg').trigger('pointerup', clientFor(60, 30))

    expect(board.state.drawings).toHaveLength(1)
    const arrow = board.state.drawings[0]
    expect(arrow.kind === 'arrow' && arrow.style).toBe('run')
  })

  it('does not drag counters while a drawing tool is active', async () => {
    const board = useBoard()
    const c = board.addCounter('red')
    const wrapper = mountBoard('pen')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter]').trigger('pointerdown', clientFor(50, 32))
    await wrapper.find('svg').trigger('pointermove', clientFor(20, 10))
    await wrapper.find('svg').trigger('pointerup', clientFor(20, 10))

    expect(board.counterById(c.id)!.pos.x).toBeCloseTo(PITCH_W / 2, 4)
  })
})

describe('erase mode', () => {
  it('deletes a counter that is pressed', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountBoard('erase')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-counter]').trigger('pointerdown', clientFor(50, 32))
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('rotation', () => {
  it('swaps the view box when the board is rotated', async () => {
    const board = useBoard()
    board.setRotated(true)
    const wrapper = mountBoard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('svg').attributes('viewBox')).toBe(`0 0 ${PITCH_H} ${PITCH_W}`)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/PitchBoard.spec.ts
```

Expected: FAIL — cannot resolve `../src/components/PitchBoard.vue`.

- [ ] **Step 3: Implement the counter, ball, and drawing components**

Create `src/components/PlayerCounter.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Counter } from '../types'

const props = defineProps<{ counter: Counter; rotated: boolean; hasBall: boolean }>()
defineEmits<{ grab: [event: PointerEvent] }>()

const FILLS: Record<Counter['color'], string> = {
  red: '#e53935',
  blue: '#1e88e5',
  yellow: '#fdd835',
  green: '#43a047',
  black: '#212121',
}

const fill = computed(() => FILLS[props.counter.color])
const textFill = computed(() => (props.counter.color === 'yellow' ? '#212121' : '#ffffff'))

/** Labels stay upright when the board is rotated. */
const labelTransform = computed(() => (props.rotated ? 'rotate(-90)' : ''))

const RADIUS = 2.4
/** A finger is far bigger than the drawn counter, so the hit target is larger. */
const HIT_RADIUS = 4.2
</script>

<template>
  <g data-counter :transform="`translate(${counter.pos.x} ${counter.pos.y})`" style="cursor: grab">
    <circle
      v-if="hasBall"
      data-possession-ring
      :r="RADIUS + 1"
      fill="none"
      stroke="#ffffff"
      stroke-width="0.5"
    />
    <circle :r="RADIUS" :fill="fill" stroke="#00000055" stroke-width="0.2" />
    <text
      data-counter-label
      :transform="labelTransform"
      text-anchor="middle"
      dominant-baseline="central"
      :fill="textFill"
      font-size="2.2"
      font-weight="600"
      style="user-select: none; pointer-events: none"
    >{{ counter.label }}</text>
    <circle
      :r="HIT_RADIUS"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
```

Create `src/components/BallToken.vue`:

```vue
<script setup lang="ts">
import type { Vec } from '../types'

defineProps<{ pos: Vec }>()
defineEmits<{ grab: [event: PointerEvent] }>()
</script>

<template>
  <g data-ball :transform="`translate(${pos.x} ${pos.y})`" style="cursor: grab">
    <circle r="1.3" fill="#ffffff" stroke="#212121" stroke-width="0.25" />
    <circle
      r="3.2"
      fill="transparent"
      @pointerdown="$emit('grab', $event as PointerEvent)"
    />
  </g>
</template>
```

Create `src/components/DrawingLayer.vue`:

```vue
<script setup lang="ts">
import type { Drawing, PenDrawing } from '../types'

defineProps<{ drawings: Drawing[] }>()
defineEmits<{ hit: [id: string] }>()

function penPath(drawing: PenDrawing): string {
  return drawing.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}
</script>

<template>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <!-- One marker per arrow so the head takes the arrow's own colour. -->
    <defs>
      <marker
        v-for="d in drawings.filter((x) => x.kind === 'arrow')"
        :key="`m-${d.id}`"
        :id="`head-${d.id}`"
        markerWidth="4"
        markerHeight="4"
        refX="3"
        refY="2"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M 0 0 L 4 2 L 0 4 z" :fill="d.color" />
      </marker>
    </defs>

    <template v-for="d in drawings" :key="d.id">
      <path
        v-if="d.kind === 'pen'"
        data-drawing
        :d="penPath(d)"
        :stroke="d.color"
        stroke-width="0.5"
        @pointerdown="$emit('hit', d.id)"
      />
      <line
        v-else
        data-drawing
        :x1="d.from.x"
        :y1="d.from.y"
        :x2="d.to.x"
        :y2="d.to.y"
        :stroke="d.color"
        stroke-width="0.5"
        :stroke-dasharray="d.style === 'pass' ? '1.6 1.2' : undefined"
        :marker-end="`url(#head-${d.id})`"
        @pointerdown="$emit('hit', d.id)"
      />
    </template>
  </g>
</template>
```

- [ ] **Step 4: Implement the board and its pointer handling**

Create `src/components/PitchBoard.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolMode } from '../types'
import { PITCH_H, PITCH_W, clientToPitch, viewBoxOf } from '../geometry'
import { useBoard } from '../composables/useBoard'
import PitchMarkings from './PitchMarkings.vue'
import PlayerCounter from './PlayerCounter.vue'
import BallToken from './BallToken.vue'
import DrawingLayer from './DrawingLayer.vue'

const props = defineProps<{ tool: ToolMode; drawColor: string }>()

const board = useBoard()
const svgEl = ref<SVGSVGElement | null>(null)

defineExpose({ svgEl })

type Drag =
  | { kind: 'counter'; id: string }
  | { kind: 'ball' }
  | { kind: 'pen'; id: string }
  | { kind: 'arrow'; id: string }

const drag = ref<Drag | null>(null)

const viewBox = computed(() => viewBoxOf(board.state.pitch.rotated))

/** The rotation is applied once, here, so nothing downstream knows about it. */
const boardTransform = computed(() =>
  board.state.pitch.rotated ? `translate(${PITCH_H} 0) rotate(90)` : '',
)

const ballPos = computed(() => board.ballPosition())

function toPitch(event: PointerEvent) {
  const rect = svgEl.value!.getBoundingClientRect()
  return clientToPitch(rect, event.clientX, event.clientY, board.state.pitch.rotated)
}

function capture(event: PointerEvent) {
  svgEl.value?.setPointerCapture(event.pointerId)
}

function onCounterGrab(id: string, event: PointerEvent) {
  if (props.tool === 'erase') {
    board.deleteCounter(id)
    return
  }
  if (props.tool !== 'select') return
  event.stopPropagation()
  capture(event)
  board.commit() // one entry for the whole drag
  drag.value = { kind: 'counter', id }
  board.moveCounter(id, toPitch(event))
}

function onBallGrab(event: PointerEvent) {
  if (props.tool !== 'select') return
  event.stopPropagation()
  capture(event)
  board.commit()
  drag.value = { kind: 'ball' }
  board.moveBall(toPitch(event))
}

function onDrawingHit(id: string) {
  if (props.tool === 'erase') board.deleteDrawing(id)
}

function onPointerDown(event: PointerEvent) {
  const at = toPitch(event)
  if (props.tool === 'pen') {
    capture(event)
    drag.value = { kind: 'pen', id: board.startPen(at, props.drawColor) }
  } else if (props.tool === 'arrow-run' || props.tool === 'arrow-pass') {
    capture(event)
    const style = props.tool === 'arrow-run' ? 'run' : 'pass'
    drag.value = { kind: 'arrow', id: board.startArrow(at, props.drawColor, style) }
  }
}

function onPointerMove(event: PointerEvent) {
  const active = drag.value
  if (!active) return
  const at = toPitch(event)
  if (active.kind === 'counter') board.moveCounter(active.id, at)
  else if (active.kind === 'ball') board.moveBall(at)
  else if (active.kind === 'pen') board.extendPen(active.id, at)
  else board.updateArrow(active.id, at)
}

function onPointerUp(event: PointerEvent) {
  const active = drag.value
  if (!active) return
  const at = toPitch(event)
  if (active.kind === 'counter') board.moveCounter(active.id, at)
  else if (active.kind === 'ball') board.dropBall(at)
  else if (active.kind === 'pen') {
    board.extendPen(active.id, at)
    board.finishDrawing(active.id)
  } else {
    board.updateArrow(active.id, at)
    board.finishDrawing(active.id)
  }
  drag.value = null
  svgEl.value?.releasePointerCapture(event.pointerId)
}
</script>

<template>
  <svg
    ref="svgEl"
    class="board"
    :viewBox="viewBox"
    xmlns="http://www.w3.org/2000/svg"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <g :transform="boardTransform">
      <rect :x="0" :y="0" :width="PITCH_W" :height="PITCH_H" fill="#2e7d32" />
      <PitchMarkings :type="board.state.pitch.type" />
      <DrawingLayer :drawings="board.state.drawings" @hit="onDrawingHit" />
      <PlayerCounter
        v-for="counter in board.state.counters"
        :key="counter.id"
        :counter="counter"
        :rotated="board.state.pitch.rotated"
        :has-ball="board.state.ball.attachedTo === counter.id"
        @grab="onCounterGrab(counter.id, $event)"
      />
      <BallToken :pos="ballPos" @grab="onBallGrab" />
    </g>
  </svg>
</template>

<style scoped>
.board {
  /* Without this, a drag on a tablet scrolls the page instead of the counter. */
  touch-action: none;
  width: 100%;
  height: 100%;
  display: block;
  background: #1b5e20;
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test tests/PitchBoard.spec.ts
```

Expected: PASS.

If the counter-drag test fails because the `pointerdown` never reaches the handler, check that the hit circle in `PlayerCounter.vue` is the LAST child of its group — SVG has no z-index, so paint order decides which element receives the event.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: interactive board with counter, ball and drawing tools"
```

---

## Task 10: Toolbar, app layout, and keyboard shortcuts

**Files:**
- Create: `src/components/Toolbar.vue`
- Modify: `src/App.vue`
- Test: `tests/Toolbar.spec.ts`

**Interfaces:**
- Consumes: `useBoard`, `COUNTER_COLORS`, `PitchBoard` from earlier tasks.
- Produces: `Toolbar.vue` with props `tool: ToolMode` and `drawColor: string`; emits `update:tool`, `update:drawColor`, and `save`, `open`, `exportPng`, `exportJson`, `importJson`. `App.vue` owns `tool` and `drawColor` state and wires keyboard shortcuts.

- [ ] **Step 1: Write the failing test**

Create `tests/Toolbar.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Toolbar from '../src/components/Toolbar.vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { COUNTER_COLORS } from '../src/geometry'

beforeEach(() => __resetBoardForTests())

function mountToolbar() {
  return mount(Toolbar, { props: { tool: 'select', drawColor: '#ffffff' } })
}

describe('colour palette', () => {
  it('offers one swatch per colour', () => {
    expect(mountToolbar().findAll('[data-add-counter]')).toHaveLength(COUNTER_COLORS.length)
  })

  it('adds a counter of that colour when a swatch is clicked', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    await wrapper.find('[data-add-counter="blue"]').trigger('click')
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].color).toBe('blue')
  })
})

describe('tool selection', () => {
  it('emits the chosen tool', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-tool="pen"]').trigger('click')
    expect(wrapper.emitted('update:tool')![0]).toEqual(['pen'])
  })

  it('marks the active tool', () => {
    const wrapper = mount(Toolbar, { props: { tool: 'erase', drawColor: '#ffffff' } })
    expect(wrapper.find('[data-tool="erase"]').classes()).toContain('is-active')
  })
})

describe('pitch controls', () => {
  it('changes the pitch type', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    await wrapper.find('[data-pitch="full"]').trigger('click')
    expect(board.state.pitch.type).toBe('full')
  })

  it('rotates the board', async () => {
    const board = useBoard()
    const wrapper = mountToolbar()
    await wrapper.find('[data-rotate]').trigger('click')
    expect(board.state.pitch.rotated).toBe(true)
  })
})

describe('undo and redo buttons', () => {
  it('are disabled when there is nothing to do', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('[data-undo]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-redo]').attributes('disabled')).toBeDefined()
  })

  it('undoes', async () => {
    const board = useBoard()
    board.addCounter('red')
    const wrapper = mountToolbar()
    await wrapper.find('[data-undo]').trigger('click')
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('menu actions', () => {
  it('emits save', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-save]').trigger('click')
    expect(wrapper.emitted('save')).toBeTruthy()
  })

  it('emits exportPng', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('[data-export-png]').trigger('click')
    expect(wrapper.emitted('exportPng')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/Toolbar.spec.ts
```

Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the toolbar**

Create `src/components/Toolbar.vue`:

```vue
<script setup lang="ts">
import type { CounterColor, PitchType, ToolMode } from '../types'
import { COUNTER_COLORS } from '../geometry'
import { useBoard } from '../composables/useBoard'

defineProps<{ tool: ToolMode; drawColor: string }>()

const emit = defineEmits<{
  'update:tool': [tool: ToolMode]
  'update:drawColor': [color: string]
  save: []
  open: []
  exportPng: []
  exportJson: []
  importJson: []
}>()

const board = useBoard()

const SWATCHES: Record<CounterColor, string> = {
  red: '#e53935',
  blue: '#1e88e5',
  yellow: '#fdd835',
  green: '#43a047',
  black: '#212121',
}

const TOOLS: { id: ToolMode; label: string }[] = [
  { id: 'select', label: 'Move' },
  { id: 'pen', label: 'Draw' },
  { id: 'arrow-run', label: 'Run' },
  { id: 'arrow-pass', label: 'Pass' },
  { id: 'erase', label: 'Erase' },
]

const PITCHES: { id: PitchType; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'full', label: 'Full' },
  { id: 'half', label: 'Half' },
]

const DRAW_COLORS = ['#ffffff', '#ffeb3b', '#212121', '#e53935']
</script>

<template>
  <div class="toolbar">
    <div class="group">
      <span class="group-label">Players</span>
      <button
        v-for="color in COUNTER_COLORS"
        :key="color"
        :data-add-counter="color"
        class="swatch"
        :style="{ background: SWATCHES[color] }"
        :title="`Add a ${color} player`"
        @click="board.addCounter(color)"
      />
    </div>

    <div class="group">
      <span class="group-label">Tool</span>
      <button
        v-for="t in TOOLS"
        :key="t.id"
        :data-tool="t.id"
        :class="['chip', { 'is-active': tool === t.id }]"
        @click="emit('update:tool', t.id)"
      >{{ t.label }}</button>
      <button
        v-for="c in DRAW_COLORS"
        :key="c"
        class="swatch swatch--sm"
        :class="{ 'is-active': drawColor === c }"
        :style="{ background: c }"
        :title="'Draw in this colour'"
        @click="emit('update:drawColor', c)"
      />
    </div>

    <div class="group">
      <span class="group-label">Pitch</span>
      <button
        v-for="p in PITCHES"
        :key="p.id"
        :data-pitch="p.id"
        :class="['chip', { 'is-active': board.state.pitch.type === p.id }]"
        @click="board.setPitchType(p.id)"
      >{{ p.label }}</button>
      <button data-rotate class="chip" @click="board.toggleRotated()">Rotate</button>
    </div>

    <div class="group">
      <button data-undo class="chip" :disabled="!board.canUndo.value" @click="board.undo()">Undo</button>
      <button data-redo class="chip" :disabled="!board.canRedo.value" @click="board.redo()">Redo</button>
      <button class="chip" @click="board.clearDrawings()">Clear drawings</button>
    </div>

    <div class="group">
      <button data-save class="chip" @click="emit('save')">Save</button>
      <button data-open class="chip" @click="emit('open')">Open</button>
      <button data-export-png class="chip" @click="emit('exportPng')">PNG</button>
      <button data-export-json class="chip" @click="emit('exportJson')">Export</button>
      <button data-import-json class="chip" @click="emit('importJson')">Import</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.6rem 0.8rem;
  background: #263238;
  color: #eceff1;
  align-items: center;
}
.group { display: flex; gap: 0.35rem; align-items: center; }
.group-label { font-size: 0.7rem; text-transform: uppercase; opacity: 0.65; margin-right: 0.2rem; }
.swatch {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 2px solid #ffffff40; cursor: pointer; padding: 0;
}
.swatch--sm { width: 1.4rem; height: 1.4rem; }
.swatch.is-active, .chip.is-active { border-color: #ffffff; }
.chip {
  border: 1px solid #ffffff40; background: #37474f; color: inherit;
  border-radius: 0.4rem; padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem;
}
.chip:disabled { opacity: 0.4; cursor: default; }
.chip.is-active { background: #546e7a; }
</style>
```

- [ ] **Step 4: Wire the app layout and keyboard shortcuts**

Replace `src/App.vue`:

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { ToolMode } from './types'
import Toolbar from './components/Toolbar.vue'
import PitchBoard from './components/PitchBoard.vue'
import { useBoard } from './composables/useBoard'
import { useStorage } from './composables/useStorage'

const board = useBoard()
const storage = useStorage()

const tool = ref<ToolMode>('select')
const drawColor = ref('#ffffff')

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

  const modifier = event.metaKey || event.ctrlKey
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) board.redo()
    else board.undo()
    return
  }

  const byKey: Record<string, ToolMode> = { v: 'select', p: 'pen', r: 'arrow-run', s: 'arrow-pass', e: 'erase' }
  const next = byKey[event.key.toLowerCase()]
  if (next) tool.value = next
}

onMounted(() => {
  const draft = storage.loadDraft()
  if (draft) board.loadSnapshot(draft)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Autosave the working board, debounced, so a refresh does not lose work.
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => board.state,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => storage.saveDraft(board.snapshot()), 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="app">
    <Toolbar v-model:tool="tool" v-model:drawColor="drawColor" />
    <div class="stage">
      <PitchBoard :tool="tool" :draw-color="drawColor" />
    </div>
    <p v-if="storage.lastError.value" class="error" role="status">{{ storage.lastError.value }}</p>
  </div>
</template>

<style>
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body { font-family: system-ui, sans-serif; background: #102010; }
</style>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.stage { flex: 1; min-height: 0; padding: 0.75rem; }
.error {
  margin: 0; padding: 0.6rem 0.9rem; background: #b71c1c; color: #fff; font-size: 0.85rem;
}
</style>
```

Note: `loadSnapshot` on mount pushes an undo entry, so the coach can undo straight back to an empty board on their first visit. That is acceptable and mildly useful.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 6: Verify the app runs**

```bash
npm run dev
```

In the browser: add counters of two colours, drag them, draw a run arrow, drag the ball onto a player and confirm the possession ring appears, switch to the full pitch, rotate, and press Ctrl+Z several times. Refresh the page and confirm the board comes back.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: toolbar, layout, keyboard shortcuts and draft autosave"
```

---

## Task 11: Saved pattern library

**Files:**
- Create: `src/components/PatternLibrary.vue`
- Modify: `src/App.vue`
- Test: `tests/PatternLibrary.spec.ts`

**Interfaces:**
- Consumes: `useStorage` from Task 7, `useBoard` from Task 3.
- Produces: `PatternLibrary.vue` with prop `open: boolean`; emits `close`. It reads and writes storage directly rather than proxying through props, because it is the only screen that manages the library.

- [ ] **Step 1: Write the failing test**

Create `tests/PatternLibrary.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PatternLibrary from '../src/components/PatternLibrary.vue'
import { useStorage } from '../src/composables/useStorage'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function seed(name: string) {
  return useStorage().savePattern(name, {
    counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
    ball: { pos: { x: 5, y: 5 }, attachedTo: null },
    drawings: [],
    pitch: { type: 'full', rotated: false },
  })
}

describe('listing', () => {
  it('shows every saved pattern', () => {
    seed('Press trigger')
    seed('Build from the back')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(2)
  })

  it('shows a message when the library is empty', () => {
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    expect(wrapper.text()).toMatch(/nothing saved yet/i)
  })

  it('renders nothing when closed', () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: false } })
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(0)
  })
})

describe('loading', () => {
  it('puts the pattern on the board and closes', async () => {
    seed('Press trigger')
    const board = useBoard()
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-load]').trigger('click')
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.pitch.type).toBe('full')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('is undoable, so a mis-click does not lose the working board', async () => {
    seed('Press trigger')
    const board = useBoard()
    board.addCounter('blue')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-load]').trigger('click')
    board.undo()
    expect(board.state.counters[0].color).toBe('blue')
  })
})

describe('deleting', () => {
  it('removes the pattern from the list', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')
    await wrapper.find('[data-confirm-delete]').trigger('click')
    expect(wrapper.findAll('[data-pattern]')).toHaveLength(0)
    expect(useStorage().listPatterns()).toHaveLength(0)
  })

  it('asks for confirmation first, in the page rather than a browser dialog', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-delete]').trigger('click')
    expect(wrapper.find('[data-confirm-delete]').exists()).toBe(true)
    expect(useStorage().listPatterns()).toHaveLength(1)
  })
})

describe('renaming', () => {
  it('saves the new name', async () => {
    seed('Press trigger')
    const wrapper = mount(PatternLibrary, { props: { open: true } })
    await wrapper.find('[data-rename]').trigger('click')
    const input = wrapper.find('[data-rename-input]')
    await input.setValue('Counter press')
    await wrapper.find('[data-rename-save]').trigger('click')
    expect(useStorage().listPatterns()[0].name).toBe('Counter press')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/PatternLibrary.spec.ts
```

Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement the library**

Create `src/components/PatternLibrary.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Pattern } from '../types'
import { useStorage } from '../composables/useStorage'
import { useBoard } from '../composables/useBoard'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const storage = useStorage()
const board = useBoard()

const patterns = ref<Pattern[]>([])
const confirmingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')

function refresh() {
  patterns.value = storage.listPatterns()
}

watch(() => props.open, (open) => { if (open) refresh() }, { immediate: true })

const isEmpty = computed(() => patterns.value.length === 0)

function load(pattern: Pattern) {
  board.loadSnapshot(storage.patternToSnapshot(pattern))
  emit('close')
}

function askDelete(id: string) {
  confirmingId.value = id
}

function confirmDelete(id: string) {
  storage.deletePattern(id)
  confirmingId.value = null
  refresh()
}

function startRename(pattern: Pattern) {
  renamingId.value = pattern.id
  renameDraft.value = pattern.name
}

function saveRename(id: string) {
  const name = renameDraft.value.trim()
  if (name) storage.renamePattern(id, name)
  renamingId.value = null
  refresh()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-label="Saved patterns">
      <header class="head">
        <h2>Saved patterns</h2>
        <button class="chip" @click="emit('close')">Close</button>
      </header>

      <p v-if="isEmpty" class="empty">Nothing saved yet. Set up a pattern and press Save.</p>

      <ul v-else class="list">
        <li v-for="pattern in patterns" :key="pattern.id" data-pattern class="row">
          <template v-if="renamingId === pattern.id">
            <input v-model="renameDraft" data-rename-input class="input" />
            <button data-rename-save class="chip" @click="saveRename(pattern.id)">Save</button>
            <button class="chip" @click="renamingId = null">Cancel</button>
          </template>

          <template v-else-if="confirmingId === pattern.id">
            <span class="name">Delete “{{ pattern.name }}”?</span>
            <button data-confirm-delete class="chip chip--danger" @click="confirmDelete(pattern.id)">Delete</button>
            <button class="chip" @click="confirmingId = null">Cancel</button>
          </template>

          <template v-else>
            <span class="name">{{ pattern.name }}</span>
            <span class="date">{{ formatDate(pattern.updatedAt) }}</span>
            <button data-load class="chip" @click="load(pattern)">Load</button>
            <button data-rename class="chip" @click="startRename(pattern)">Rename</button>
            <button data-delete class="chip" @click="askDelete(pattern.id)">Delete</button>
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: #000000aa;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.panel {
  background: #263238; color: #eceff1; border-radius: 0.6rem;
  width: min(38rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.head h2 { margin: 0; font-size: 1.1rem; }
.empty { opacity: 0.7; }
.list { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
.row { display: flex; gap: 0.4rem; align-items: center; background: #37474f; padding: 0.45rem 0.6rem; border-radius: 0.4rem; }
.name { flex: 1; }
.date { opacity: 0.6; font-size: 0.8rem; }
.input { flex: 1; padding: 0.35rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: #263238; color: inherit; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
.chip--danger { background: #c62828; }
</style>
```

Note the deliberate absence of `window.confirm`: a native dialog blocks the page and is awkward on touch, so confirmation is inline.

- [ ] **Step 4: Wire the library into the app**

In `src/App.vue`, add to the script:

```ts
import PatternLibrary from './components/PatternLibrary.vue'

const libraryOpen = ref(false)
const currentPatternId = ref<string | null>(null)
const currentName = ref('')
const savePromptOpen = ref(false)
const saveNameDraft = ref('')

function openSavePrompt() {
  saveNameDraft.value = currentName.value || 'New pattern'
  savePromptOpen.value = true
}

function confirmSave() {
  const name = saveNameDraft.value.trim()
  if (!name) return
  const saved = storage.savePattern(name, board.snapshot(), currentPatternId.value ?? undefined)
  currentPatternId.value = saved.id
  currentName.value = saved.name
  savePromptOpen.value = false
}
```

Add to the template, inside `.app`, after `<div class="stage">`:

```vue
    <PatternLibrary :open="libraryOpen" @close="libraryOpen = false" />

    <div v-if="savePromptOpen" class="overlay" @click.self="savePromptOpen = false">
      <div class="prompt" role="dialog" aria-label="Save pattern">
        <label for="pattern-name">Name this pattern</label>
        <input id="pattern-name" v-model="saveNameDraft" class="input" @keyup.enter="confirmSave" />
        <div class="prompt-actions">
          <button class="chip" @click="confirmSave">Save</button>
          <button class="chip" @click="savePromptOpen = false">Cancel</button>
        </div>
      </div>
    </div>
```

Bind the toolbar events: `@save="openSavePrompt"` and `@open="libraryOpen = true"` on the `<Toolbar>` element.

Add to `App.vue`'s scoped styles:

```css
.overlay { position: fixed; inset: 0; background: #000000aa; display: flex; align-items: center; justify-content: center; }
.prompt { background: #263238; color: #eceff1; padding: 1rem; border-radius: 0.6rem; display: grid; gap: 0.5rem; min-width: 18rem; }
.prompt-actions { display: flex; gap: 0.4rem; }
.input { padding: 0.4rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: #37474f; color: inherit; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.35rem 0.7rem; cursor: pointer; }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: saved pattern library with load, rename and delete"
```

---

## Task 12: Export to PNG and JSON, import from JSON

**Files:**
- Create: `src/composables/useExport.ts`
- Modify: `src/App.vue`
- Test: `tests/useExport.spec.ts`

**Interfaces:**
- Consumes: `useStorage` from Task 7; the `svgEl` exposed by `PitchBoard` in Task 9.
- Produces: `useExport()` with `svgToPngBlob(svg: SVGSVGElement, pixelWidth?: number): Promise<Blob>`, `downloadBlob(blob: Blob, filename: string): void`, `downloadText(text: string, filename: string, mime?: string): void`, `pickJsonFile(): Promise<string>`, `slugify(name: string): string`.

**Note on testability:** `svgToPngBlob` needs `Image`, `canvas.toBlob`, and object URLs, none of which jsdom implements meaningfully. The tests therefore cover `slugify`, `downloadText`, and `downloadBlob` (which are pure or DOM-only), and PNG export is verified by hand in the browser at Step 6. Writing a jsdom test for `toBlob` would test the mock, not the code.

- [ ] **Step 1: Write the failing test**

Create `tests/useExport.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useExport } from '../src/composables/useExport'

beforeEach(() => {
  document.body.innerHTML = ''
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true })
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  }
})

afterEach(() => vi.restoreAllMocks())

describe('slugify', () => {
  it('makes a filename-safe name', () => {
    expect(useExport().slugify('Press trigger — 4-4-2!')).toBe('press-trigger-4-4-2')
  })

  it('falls back when the name has nothing usable', () => {
    expect(useExport().slugify('!!!')).toBe('pattern')
  })
})

describe('downloadText', () => {
  it('clicks a link carrying the right filename', () => {
    const clicks: string[] = []
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = create(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = () => clicks.push(el.download)
      return el
    })

    useExport().downloadText('{}', 'patterns.json')
    expect(clicks).toEqual(['patterns.json'])
  })

  it('does not leave the link in the document', () => {
    useExport().downloadText('{}', 'patterns.json')
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test tests/useExport.spec.ts
```

Expected: FAIL — cannot resolve `../src/composables/useExport`.

- [ ] **Step 3: Implement export**

Create `src/composables/useExport.ts`:

```ts
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'pattern'
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
}

function downloadText(text: string, filename: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

/**
 * Rasterise the live board SVG.
 *
 * The SVG is serialised to a data URL rather than a blob URL: a blob URL for
 * an SVG is treated as cross-origin by canvas, which taints it and makes
 * toBlob throw a SecurityError.
 */
function svgToPngBlob(svg: SVGSVGElement, pixelWidth = 1600): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const viewBox = (clone.getAttribute('viewBox') ?? '0 0 100 65').split(/\s+/).map(Number)
  const aspect = viewBox[2] / viewBox[3]
  const width = pixelWidth
  const height = Math.round(pixelWidth / aspect)

  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const source = new XMLSerializer().serializeToString(clone)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('This browser could not create the image.'))
        return
      }
      context.drawImage(image, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The image could not be created.'))
      }, 'image/png')
    }
    image.onerror = () => reject(new Error('The board could not be converted to an image.'))
    image.src = dataUrl
  })
}

/** Open a file picker and resolve with the chosen file's text. */
function pickJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('No file was chosen.'))
        return
      }
      file.text().then(resolve, () => reject(new Error('That file could not be read.')))
    }
    input.click()
  })
}

const api = { slugify, downloadBlob, downloadText, svgToPngBlob, pickJsonFile }

export function useExport() {
  return api
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test tests/useExport.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Wire export and import into the app**

In `src/App.vue`, add to the script:

```ts
import { useExport } from './composables/useExport'

const exporter = useExport()
const boardRef = ref<InstanceType<typeof PitchBoard> | null>(null)
const notice = ref<string | null>(null)

async function exportPng() {
  const svg = boardRef.value?.svgEl
  if (!svg) return
  try {
    const blob = await exporter.svgToPngBlob(svg)
    exporter.downloadBlob(blob, `${exporter.slugify(currentName.value || 'tactics-board')}.png`)
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'The image could not be created.'
  }
}

function exportJson() {
  const patterns = storage.listPatterns()
  if (patterns.length === 0) {
    notice.value = 'There are no saved patterns to export.'
    return
  }
  exporter.downloadText(storage.exportPatternsJson(patterns), 'tactics-patterns.json')
}

async function importJson() {
  try {
    const text = await exporter.pickJsonFile()
    const added = storage.importPatterns(text)
    notice.value = `Imported ${added.length} pattern(s).`
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'That file could not be imported.'
  }
}
```

Add `ref="boardRef"` to the `<PitchBoard>` element, bind `@exportPng="exportPng"`, `@exportJson="exportJson"`, `@importJson="importJson"` on `<Toolbar>`, and render the notice next to the existing error line:

```vue
    <p v-if="notice" class="notice" role="status" @click="notice = null">{{ notice }}</p>
```

with:

```css
.notice { margin: 0; padding: 0.6rem 0.9rem; background: #1565c0; color: #fff; font-size: 0.85rem; cursor: pointer; }
```

- [ ] **Step 6: Verify export by hand in the browser**

```bash
npm run dev
```

Set up a board with counters, an arrow, and the ball attached to a player. Press PNG and confirm the downloaded image shows the board correctly, including the pitch markings and arrow heads. Press Export, then Import the same file, and confirm the patterns arrive with `(imported)` suffixes rather than overwriting.

If the PNG is blank, the usual cause is CSS that lives outside the SVG: everything the export needs must be an SVG attribute or an inline `style`, not a class defined in a `<style scoped>` block that the serialised clone cannot see. The components in Task 9 set fills and strokes as attributes for exactly this reason.

- [ ] **Step 7: Run the full suite and build**

```bash
npm test
npm run build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: export the board as PNG and patterns as JSON"
```

---

## Task 13: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the finished app.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the README**

Create `README.md`:

````markdown
# Football Coach Tactics Board

A browser tactics board for describing soccer/football drills. Drop coloured counters on
a pitch, drag them into position, draw runs and passes, mark who has the ball, and save
the pattern for a later session.

Everything runs in the browser. There is no server and no account, and patterns are
stored in the browser's local storage.

## Running it

```bash
npm install
npm run dev
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## Using it

Click a colour under **Players** to drop a counter, then drag it. Double the counter's
number is editable in a later version; for now labels are assigned automatically from 1
within each colour.

| Tool | Key | What it does |
| --- | --- | --- |
| Move | `V` | Drag counters and the ball |
| Draw | `P` | Freehand pen |
| Run | `R` | Solid arrow |
| Pass | `S` | Dashed arrow |
| Erase | `E` | Remove whatever you press |

Undo is `Ctrl+Z` (`Cmd+Z` on a Mac), redo is `Ctrl+Shift+Z`.

Drop the ball on a player to give them possession — the player gets a white ring and the
ball travels with them. Drag it onto empty grass to release it.

## Where patterns live

Saved patterns are in this browser's local storage under `fct.patterns.v1`, and the board
you are working on autosaves to `fct.draft.v1` so a refresh does not lose it.

Local storage is per-browser and per-device. Use **Export** to write a JSON file for
backup or to move patterns to another machine, and **Import** to read one back. Importing
never overwrites: a pattern whose id already exists arrives under a new id with
`(imported)` appended to its name.

## Coordinate system

Positions are stored in pitch units — x from 0 to 100, y from 0 to 64.76 — which is a
105×68 pitch at uniform scale. Nothing is stored in pixels, so resizing the window,
rotating the board, and switching between pitch types never move a counter.

## Not built yet

Recording and playing back movement. The saved format already stores a `frames` array
with one frame per pattern, so recording can append frames without changing the schema
or invalidating anything already saved.
````

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: add README"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Pitch unit coordinate system, resolution independent | 1, 2 |
| Portrait/landscape rotation, labels upright | 1, 9 |
| Blank/full/half pitch | 8 |
| Data model incl. replay-ready `frames` array | 1, 7 |
| Five colours, auto-numbering, gaps on delete, editable labels | 4 |
| Counter add/move/delete | 4, 9, 10 |
| Ball, snap to counter, possession ring, rides along, frees on delete | 5, 9 |
| Freehand pen and run/pass arrows | 6, 9 |
| Erase tool | 6, 9 |
| Pointer events, `touch-action: none`, enlarged hit radius | 9 |
| Undo/redo, 50 cap, one entry per drag, keyboard bound | 3, 4, 9, 10 |
| localStorage library + debounced draft autosave | 7, 10 |
| Import merges by id, never overwrites | 7, 12 |
| Corrupt storage, unknown version, quota, malformed import | 7 |
| PNG export, JSON export/import | 12 |
| Only `useBoard` mutates state | 3–6, enforced by component design in 9 |
| Test strategy as specified | every task |

Every spec section maps to at least one task.

**Deviations from the spec, deliberate and noted in the plan:**
1. Coordinate space is 0–100 × 0–64.76, not 0–100 × 0–100 — a square view box would distort the centre circle. Recorded in Global Constraints and the README.
2. Counter labels reuse the lowest free number rather than always incrementing. Surviving counters still keep their labels, which is the property the spec actually cares about; the test in Task 4 pins both behaviours.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step carries the code.

**Type consistency:** `BoardSnapshot` is produced by `useBoard.snapshot()` (Task 3) and consumed by `useStorage.savePattern`/`saveDraft` (Task 7) and `useBoard.loadSnapshot` (Tasks 3, 11) under that exact name. `clampToPitch` and `distance` are defined in Task 2 and used in Tasks 4, 5, 6. `finishDrawing` reaches into `undoStack` in Task 6, which is defined in Task 3 in the same module. `svgEl` is exposed in Task 9 and consumed in Task 12. `COUNTER_COLORS` is defined in Task 1 and used in Task 10.
