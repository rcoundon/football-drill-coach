# Session Plans and Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach can tag drills, filter the library by tag, build a named session of drills with minutes, and export the whole session as one PDF.

**Architecture:** Sessions are a second stored collection referencing patterns by id, sitting on a storage helper extracted from the library's existing read/write discipline. The PDF is built with jsPDF from board images rasterised off-screen through `BoardView`, so the coach's live board is never touched.

**Tech Stack:** Vue 3.5.41, TypeScript, Vitest 4.1.11, @vue/test-utils 2.4.11, jspdf 4.2.1 (new).

**Spec:** `docs/superpowers/specs/2026-08-26-session-plans-and-tags-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-26-board-view-extraction.md` must be landed first. Task 7 mounts `BoardView` directly.

## Global Constraints

- Dependencies pinned to exact versions in `package.json`. Never `^` or `~`. Install with `npm install --save-exact jspdf@4.2.1`.
- Run the suite with `npm test`. One file: `npx vitest run tests/<name>.spec.ts`.
- `npm run build` runs `vue-tsc --noEmit`; a type error fails the build.
- **No backward compatibility.** The app is in development and no saved data outside this repository matters. Do not add a migration or a second accepted file shape.
- Every control must be reachable by touch. A keyboard shortcut may be added *alongside* a button, never instead of one.
- Comments explain *why*, matching the surrounding code.

---

### Task 1: Tags on a pattern

**Files:**
- Modify: `src/types.ts` — add `tags` to `Pattern`
- Modify: `src/composables/useStorage.ts` — validate in `parsePattern`, normalise in `toPattern`, add `setTags`
- Test: `tests/useStorage.tags.spec.ts`

**Interfaces:**
- Produces:
  - `Pattern.tags?: string[]`
  - `normaliseTags(input: string[]): string[]` exported from `src/composables/useStorage.ts`
  - `storage.setTags(id: string, tags: string[]): void`
  - `storage.allTags(): string[]` — every tag in use, sorted

- [ ] **Step 1: Write the failing test**

Create `tests/useStorage.tags.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStorage, normaliseTags, PATTERNS_KEY } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function save(name: string) {
  return storage.savePattern(name, useBoard().snapshot())
}

describe('normaliseTags', () => {
  it('trims, lowercases and deduplicates', () => {
    expect(normaliseTags([' Rondo ', 'rondo', 'PRESSING'])).toEqual(['rondo', 'pressing'])
  })

  it('drops empties', () => {
    expect(normaliseTags(['', '   ', 'rondo'])).toEqual(['rondo'])
  })

  it('keeps the order they were given in', () => {
    expect(normaliseTags(['warm up', 'rondo'])).toEqual(['warm up', 'rondo'])
  })
})

describe('tags on a pattern', () => {
  it('reads a pattern with no tags as having none', () => {
    const saved = save('Rondo')
    expect(storage.listPatterns()[0].tags ?? []).toEqual([])
    expect(saved.tags ?? []).toEqual([])
  })

  it('stores tags normalised', () => {
    const saved = save('Rondo')
    storage.setTags(saved.id, [' Rondo ', 'RONDO', 'warm up'])

    expect(storage.listPatterns()[0].tags).toEqual(['rondo', 'warm up'])
  })

  it('gathers every tag in use, sorted, without duplicates', () => {
    const a = save('Rondo')
    const b = save('Pressing trap')
    storage.setTags(a.id, ['rondo', 'warm up'])
    storage.setTags(b.id, ['pressing', 'rondo'])

    expect(storage.allTags()).toEqual(['pressing', 'rondo', 'warm up'])
  })

  it('refuses a pattern whose tags are not strings', () => {
    const saved = save('Rondo')
    const raw = JSON.parse(localStorage.getItem(PATTERNS_KEY)!)
    raw[0].tags = [1, 2]
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(raw))

    // The damaged row is carried, not read: the library reports it and
    // returns the rest.
    expect(storage.listPatterns()).toHaveLength(0)
    expect(storage.lastError.value).toContain('could not be read')
    expect(saved.id).toBeTruthy()
  })

  it('leaves a rename alone', () => {
    const saved = save('Rondo')
    storage.setTags(saved.id, ['rondo'])
    storage.renamePattern(saved.id, 'Rondo 4v2')

    expect(storage.listPatterns()[0].tags).toEqual(['rondo'])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/useStorage.tags.spec.ts`
Expected: FAIL — `normaliseTags` is not exported.

- [ ] **Step 3: Add the type**

In `src/types.ts`, inside `Pattern`, beside `notes`:

```ts
  /**
   * How the coach files this drill: "rondo", "pressing", "u12". Optional
   * because most drills have none, and absent reads as empty.
   *
   * Held lowercase and deduplicated by `normaliseTags` on the way in. A tag
   * is a label rather than free text, and `Rondo` and `rondo` sitting in the
   * filter row as two chips is a bug whose cause is invisible to the person
   * looking at it.
   */
  tags?: string[]
```

- [ ] **Step 4: Validate, normalise and write**

In `src/composables/useStorage.ts`, add beside the other validators:

```ts
/**
 * Tags as they are stored: trimmed, lowercased, deduplicated, empties gone.
 *
 * Order is the coach's, not alphabetical — they typed it in the order they
 * think about the drill. `allTags` sorts for the filter row, where the order
 * is the app's business rather than theirs.
 */
export function normaliseTags(input: string[]): string[] {
  const out: string[] = []
  for (const raw of input) {
    const tag = raw.trim().toLowerCase()
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}
```

In `parsePattern`, after the `notes` check:

```ts
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || !value.tags.every((t) => typeof t === 'string')) {
      throw new Error('That pattern has damaged tags.')
    }
  }
```

`toPattern` builds from a `BoardSnapshot`, which carries no tags — the board
knows where the players stand, not how the drill is filed — so a pattern it
builds starts with none:

```ts
    tags: [],
```

Tags therefore survive a save because `savePattern` carries the existing
pattern's forward, not because `toPattern` found them:

```ts
  const pattern = toPattern(name, snap, existing?.id ?? id ?? makeId(), existing?.createdAt ?? nowIso())
  // Saving the board over a drill must not silently untag it. A brand new
  // drill has none, which is what `toPattern` already gave it.
  pattern.tags = existing?.tags ?? []
```

Then the two new functions, beside `renamePattern`:

```ts
function setTags(id: string, tags: string[]): void {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return
  }
  const pattern = patterns.find((p) => p.id === id)
  if (!pattern) return
  pattern.tags = normaliseTags(tags)
  pattern.updatedAt = nowIso()
  if (recordWrite(writeLibrary(patterns, damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length)
  }
}

/** Every tag in use, sorted. The filter row's order is the app's business. */
function allTags(): string[] {
  const tags = new Set<string>()
  for (const pattern of readLibrary().patterns) {
    for (const tag of pattern.tags ?? []) tags.add(tag)
  }
  return [...tags].sort()
}
```

Add both to the `storage` object at the bottom of the file.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/useStorage.tags.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. `useStorage.spec.ts` must be untouched — `tags` is additive.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/composables/useStorage.ts tests/useStorage.tags.spec.ts
git commit -m "feat: tags on a saved drill"
```

---

### Task 2: Extract the collection storage helper

**Files:**
- Create: `src/composables/collection.ts`
- Modify: `src/composables/useStorage.ts` — the pattern library reads and writes through the helper
- Test: `tests/collection.spec.ts`

**Interfaces:**
- Produces, from `src/composables/collection.ts`:
  - `type CollectionRead<T> = { items: T[]; unreadable: boolean; damaged: unknown[] }`
  - `readCollection<T>(key: string, parse: (value: unknown) => T): CollectionRead<T>`
  - `writeCollection<T>(key: string, items: T[], damaged: unknown[]): boolean`
  - `lastError: Ref<string | null>` and `lastWriteSucceeded: Ref<boolean>` — moved here, re-exported by `useStorage` so its public surface is unchanged
  - `damagedMessage(count: number): string`

This task changes no behaviour. `tests/useStorage.spec.ts` (94 tests) is the gate.

- [ ] **Step 1: Run the suite and record the baseline**

Run: `npm test`
Expected: PASS. Note the total.

- [ ] **Step 2: Write the failing test for the helper**

Create `tests/collection.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { readCollection, writeCollection, lastError } from '../src/composables/collection'

type Thing = { id: string; n: number }

function parseThing(value: unknown): Thing {
  if (typeof value !== 'object' || value === null) throw new Error('not a thing')
  const thing = value as Record<string, unknown>
  if (typeof thing.id !== 'string' || typeof thing.n !== 'number') throw new Error('not a thing')
  return { id: thing.id, n: thing.n }
}

const KEY = 'test.things'

beforeEach(() => {
  localStorage.clear()
  lastError.value = null
})

describe('readCollection', () => {
  it('reads an empty key as an empty collection', () => {
    expect(readCollection(KEY, parseThing)).toEqual({ items: [], unreadable: false, damaged: [] })
  })

  it('calls bad JSON unreadable rather than empty', () => {
    localStorage.setItem(KEY, '{oh no')
    expect(readCollection(KEY, parseThing).unreadable).toBe(true)
  })

  it('calls a non-array unreadable', () => {
    localStorage.setItem(KEY, '{"not":"an array"}')
    expect(readCollection(KEY, parseThing).unreadable).toBe(true)
  })

  it('separates the rows it cannot parse from the ones it can', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'a', n: 1 }, { broken: true }]))
    const read = readCollection(KEY, parseThing)

    expect(read.items).toEqual([{ id: 'a', n: 1 }])
    expect(read.damaged).toEqual([{ broken: true }])
    expect(read.unreadable).toBe(false)
  })
})

describe('writeCollection', () => {
  it('puts damaged rows back so they survive a write', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'a', n: 1 }, { broken: true }]))
    const read = readCollection(KEY, parseThing)

    writeCollection(KEY, [...read.items, { id: 'b', n: 2 }], read.damaged)

    const raw = JSON.parse(localStorage.getItem(KEY)!)
    expect(raw).toContainEqual({ broken: true })
    expect(raw).toContainEqual({ id: 'b', n: 2 })
  })

  it('reports a quota failure rather than throwing', () => {
    const setItem = localStorage.setItem
    localStorage.setItem = () => {
      const error = new Error('full')
      error.name = 'QuotaExceededError'
      throw error
    }

    expect(writeCollection(KEY, [{ id: 'a', n: 1 }], [])).toBe(false)
    expect(lastError.value).toContain('out of space')

    localStorage.setItem = setItem
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/collection.spec.ts`
Expected: FAIL — cannot resolve `../src/composables/collection`.

- [ ] **Step 4: Write the helper**

Create `src/composables/collection.ts`, moving the logic out of `useStorage.ts` unchanged:

```ts
import { ref } from 'vue'

/**
 * A stored collection: an array of entities under one localStorage key,
 * read and written with two disciplines the library has always had and the
 * sessions need identically.
 *
 * `unreadable` is the disaster case: the stored bytes could not be trusted at
 * all, and a caller that goes on to write would permanently destroy them.
 *
 * A `damaged` entry is the partial case: the rest is good and the coach must
 * still be able to save and delete, but the damaged rows are their work too,
 * so they ride along with every write rather than being dropped on the first
 * one. `writeCollection` takes them as an argument for that reason.
 */
export type CollectionRead<T> = {
  items: T[]
  unreadable: boolean
  damaged: unknown[]
}

export const lastError = ref<string | null>(null)

/**
 * Whether the most recent write actually reached localStorage. A caller that
 * wants to tell the coach "saved" has to know, because a write can be
 * refused (unreadable store) or fail (quota) while the caller still holds the
 * value it built in memory.
 */
export const lastWriteSucceeded = ref(true)

export function damagedMessage(count: number): string {
  return `${count} saved item(s) could not be read. They have been left untouched so they can be recovered.`
}

export function readCollection<T>(key: string, parse: (value: unknown) => T): CollectionRead<T> {
  const text = localStorage.getItem(key)
  // A key that was never written is an empty collection. A key holding the
  // literal `null` is not: something wrote it, and treating it as absent
  // would let the next write paint over whatever went wrong.
  if (text === null) return { items: [], unreadable: false, damaged: [] }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { items: [], unreadable: true, damaged: [] }
  }

  if (!Array.isArray(raw)) return { items: [], unreadable: true, damaged: [] }

  const items: T[] = []
  const damaged: unknown[] = []
  for (const entry of raw) {
    try {
      items.push(parse(entry))
    } catch {
      damaged.push(entry)
    }
  }
  return { items, unreadable: false, damaged }
}

export function writeRaw(key: string, value: unknown): boolean {
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

/**
 * Write the collection back, damaged rows included. Every write goes through
 * here so no code path can drop a row it merely failed to understand.
 */
export function writeCollection<T>(key: string, items: T[], damaged: unknown[]): boolean {
  return writeRaw(key, [...items, ...damaged])
}

/** Record whether a write landed, and say whether damaged rows rode through it. */
export function recordWrite(ok: boolean, damaged: unknown[]): boolean {
  lastWriteSucceeded.value = ok
  return ok && damaged.length > 0
}
```

- [ ] **Step 5: Run the helper's test**

Run: `npx vitest run tests/collection.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Point `useStorage` at the helper**

In `src/composables/useStorage.ts`:

```ts
import {
  damagedMessage,
  lastError,
  lastWriteSucceeded,
  readCollection,
  recordWrite,
  writeCollection,
  writeRaw,
} from './collection'
```

Delete the local `lastError`, `lastWriteSucceeded`, `readRaw`, `writeRaw`, `damagedMessage`, `recordWrite`, `readLibrary` and `writeLibrary` definitions, and replace the two library-specific ones with thin wrappers so no call site changes:

```ts
function readLibrary() {
  const { items, unreadable, damaged } = readCollection(PATTERNS_KEY, parsePattern)
  return { patterns: items, unreadable, damaged }
}

function writeLibrary(patterns: Pattern[], damaged: unknown[]): boolean {
  return writeCollection(PATTERNS_KEY, patterns, damaged)
}
```

`saveDraft` keeps using `writeRaw`, now imported. `lastError` and `lastWriteSucceeded` stay on the exported `storage` object, so every consumer is unchanged.

The library's own damaged message said "saved pattern(s)"; the shared one says "saved item(s)". If a test asserts the exact string, keep the library's wording by having `readLibrary`'s callers use a local `damagedMessage` — check with `grep -rn 'could not be read' tests/` before deciding.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, same total as Step 1. `useStorage.spec.ts` untouched.

- [ ] **Step 8: Commit**

```bash
git add src/composables/collection.ts src/composables/useStorage.ts tests/collection.spec.ts
git commit -m "refactor: one stored-collection helper behind the library"
```

---

### Task 3: Sessions storage

**Files:**
- Modify: `src/types.ts` — `SessionEntry`, `Session`
- Create: `src/composables/useSessions.ts`
- Test: `tests/useSessions.spec.ts`

**Interfaces:**
- Consumes: `readCollection`, `writeCollection`, `recordWrite`, `lastError` from Task 2.
- Produces, from `useSessions()`:
  - `SESSIONS_KEY = 'fct.sessions.v1'`
  - `parseSession(value: unknown): Session`
  - `listSessions(): Session[]`
  - `createSession(name: string): Session`
  - `saveSession(session: Session): void`
  - `deleteSession(id: string): void`
  - `renameSession(id: string, name: string): void`
  - `sessionsUsing(patternId: string): Session[]`
  - `totalMinutes(session: Session, known: Set<string>): number`

- [ ] **Step 1: Write the failing test**

Create `tests/useSessions.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSessions, SESSIONS_KEY } from '../src/composables/useSessions'
import type { Session } from '../src/types'

const sessions = useSessions()

beforeEach(() => {
  localStorage.clear()
  sessions.lastError.value = null
})

function withEntries(session: Session, entries: Array<{ patternId: string; minutes: number }>) {
  const full = { ...session, entries: entries.map((e, i) => ({ id: `e${i}`, ...e })) }
  sessions.saveSession(full)
  return full
}

describe('sessions storage', () => {
  it('starts empty', () => {
    expect(sessions.listSessions()).toEqual([])
  })

  it('round trips a session', () => {
    const created = sessions.createSession('Tuesday U12')
    withEntries(created, [{ patternId: 'p1', minutes: 12 }])

    const [read] = sessions.listSessions()
    expect(read.name).toBe('Tuesday U12')
    expect(read.entries).toEqual([{ id: 'e0', patternId: 'p1', minutes: 12 }])
    expect(read.version).toBe(1)
  })

  it('gives every entry its own id, so a drill can appear twice', () => {
    const created = sessions.createSession('Tuesday')
    const full = withEntries(created, [
      { patternId: 'p1', minutes: 10 },
      { patternId: 'p1', minutes: 5 },
    ])

    const ids = full.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('carries a damaged row through a write rather than dropping it', () => {
    const created = sessions.createSession('Tuesday')
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    raw.push({ garbage: true })
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(raw))

    sessions.renameSession(created.id, 'Wednesday')

    const after = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    expect(after).toContainEqual({ garbage: true })
    expect(sessions.listSessions()[0].name).toBe('Wednesday')
  })

  it('refuses to write over a store it could not read', () => {
    localStorage.setItem(SESSIONS_KEY, '{not json')

    sessions.createSession('Tuesday')

    expect(localStorage.getItem(SESSIONS_KEY)).toBe('{not json')
    expect(sessions.lastError.value).toContain('could not be read')
  })

  it('rejects an entry whose minutes are not a positive number', () => {
    const created = sessions.createSession('Tuesday')
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY)!)
    raw[0].entries = [{ id: 'e0', patternId: 'p1', minutes: 0 }]
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(raw))

    expect(sessions.listSessions()).toEqual([])
  })

  it('deletes', () => {
    const created = sessions.createSession('Tuesday')
    sessions.deleteSession(created.id)
    expect(sessions.listSessions()).toEqual([])
  })
})

describe('sessionsUsing', () => {
  it('finds every session holding a drill, counting it once per session', () => {
    const a = sessions.createSession('Tuesday')
    withEntries(a, [{ patternId: 'p1', minutes: 10 }, { patternId: 'p1', minutes: 5 }])
    const b = sessions.createSession('Thursday')
    withEntries(b, [{ patternId: 'p2', minutes: 10 }])

    expect(sessions.sessionsUsing('p1').map((s) => s.name)).toEqual(['Tuesday'])
    expect(sessions.sessionsUsing('p3')).toEqual([])
  })
})

describe('totalMinutes', () => {
  it('counts only the drills that still exist', () => {
    const created = sessions.createSession('Tuesday')
    const full = withEntries(created, [
      { patternId: 'p1', minutes: 12 },
      { patternId: 'gone', minutes: 20 },
    ])

    expect(sessions.totalMinutes(full, new Set(['p1']))).toBe(12)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/useSessions.spec.ts`
Expected: FAIL — cannot resolve `../src/composables/useSessions`.

- [ ] **Step 3: Add the types**

In `src/types.ts`:

```ts
/**
 * One drill in a session, and how long it runs.
 *
 * The id is the entry's own, not the drill's: a drill can appear twice in a
 * session — the warm-up rondo run again at the end is an ordinary session —
 * and keying a list render or a reorder on `patternId` breaks the moment it
 * does.
 */
export type SessionEntry = {
  id: string
  patternId: string
  /** Minutes. Validated like a frame's duration: finite and above zero. */
  minutes: number
}

/**
 * A training session: several drills, in order, with minutes against each.
 *
 * It references drills rather than containing them, so a drill fixed after
 * the session was built is fixed in the session too. The cost is an entry
 * that can point at a drill that is gone, which the interface renders as a
 * missing row rather than hiding.
 *
 * Its version is a separate line from `Pattern.version`. Sessions do not
 * contain patterns, so a change to the pattern format never changes this one.
 */
export type Session = {
  id: string
  name: string
  version: 1
  entries: SessionEntry[]
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 4: Write `useSessions.ts`**

```ts
import type { Session, SessionEntry } from '../types'
import {
  lastError,
  lastWriteSucceeded,
  readCollection,
  recordWrite,
  writeCollection,
} from './collection'

export const SESSIONS_KEY = 'fct.sessions.v1'

const SESSION_VERSION = 1

const UNREADABLE_MESSAGE =
  'Your saved sessions could not be read, so saving now would overwrite them. Export or clear them first, then try again.'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Minutes are held to what a frame's duration is held to: a finite number
 * above zero. It is the same kind of value with the same failure if it is
 * not one.
 */
function isValidEntry(value: unknown): value is SessionEntry {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.patternId === 'string' &&
    typeof value.minutes === 'number' &&
    Number.isFinite(value.minutes) &&
    value.minutes > 0
  )
}

export function parseSession(value: unknown): Session {
  if (!isObject(value)) throw new Error('That is not a saved session.')
  if (value.version !== SESSION_VERSION) {
    throw new Error('That session was saved by a different version of this app.')
  }
  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('That session is missing its name or id.')
  }
  if (!Array.isArray(value.entries) || !value.entries.every(isValidEntry)) {
    throw new Error('That session has a damaged drill.')
  }
  return value as unknown as Session
}

function read() {
  return readCollection(SESSIONS_KEY, parseSession)
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function newEntry(patternId: string, minutes: number): SessionEntry {
  return { id: makeId('e'), patternId, minutes }
}

/**
 * Write the sessions back, refusing when the store could not be read.
 *
 * Every mutator funnels through here so none of them can be the one that
 * forgets to check, which would destroy sessions the code merely failed to
 * parse.
 */
function mutate(change: (sessions: Session[]) => void): boolean {
  lastError.value = null
  const { items, unreadable, damaged } = read()
  if (unreadable) {
    lastError.value = UNREADABLE_MESSAGE
    lastWriteSucceeded.value = false
    return false
  }
  change(items)
  const ok = writeCollection(SESSIONS_KEY, items, damaged)
  if (recordWrite(ok, damaged)) {
    lastError.value = `${damaged.length} saved session(s) could not be read. They have been left untouched so they can be recovered.`
  }
  // `recordWrite` answers whether damaged rows rode along, not whether the
  // write landed — a quota failure would otherwise be reported as success.
  return ok
}

function listSessions(): Session[] {
  lastError.value = null
  const { items, unreadable, damaged } = read()
  if (unreadable) {
    lastError.value =
      'Your saved sessions could not be read. The stored data has been left untouched so it can be recovered.'
    return []
  }
  if (damaged.length > 0) {
    lastError.value = `${damaged.length} saved session(s) could not be read. They have been left untouched so they can be recovered.`
  }
  return items
}

function createSession(name: string): Session {
  const session: Session = {
    id: makeId('s'),
    name,
    version: SESSION_VERSION,
    entries: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  mutate((sessions) => sessions.push(session))
  return session
}

function saveSession(session: Session): void {
  mutate((sessions) => {
    const next = { ...session, updatedAt: nowIso() }
    const index = sessions.findIndex((s) => s.id === session.id)
    if (index === -1) sessions.push(next)
    else sessions[index] = next
  })
}

function deleteSession(id: string): void {
  mutate((sessions) => {
    const index = sessions.findIndex((s) => s.id === id)
    if (index !== -1) sessions.splice(index, 1)
  })
}

function renameSession(id: string, name: string): void {
  mutate((sessions) => {
    const session = sessions.find((s) => s.id === id)
    if (session) {
      session.name = name
      session.updatedAt = nowIso()
    }
  })
}

/**
 * Every session holding this drill, once each however many times it appears.
 *
 * Backs the warning shown before a drill is deleted. It reads one key at a
 * moment the coach has already paused over a confirmation, so its cost does
 * not matter.
 */
function sessionsUsing(patternId: string): Session[] {
  return read().items.filter((session) =>
    session.entries.some((entry) => entry.patternId === patternId),
  )
}

/**
 * How long the session runs, counting only drills that still exist.
 *
 * A missing drill contributes nothing: it will not be run, and it is not in
 * the PDF, so counting its minutes would promise the coach time they are not
 * going to spend.
 */
function totalMinutes(session: Session, known: Set<string>): number {
  return session.entries
    .filter((entry) => known.has(entry.patternId))
    .reduce((sum, entry) => sum + entry.minutes, 0)
}

const api = {
  listSessions,
  createSession,
  saveSession,
  deleteSession,
  renameSession,
  sessionsUsing,
  totalMinutes,
  newEntry,
  lastError,
  lastWriteSucceeded,
}

export function useSessions() {
  return api
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/useSessions.spec.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/composables/useSessions.ts tests/useSessions.spec.ts
git commit -m "feat: a saved session of drills"
```

---

### Task 4: Warn before deleting a drill a session uses

**Files:**
- Modify: `src/components/PatternLibrary.vue` — the delete confirmation
- Test: `tests/PatternLibrary.spec.ts` — add to the existing file

**Interfaces:**
- Consumes: `sessionsUsing` from Task 3.
- Produces: nothing new; the confirm row gains a `[data-usage-warning]` element.

- [ ] **Step 1: Write the failing test**

Add to `tests/PatternLibrary.spec.ts`:

```ts
it('says how many sessions use a drill before deleting it', async () => {
  const saved = storage.savePattern('Rondo', useBoard().snapshot())
  const sessions = useSessions()
  const session = sessions.createSession('Tuesday')
  sessions.saveSession({ ...session, entries: [sessions.newEntry(saved.id, 12)] })

  const wrapper = mount(PatternLibrary, { props: { open: true } })
  await wrapper.find('[data-delete]').trigger('click')

  expect(wrapper.find('[data-usage-warning]').text()).toContain('1 session')
})

it('says nothing when no session uses it', async () => {
  storage.savePattern('Rondo', useBoard().snapshot())

  const wrapper = mount(PatternLibrary, { props: { open: true } })
  await wrapper.find('[data-delete]').trigger('click')

  expect(wrapper.find('[data-usage-warning]').exists()).toBe(false)
})
```

Add the imports the file needs at the top: `import { useSessions } from '../src/composables/useSessions'`.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/PatternLibrary.spec.ts`
Expected: FAIL — `[data-usage-warning]` not found.

- [ ] **Step 3: Implement**

In `PatternLibrary.vue`'s script:

```ts
import { useSessions } from '../composables/useSessions'

const sessions = useSessions()

/**
 * How many sessions hold the drill awaiting confirmation.
 *
 * Computed at the moment of asking rather than kept alongside the list: a
 * session can be edited in another panel between the library opening and the
 * coach reaching for Delete.
 */
const usageCount = computed(() =>
  confirmingId.value === null ? 0 : sessions.sessionsUsing(confirmingId.value).length,
)
```

In the confirming branch of the template, between the name and the buttons:

```vue
<span v-if="usageCount > 0" data-usage-warning class="warning">
  Used in {{ usageCount }} session{{ usageCount === 1 ? '' : 's' }}.
</span>
```

And a style beside the others:

```css
.warning { color: #ffcc80; font-size: 0.8rem; }
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/PatternLibrary.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PatternLibrary.vue tests/PatternLibrary.spec.ts
git commit -m "feat: warn when deleting a drill a session uses"
```

---

### Task 5: Export and import both collections in one file

**Files:**
- Modify: `src/composables/useStorage.ts` — `exportPatternsJson` becomes `exportBundleJson`; `importPatterns` becomes `importBundle`
- Modify: `src/App.vue:253,258` — the two call sites
- Test: `tests/useStorage.bundle.spec.ts`

**Interfaces:**
- Produces:
  - `storage.exportBundleJson(patterns: Pattern[], sessions: Session[]): string` — `{ patterns, sessions }`
  - `storage.importBundle(json: string): { patterns: Pattern[]; sessions: Session[] }`

- [ ] **Step 1: Write the failing test**

Create `tests/useStorage.bundle.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PATTERNS_KEY, useStorage } from '../src/composables/useStorage'
import { SESSIONS_KEY, useSessions } from '../src/composables/useSessions'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

const storage = useStorage()
const sessions = useSessions()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function bundleOfOneSession() {
  const pattern = storage.savePattern('Rondo', useBoard().snapshot())
  const session = sessions.createSession('Tuesday')
  sessions.saveSession({ ...session, entries: [sessions.newEntry(pattern.id, 12)] })
  return { json: storage.exportBundleJson(storage.listPatterns(), sessions.listSessions()), patternId: pattern.id }
}

describe('bundle export and import', () => {
  it('writes both collections', () => {
    const { json } = bundleOfOneSession()
    const raw = JSON.parse(json)

    expect(raw.patterns).toHaveLength(1)
    expect(raw.sessions).toHaveLength(1)
  })

  it('round trips into an empty library', () => {
    const { json } = bundleOfOneSession()
    localStorage.clear()

    storage.importBundle(json)

    expect(storage.listPatterns()).toHaveLength(1)
    expect(sessions.listSessions()[0].entries[0].patternId).toBe(storage.listPatterns()[0].id)
  })

  it('re-ids a colliding pattern and follows it through the session', () => {
    const { json, patternId } = bundleOfOneSession()

    // Import onto a library that already holds that exact id.
    storage.importBundle(json)

    const patterns = storage.listPatterns()
    expect(patterns).toHaveLength(2)

    const added = patterns.find((p) => p.id !== patternId)!
    const imported = sessions.listSessions().find((s) => s.entries[0].patternId === added.id)

    expect(imported).toBeTruthy()
    expect(added.id).not.toBe(patternId)
  })

  it('refuses a bare array, which is not a bundle', () => {
    expect(() => storage.importBundle('[]')).toThrow(/not a saved bundle/i)
  })

  it('writes nothing when the sessions store cannot be read', () => {
    const { json } = bundleOfOneSession()
    const patternsBefore = localStorage.getItem(PATTERNS_KEY)
    localStorage.setItem(SESSIONS_KEY, '{not json')

    expect(() => storage.importBundle(json)).toThrow(/sessions could not be read/i)

    // Both stores untouched: the check runs before either write, so a bad
    // sessions store cannot leave patterns imported and sessions destroyed.
    expect(localStorage.getItem(SESSIONS_KEY)).toBe('{not json')
    expect(localStorage.getItem(PATTERNS_KEY)).toBe(patternsBefore)
  })

  it('re-ids the second of two sessions sharing an id within one file', () => {
    const { json } = bundleOfOneSession()
    const raw = JSON.parse(json)
    raw.sessions.push({ ...raw.sessions[0] })
    localStorage.clear()

    const { sessions: added } = storage.importBundle(JSON.stringify(raw))

    expect(new Set(added.map((s) => s.id)).size).toBe(2)
  })

  it('refuses invalid JSON with a readable reason', () => {
    expect(() => storage.importBundle('{oh no')).toThrow(/not valid JSON/i)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/useStorage.bundle.spec.ts`
Expected: FAIL — `exportBundleJson` is not a function.

- [ ] **Step 3: Implement**

Replace `exportPatternsJson` and `importPatterns` in `useStorage.ts`:

```ts
import { parseSession, SESSIONS_KEY } from './useSessions'
import type { Session } from '../types'

function exportBundleJson(patterns: Pattern[], sessions: Session[]): string {
  return JSON.stringify({ patterns, sessions }, null, 2)
}

/**
 * Validate an exported file whole, then merge both collections.
 *
 * A pattern whose id already exists is added under a NEW id with a suffixed
 * name, so importing can never silently overwrite the coach's work. That
 * re-idding is why sessions cannot simply be written as they arrive: every
 * `patternId` in the file would point at an id that had just changed, and
 * the coach would open a session of entirely missing drills. The remap
 * threads the new ids through the incoming entries before they land.
 */
function importBundle(json: string): { patterns: Pattern[]; sessions: Session[] } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!isObject(raw) || !Array.isArray(raw.patterns) || !Array.isArray(raw.sessions)) {
    throw new Error('That file is not a saved bundle of drills and sessions.')
  }

  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    throw new Error(
      'Your saved patterns could not be read, so importing now would overwrite them. Export or clear your saved patterns first, then try again.',
    )
  }

  // Normalised on the way in, exactly as `toPattern` does on the way out. A
  // file can be hand-edited or written by an older build, and `parsePattern`
  // only asks that tags be strings — ' Rondo ' and 'rondo' arriving together
  // would put two chips in the filter row for one tag.
  const incoming = raw.patterns.map((entry) => {
    const pattern = parsePattern(entry)
    return { ...pattern, tags: normaliseTags(pattern.tags ?? []) }
  })
  const incomingSessions = raw.sessions.map((entry) => parseSession(entry))

  const seenIds = new Set(patterns.map((p) => p.id))
  const remap = new Map<string, string>()
  const added: Pattern[] = []

  for (const pattern of incoming) {
    if (!seenIds.has(pattern.id)) {
      seenIds.add(pattern.id)
      added.push(pattern)
      continue
    }
    const fresh = makeId()
    remap.set(pattern.id, fresh)
    seenIds.add(fresh)
    added.push({ ...pattern, id: fresh, name: `${pattern.name} (imported)` })
  }

  // The sessions store is read BEFORE either write, so an unreadable one
  // aborts the whole import rather than leaving patterns written and sessions
  // destroyed. Nothing has been written at this point, so throwing is clean.
  const sessionRead = readCollection(SESSIONS_KEY, parseSession)
  if (sessionRead.unreadable) {
    throw new Error(
      'Your saved sessions could not be read, so importing now would overwrite them. Export or clear your saved sessions first, then try again.',
    )
  }

  // Patterns first, deliberately. localStorage has no transaction, so if the
  // second write fails the import is partial either way — and patterns without
  // their sessions is the additive half. Sessions landing first would leave
  // entries pointing at drills that were never written: rows the coach has to
  // clear by hand.
  if (!recordWrite(writeLibrary([...patterns, ...added], damaged), damaged)) {
    throw new Error('The imported drills could not be saved to this browser.')
  }

  const sessionIds = new Set(sessionRead.items.map((s) => s.id))
  const addedSessions = incomingSessions.map((session) => {
    // Tracked incrementally, exactly as the pattern loop above tracks
    // `seenIds`: a collision can be with the stored sessions OR with an
    // earlier session in this same file, and two sessions sharing an id
    // would render under duplicate keys and have rename and delete hit
    // whichever one `find` returned first.
    const id = sessionIds.has(session.id) ? makeId() : session.id
    sessionIds.add(id)
    return {
      ...session,
      id,
      entries: session.entries.map((entry) => ({
        ...entry,
        patternId: remap.get(entry.patternId) ?? entry.patternId,
      })),
    }
  })

  if (
    !recordWrite(
      writeCollection(SESSIONS_KEY, [...sessionRead.items, ...addedSessions], sessionRead.damaged),
      sessionRead.damaged,
    )
  ) {
    throw new Error('The imported sessions could not be saved to this browser.')
  }

  return { patterns: added, sessions: addedSessions }
}
```

Update the `storage` object's keys, then `src/App.vue`:

```ts
exporter.downloadText(
  storage.exportBundleJson(patterns, sessions.listSessions()),
  'tactics-patterns.json',
)
```

and the import call site to `storage.importBundle(text)`, keeping whatever notice it already shows.

- [ ] **Step 4: Run the test, then the suite**

Run: `npx vitest run tests/useStorage.bundle.spec.ts`
Expected: PASS, 5 tests.

Run: `npm test`
Expected: PASS. `useStorage.spec.ts` tests naming `importPatterns` or `exportPatternsJson` must be renamed to the new functions — this is a deliberate rename, not a regression, and the assertions inside them should not change.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useStorage.ts src/App.vue tests/useStorage.bundle.spec.ts tests/useStorage.spec.ts
git commit -m "feat: export drills and sessions in one file"
```

---

### Task 6: Choosing which frames the PDF shows

**Files:**
- Create: `src/sessionPdf.ts` — sampling only for now
- Test: `tests/sessionPdf.frames.spec.ts`

**Interfaces:**
- Produces: `sampleFrameIndices(count: number): number[]`

- [ ] **Step 1: Write the failing test**

Create `tests/sessionPdf.frames.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sampleFrameIndices } from '../src/sessionPdf'

describe('sampleFrameIndices', () => {
  it('takes every frame when there are four or fewer', () => {
    expect(sampleFrameIndices(1)).toEqual([0])
    expect(sampleFrameIndices(2)).toEqual([0, 1])
    expect(sampleFrameIndices(3)).toEqual([0, 1, 2])
    expect(sampleFrameIndices(4)).toEqual([0, 1, 2, 3])
  })

  it('takes the start, the end and two evenly between', () => {
    expect(sampleFrameIndices(7)).toEqual([0, 2, 4, 6])
    expect(sampleFrameIndices(10)).toEqual([0, 3, 6, 9])
  })

  it('always includes the first and the last', () => {
    for (const n of [5, 6, 8, 9, 13, 20]) {
      const picked = sampleFrameIndices(n)
      expect(picked[0]).toBe(0)
      expect(picked[picked.length - 1]).toBe(n - 1)
      expect(picked).toHaveLength(4)
    }
  })

  it('never repeats an index', () => {
    for (const n of [5, 6, 7, 8]) {
      const picked = sampleFrameIndices(n)
      expect(new Set(picked).size).toBe(picked.length)
    }
  })

  it('treats an empty drill as nothing to draw', () => {
    expect(sampleFrameIndices(0)).toEqual([])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/sessionPdf.frames.spec.ts`
Expected: FAIL — cannot resolve `../src/sessionPdf`.

- [ ] **Step 3: Implement**

Create `src/sessionPdf.ts`:

```ts
/** How many moments of a drill a PDF page shows. */
export const FRAMES_PER_DRILL = 4

/**
 * Which frames of a drill the PDF prints: the first, the last, and two
 * evenly spaced between them.
 *
 * A page is still and a drill is not, so something has to be dropped. The
 * ends are what a coach reads a drill by — where it starts and where it
 * finishes — and two in between are enough to show which way the movement
 * went. The captions name the true total, so a page that skipped frames says
 * so rather than implying the drill has four.
 */
export function sampleFrameIndices(count: number): number[] {
  if (count <= 0) return []
  if (count <= FRAMES_PER_DRILL) return Array.from({ length: count }, (_, i) => i)
  const last = count - 1
  return Array.from({ length: FRAMES_PER_DRILL }, (_, i) =>
    Math.round((i * last) / (FRAMES_PER_DRILL - 1)),
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/sessionPdf.frames.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sessionPdf.ts tests/sessionPdf.frames.spec.ts
git commit -m "feat: choose which frames of a drill a page shows"
```

---

### Task 7: Rasterise a frame of a drill that is not open

**Files:**
- Create: `src/composables/renderFrame.ts`
- Test: `tests/renderFrame.spec.ts`

**Interfaces:**
- Consumes: `BoardView` (from the extraction plan), `svgToPngBlob` from `useExport`, `patternToSnapshot` from `useStorage`.
- Produces: `renderFrameToDataUrl(pattern: Pattern, frameIndex: number, pixelWidth?: number): Promise<string>`

- [ ] **Step 1: Write the failing test**

Create `tests/renderFrame.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderFrameToDataUrl } from '../src/composables/renderFrame'
import { useStorage } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  capturedSvg = null
  rasterise.mockReset()
  rasterise.mockImplementation(async (svg: SVGSVGElement) => {
    capturedSvg = svg
    return new Blob(['png'], { type: 'image/png' })
  })
})

// jsdom cannot rasterise: canvas has no 2d context here. The point of these
// tests is the mounting and unmounting around it, so the rasteriser is stood
// in for and inspected.
//
// ONE shared mock, hoisted, because `vi.mock` is hoisted above the imports and
// `useExport()` is called afresh on every render. Building the mock inside the
// factory would hand each call its own `vi.fn`, so a rejection armed on one
// would never reach the next — and the unmount-on-failure test below would
// pass while exercising nothing.
const { rasterise } = vi.hoisted(() => ({ rasterise: vi.fn() }))

vi.mock('../src/composables/useExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composables/useExport')>()
  return {
    ...actual,
    useExport: () => ({ ...actual.useExport(), svgToPngBlob: rasterise }),
  }
})

let capturedSvg: SVGSVGElement | null = null

describe('renderFrameToDataUrl', () => {
  it('rasterises the frame asked for, not the one on screen', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.addFrame()
    board.addCounter('blue')
    const pattern = storage.savePattern('Two phases', board.snapshot())

    await renderFrameToDataUrl(pattern, 0)

    expect(capturedSvg!.querySelectorAll('[data-counter]')).toHaveLength(1)

    await renderFrameToDataUrl(pattern, 1)

    expect(capturedSvg!.querySelectorAll('[data-counter]')).toHaveLength(2)
  })

  it('carries no furniture: no handles, no marquee, no selection rings', async () => {
    const board = useBoard()
    board.addCounter('red')
    const pattern = storage.savePattern('One', board.snapshot())

    await renderFrameToDataUrl(pattern, 0)

    expect(capturedSvg!.querySelector('[data-bend-handle]')).toBeNull()
    expect(capturedSvg!.querySelector('[data-marquee]')).toBeNull()
    expect(capturedSvg!.querySelector('[data-selected-token]')).toBeNull()
  })

  it('leaves nothing mounted in the document behind it', async () => {
    const board = useBoard()
    const pattern = storage.savePattern('One', board.snapshot())
    const before = document.body.childElementCount

    await renderFrameToDataUrl(pattern, 0)

    expect(document.body.childElementCount).toBe(before)
  })

  it('unmounts even when the rasteriser throws', async () => {
    const board = useBoard()
    const pattern = storage.savePattern('One', board.snapshot())
    const before = document.body.childElementCount

    rasterise.mockRejectedValueOnce(new Error('no canvas'))

    await expect(renderFrameToDataUrl(pattern, 0)).rejects.toThrow('no canvas')
    expect(document.body.childElementCount).toBe(before)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/renderFrame.spec.ts`
Expected: FAIL — cannot resolve `../src/composables/renderFrame`.

- [ ] **Step 3: Implement**

Create `src/composables/renderFrame.ts`:

```ts
import { createApp } from 'vue'
import type { Pattern } from '../types'
import BoardView from '../components/BoardView.vue'
import { useExport } from './useExport'
import { useStorage } from './useStorage'

/**
 * How wide a rasterised board is, in pixels.
 *
 * Half what the PNG export uses. Each board occupies roughly a quarter of a
 * PDF page, and four frames across several drills is a great deal of canvas
 * work to do at twice the necessary resolution.
 */
export const SESSION_BOARD_WIDTH = 800

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The board could not be converted to an image.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Draw one frame of a saved drill and return it as a PNG data URL.
 *
 * The drill need not be open. A BoardView is mounted into a detached element,
 * rasterised and thrown away, so the board the coach is working on is never
 * touched — which is why a session export needs no lock, and why a failure
 * halfway through cannot strand them mid-drill.
 *
 * A detached node rasterises identically to a live one: the serialiser reads
 * the markup and the viewBox attribute, and never asks the browser for layout.
 *
 * Notes are deliberately not passed to `svgToPngBlob`. It bakes them into
 * pixels beneath the board because a still image has nowhere else to put
 * them; a PDF does, and text drawn by the PDF stays selectable and sharp.
 */
export async function renderFrameToDataUrl(
  pattern: Pattern,
  frameIndex: number,
  pixelWidth = SESSION_BOARD_WIDTH,
): Promise<string> {
  const snapshot = useStorage().patternToSnapshot(pattern)
  const frame = snapshot.frames[frameIndex]
  if (!frame) throw new Error('That drill has no such phase.')

  const host = document.createElement('div')
  const app = createApp(BoardView, {
    frame,
    pitch: snapshot.pitch,
    labelsVisible: snapshot.labelsVisible,
    ballsVisible: snapshot.ballsVisible,
  })

  try {
    const instance = app.mount(host) as unknown as { svgEl: SVGSVGElement }
    const blob = await useExport().svgToPngBlob(instance.svgEl, '', pixelWidth)
    return await blobToDataUrl(blob)
  } finally {
    app.unmount()
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/renderFrame.spec.ts`
Expected: PASS, 4 tests.

If the mock shape fights vitest, simplify: export an injectable `rasterise` from this module and have the test pass its own. Do not change what the module does to make it testable in a way that weakens the real path.

- [ ] **Step 5: Commit**

```bash
git add src/composables/renderFrame.ts tests/renderFrame.spec.ts
git commit -m "feat: rasterise a frame of a drill that is not open"
```

---

### Task 8: Build the PDF

**Files:**
- Modify: `package.json` — add `jspdf`
- Modify: `src/sessionPdf.ts` — the builder
- Test: `tests/sessionPdf.spec.ts`

**Interfaces:**
- Consumes: `sampleFrameIndices` (Task 6), `renderFrameToDataUrl` (Task 7), `Session`/`Pattern` types.
- Produces:
  - `buildSessionPdf(input: { session: Session; patterns: Pattern[]; onProgress?: (done: number, total: number) => void }): Promise<Blob>`

- [ ] **Step 1: Install jsPDF**

Run: `npm install --save-exact jspdf@4.2.1`
Expected: `package.json` shows `"jspdf": "4.2.1"` with no `^`.

- [ ] **Step 2: Write the failing test**

Create `tests/sessionPdf.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Pattern, Session } from '../src/types'

const calls = {
  text: [] as string[],
  images: 0,
  pages: 0,
}

vi.mock('jspdf', () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }
    setFontSize() { return this }
    setTextColor() { return this }
    text(value: string | string[]) {
      calls.text.push(...(Array.isArray(value) ? value : [value]))
      return this
    }
    addImage() { calls.images += 1; return this }
    addPage() { calls.pages += 1; return this }
    splitTextToSize(text: string) { return [text] }
    output() { return new Blob(['pdf'], { type: 'application/pdf' }) }
  }
  return { jsPDF: FakeDoc, default: FakeDoc }
})

vi.mock('../src/composables/renderFrame', () => ({
  renderFrameToDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
  SESSION_BOARD_WIDTH: 800,
}))

import { buildSessionPdf } from '../src/sessionPdf'
import { renderFrameToDataUrl } from '../src/composables/renderFrame'

function pattern(over: Partial<Pattern> = {}): Pattern {
  return {
    id: 'p1',
    name: 'Rondo 4v2',
    version: 3,
    pitch: { type: 'blank', rotated: false },
    frames: [{ counters: [], markers: [], labels: [], balls: [], drawings: [] }],
    notes: '',
    notesVisible: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function session(entries: Session['entries']): Session {
  return {
    id: 's1',
    name: 'Tuesday U12',
    version: 1,
    entries,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  calls.text = []
  calls.images = 0
  calls.pages = 0
  vi.clearAllMocks()
})

describe('buildSessionPdf', () => {
  it('opens with the session name and its totals', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'p1', minutes: 12 },
        { id: 'e2', patternId: 'p2', minutes: 20 },
      ]),
      patterns: [pattern(), pattern({ id: 'p2', name: 'Pressing trap' })],
    })

    const joined = calls.text.join(' | ')
    expect(joined).toContain('Tuesday U12')
    expect(joined).toContain('2 drills')
    expect(joined).toContain('32 min')
  })

  it('gives each drill its own page', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'p1', minutes: 12 },
        { id: 'e2', patternId: 'p2', minutes: 20 },
      ]),
      patterns: [pattern(), pattern({ id: 'p2', name: 'Pressing trap' })],
    })

    // The cover, then one page per drill.
    expect(calls.pages).toBe(2)
  })

  it('draws up to four boards for a drill, and says which of how many', async () => {
    const frames = Array.from({ length: 7 }, () => ({
      counters: [], markers: [], labels: [], balls: [], drawings: [],
    }))

    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern({ frames })],
    })

    expect(calls.images).toBe(4)
    expect(calls.text.join(' | ')).toContain('Phase 3 of 7')
  })

  it('skips a drill that is no longer in the library, and does not count its minutes', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'p1', minutes: 12 },
        { id: 'e2', patternId: 'gone', minutes: 20 },
      ]),
      patterns: [pattern()],
    })

    const joined = calls.text.join(' | ')
    expect(joined).toContain('12 min')
    expect(joined).not.toContain('32 min')
    expect(calls.pages).toBe(1)
  })

  it('prints no notes for a drill whose notes are hidden', async () => {
    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern({ notes: 'secret coaching point', notesVisible: false })],
    })

    expect(calls.text.join(' | ')).not.toContain('secret coaching point')
  })

  it('reports progress as it goes', async () => {
    const onProgress = vi.fn()

    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern()],
      onProgress,
    })

    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('rasterises through renderFrameToDataUrl rather than the live board', async () => {
    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern()],
    })

    expect(renderFrameToDataUrl).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run tests/sessionPdf.spec.ts`
Expected: FAIL — `buildSessionPdf` is not exported.

- [ ] **Step 4: Implement the builder**

Append to `src/sessionPdf.ts`:

```ts
import { jsPDF } from 'jspdf'
import type { Pattern, Session } from './types'
import { renderFrameToDataUrl } from './composables/renderFrame'

const MARGIN = 15
const GUTTER = 6
/** Pitch aspect: 100 by 64.76 units. */
const BOARD_ASPECT = 100 / 64.76

export type SessionPdfInput = {
  session: Session
  patterns: Pattern[]
  onProgress?: (done: number, total: number) => void
}

/**
 * The board images for one drill, laid out to fill the width they are given.
 *
 * A single-frame drill gets the whole width: a shape or a set piece is the
 * ordinary case for one frame, and it deserves the large picture rather than
 * a quarter page beside three holes.
 */
function gridFor(count: number, width: number) {
  const columns = count === 1 ? 1 : 2
  const cellWidth = (width - GUTTER * (columns - 1)) / columns
  return { columns, cellWidth, cellHeight: cellWidth / BOARD_ASPECT }
}

export async function buildSessionPdf({
  session,
  patterns,
  onProgress,
}: SessionPdfInput): Promise<Blob> {
  const byId = new Map(patterns.map((p) => [p.id, p]))
  const live = session.entries.filter((entry) => byId.has(entry.patternId))
  const missing = session.entries.length - live.length
  const minutes = live.reduce((sum, entry) => sum + entry.minutes, 0)

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - MARGIN * 2

  // Cover.
  doc.setFontSize(22)
  doc.text(session.name, MARGIN, MARGIN + 8)
  doc.setFontSize(11)
  // The session's own last-edited date rather than today's: two coaches
  // printing the same plan a week apart should get the same document, and
  // what dates a plan is when it was last changed.
  doc.text(
    `${new Date(session.updatedAt).toLocaleDateString()} · ${live.length} drill${live.length === 1 ? '' : 's'} · ${minutes} min`,
    MARGIN,
    MARGIN + 18,
  )
  if (missing > 0) {
    doc.text(
      `${missing} drill${missing === 1 ? '' : 's'} no longer in your library, not included.`,
      MARGIN,
      MARGIN + 25,
    )
  }

  let y = MARGIN + 38
  doc.setFontSize(12)
  live.forEach((entry, index) => {
    const pattern = byId.get(entry.patternId)!
    doc.text(`${index + 1}. ${pattern.name} — ${entry.minutes} min`, MARGIN, y)
    y += 7
  })

  for (const [index, entry] of live.entries()) {
    const pattern = byId.get(entry.patternId)!
    doc.addPage()

    doc.setFontSize(16)
    doc.text(`${index + 1}. ${pattern.name} — ${entry.minutes} min`, MARGIN, MARGIN + 6)

    const tags = pattern.tags ?? []
    let top = MARGIN + 12
    if (tags.length > 0) {
      doc.setFontSize(9)
      doc.text(tags.join(' · '), MARGIN, top)
      top += 6
    }

    const picked = sampleFrameIndices(pattern.frames.length)
    const { columns, cellWidth, cellHeight } = gridFor(picked.length, contentWidth)

    for (const [slot, frameIndex] of picked.entries()) {
      const image = await renderFrameToDataUrl(pattern, frameIndex)
      const column = slot % columns
      const row = Math.floor(slot / columns)
      const x = MARGIN + column * (cellWidth + GUTTER)
      const cellTop = top + row * (cellHeight + GUTTER + 5)

      doc.addImage(image, 'PNG', x, cellTop, cellWidth, cellHeight)
      doc.setFontSize(9)
      doc.text(
        `Phase ${frameIndex + 1} of ${pattern.frames.length}`,
        x,
        cellTop + cellHeight + 4,
      )
    }

    const rows = Math.ceil(picked.length / columns)
    const notesTop = top + rows * (cellHeight + GUTTER + 5) + 4

    // Notes the coach has turned off are off everywhere. A session that
    // reinstated them would export something they had explicitly hidden.
    const notes = pattern.notesVisible === false ? '' : (pattern.notes ?? '')
    if (notes.trim()) {
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(notes, contentWidth) as string[]
      const room = Math.max(0, Math.floor((doc.internal.pageSize.getHeight() - MARGIN - notesTop) / 5))
      doc.text(lines.slice(0, room), MARGIN, notesTop)
      if (lines.length > room) {
        doc.text('Notes continue in the app.', MARGIN, notesTop + room * 5)
      }
    }

    onProgress?.(index + 1, live.length)
  }

  return doc.output('blob') as Blob
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/sessionPdf.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/sessionPdf.ts tests/sessionPdf.spec.ts
git commit -m "feat: build a session as one PDF"
```

---

### Task 9: The tag filter, and tagging a drill

**Files:**
- Create: `src/components/TagFilter.vue`
- Modify: `src/components/PatternLibrary.vue`
- Test: `tests/TagFilter.spec.ts`, and additions to `tests/PatternLibrary.spec.ts`

**Interfaces:**
- Produces:
  - `TagFilter` props: `{ tags: string[]; selected: string[] }`
  - `TagFilter` emits: `update: [selected: string[]]`
  - `matchesTags(pattern: Pattern, selected: string[]): boolean` exported from `src/components/TagFilter.vue`'s sibling — put it in `src/composables/useStorage.ts` beside `normaliseTags` to keep components free of logic

- [ ] **Step 1: Write the failing tests**

Create `tests/TagFilter.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TagFilter from '../src/components/TagFilter.vue'

describe('TagFilter', () => {
  it('shows a chip per tag', () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo', 'pressing'], selected: [] } })
    expect(wrapper.findAll('[data-tag-chip]')).toHaveLength(2)
  })

  it('shows nothing at all when no drill has a tag', () => {
    const wrapper = mount(TagFilter, { props: { tags: [], selected: [] } })
    expect(wrapper.find('[data-tag-chip]').exists()).toBe(false)
  })

  it('adds a tag to the selection when its chip is pressed', async () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo', 'pressing'], selected: [] } })
    await wrapper.findAll('[data-tag-chip]')[0].trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual(['rondo'])
  })

  it('takes a tag back out when its chip is pressed again', async () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo'], selected: ['rondo'] } })
    await wrapper.find('[data-tag-chip]').trigger('click')

    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([])
  })

  it('marks the chosen chips', () => {
    const wrapper = mount(TagFilter, { props: { tags: ['rondo', 'pressing'], selected: ['rondo'] } })
    expect(wrapper.findAll('[data-tag-chip]')[0].classes()).toContain('chip--on')
  })
})
```

Add to `tests/PatternLibrary.spec.ts`:

```ts
it('narrows the list to drills carrying every chosen tag', async () => {
  const a = storage.savePattern('Rondo', useBoard().snapshot())
  const b = storage.savePattern('Pressing trap', useBoard().snapshot())
  storage.setTags(a.id, ['rondo', 'u12'])
  storage.setTags(b.id, ['pressing', 'u12'])

  const wrapper = mount(PatternLibrary, { props: { open: true } })
  expect(wrapper.findAll('[data-pattern]')).toHaveLength(2)

  const chips = wrapper.findAll('[data-tag-chip]')
  const rondo = chips.find((c) => c.text() === 'rondo')!
  await rondo.trigger('click')

  expect(wrapper.findAll('[data-pattern]')).toHaveLength(1)
  expect(wrapper.find('[data-pattern]').text()).toContain('Rondo')
})

it('edits a drill’s tags', async () => {
  const saved = storage.savePattern('Rondo', useBoard().snapshot())

  const wrapper = mount(PatternLibrary, { props: { open: true } })
  await wrapper.find('[data-tags]').trigger('click')
  await wrapper.find('[data-tags-input]').setValue('Rondo, warm up')
  await wrapper.find('[data-tags-save]').trigger('click')

  expect(storage.listPatterns()[0].tags).toEqual(['rondo', 'warm up'])
  expect(saved.id).toBeTruthy()
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/TagFilter.spec.ts tests/PatternLibrary.spec.ts`
Expected: FAIL — cannot resolve `TagFilter`; `[data-tags]` not found.

- [ ] **Step 3: Write `TagFilter.vue`**

```vue
<script setup lang="ts">
const props = defineProps<{ tags: string[]; selected: string[] }>()
const emit = defineEmits<{ update: [selected: string[]] }>()

/**
 * Chips toggle rather than replace, and combine with AND. "rondo" and "u12"
 * together is the question a coach with fifty drills is actually asking; a
 * chip that cleared the others would make that question unaskable.
 */
function toggle(tag: string) {
  emit(
    'update',
    props.selected.includes(tag)
      ? props.selected.filter((t) => t !== tag)
      : [...props.selected, tag],
  )
}
</script>

<template>
  <!-- Nothing at all until a drill has a tag: an empty row is furniture. -->
  <div v-if="tags.length > 0" class="row">
    <button
      v-for="tag in tags"
      :key="tag"
      data-tag-chip
      class="chip"
      :class="{ 'chip--on': selected.includes(tag) }"
      @click="toggle(tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.6rem; }
.chip {
  border: 1px solid #ffffff40; background: #455a64; color: inherit;
  border-radius: 0.8rem; padding: 0.25rem 0.6rem; cursor: pointer; font-size: 0.8rem;
}
.chip--on { background: #2e7d32; border-color: #ffffff80; }
</style>
```

- [ ] **Step 4: Wire the library**

Add to `PatternLibrary.vue`'s script:

```ts
import TagFilter from './TagFilter.vue'

const selectedTags = ref<string[]>([])
const taggingId = ref<string | null>(null)
const tagDraft = ref('')

/**
 * Held in a ref refreshed beside the list, not computed.
 *
 * `allTags` reads localStorage, which Vue cannot track — a computed over it
 * would be evaluated once and cached forever, so a tag added through this very
 * panel would not reach the filter row until the panel was remounted.
 */
const availableTags = ref<string[]>([])

/** Every chosen tag must be on the drill: chips narrow, they do not widen. */
const shown = computed(() =>
  patterns.value.filter((pattern) =>
    selectedTags.value.every((tag) => (pattern.tags ?? []).includes(tag)),
  ),
)

function startTagging(pattern: Pattern) {
  taggingId.value = pattern.id
  tagDraft.value = (pattern.tags ?? []).join(', ')
}

function saveTags(id: string) {
  storage.setTags(id, tagDraft.value.split(','))
  taggingId.value = null
  refresh()
}
```

Extend the existing `refresh()` so the chips are gathered whenever the list is,
which is what keeps the ref honest:

```ts
function refresh() {
  patterns.value = storage.listPatterns()
  availableTags.value = storage.allTags()
}
```

Change `isEmpty` to read from `shown`, render `<TagFilter :tags="availableTags" :selected="selectedTags" @update="selectedTags = $event" />` under the header, and `v-for="pattern in shown"`. Add to each row's default branch:

```vue
<button data-tags class="chip" @click="startTagging(pattern)">Tags</button>
```

and a branch beside the renaming one:

```vue
<template v-else-if="taggingId === pattern.id">
  <input v-model="tagDraft" data-tags-input class="input" placeholder="rondo, warm up" />
  <button data-tags-save class="chip" @click="saveTags(pattern.id)">Save</button>
  <button class="chip" @click="taggingId = null">Cancel</button>
</template>
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/TagFilter.spec.ts tests/PatternLibrary.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/TagFilter.vue src/components/PatternLibrary.vue tests/TagFilter.spec.ts tests/PatternLibrary.spec.ts
git commit -m "feat: filter the library by tag"
```

---

### Task 10: The sessions panel

**Files:**
- Create: `src/components/SessionLibrary.vue`
- Test: `tests/SessionLibrary.spec.ts`

**Interfaces:**
- Consumes: `useSessions` (Task 3).
- Produces:
  - props: `{ open: boolean }`
  - emits: `close: []`, `open: [session: Session]`

- [ ] **Step 1: Write the failing test**

Create `tests/SessionLibrary.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionLibrary from '../src/components/SessionLibrary.vue'
import { useSessions } from '../src/composables/useSessions'
import { useStorage } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

const sessions = useSessions()
const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

describe('SessionLibrary', () => {
  it('says so when there is nothing saved', () => {
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    expect(wrapper.text()).toContain('No sessions yet')
  })

  it('creates a session from a typed name', async () => {
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-new-name]').setValue('Tuesday U12')
    await wrapper.find('[data-new-session]').trigger('click')

    expect(sessions.listSessions().map((s) => s.name)).toEqual(['Tuesday U12'])
  })

  it('will not create a session with no name', async () => {
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-new-session]').trigger('click')

    expect(sessions.listSessions()).toEqual([])
  })

  it('reports the session the coach opened', async () => {
    sessions.createSession('Tuesday')
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-open]').trigger('click')

    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ name: 'Tuesday' })
  })

  it('renames', async () => {
    sessions.createSession('Tuesday')
    const wrapper = mount(SessionLibrary, { props: { open: true } })
    await wrapper.find('[data-rename]').trigger('click')
    await wrapper.find('[data-rename-input]').setValue('Wednesday')
    await wrapper.find('[data-rename-save]').trigger('click')

    expect(sessions.listSessions()[0].name).toBe('Wednesday')
  })

  it('leaves a drill that is gone out of the session total', () => {
    const pattern = storage.savePattern('Rondo', useBoard().snapshot())
    const created = sessions.createSession('Tuesday')
    sessions.saveSession({
      ...created,
      entries: [sessions.newEntry(pattern.id, 12), sessions.newEntry('gone', 20)],
    })

    const wrapper = mount(SessionLibrary, { props: { open: true } })

    // The panel and the PDF must agree: both leave out a drill that will not
    // be run. Showing 32 here and 12 on the page is the discrepancy.
    expect(wrapper.find('[data-session]').text()).toContain('12 min')
    expect(wrapper.find('[data-session]').text()).not.toContain('32 min')
  })

  it('asks before deleting', async () => {
    sessions.createSession('Tuesday')
    const wrapper = mount(SessionLibrary, { props: { open: true } })

    await wrapper.find('[data-delete]').trigger('click')
    expect(sessions.listSessions()).toHaveLength(1)

    await wrapper.find('[data-confirm-delete]').trigger('click')
    expect(sessions.listSessions()).toEqual([])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/SessionLibrary.spec.ts`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement**

Create `src/components/SessionLibrary.vue`, following `PatternLibrary.vue`'s shape closely so the two read as siblings:

```vue
<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import type { Session } from '../types'
import { useSessions } from '../composables/useSessions'
import { useStorage } from '../composables/useStorage'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; open: [session: Session] }>()

const sessions = useSessions()
const storage = useStorage()

const list = ref<Session[]>([])
const newName = ref('')
const confirmingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')

/** Which drills still exist, so a session's total can leave out those that do not. */
const knownPatternIds = ref<Set<string>>(new Set())

function refresh() {
  list.value = sessions.listSessions()
  knownPatternIds.value = new Set(storage.listPatterns().map((p) => p.id))
}

watch(() => props.open, (open) => { if (open) refresh() }, { immediate: true })

const isEmpty = computed(() => list.value.length === 0)

function create() {
  const name = newName.value.trim()
  // A session with no name cannot be told apart from another in the list, and
  // there is nothing to put at the top of its PDF.
  if (!name) return
  sessions.createSession(name)
  newName.value = ''
  refresh()
}

/**
 * `toRaw` before the session leaves: it comes from a v-for over a ref-held
 * array, so Vue has wrapped it in a Proxy, and the PDF path clones it.
 */
function open(session: Session) {
  emit('open', toRaw(session))
}

function saveRename(id: string) {
  const name = renameDraft.value.trim()
  if (name) sessions.renameSession(id, name)
  renamingId.value = null
  refresh()
}

function confirmDelete(id: string) {
  sessions.deleteSession(id)
  confirmingId.value = null
  refresh()
}

/**
 * The same total the plan panel and the PDF show, through the same function.
 *
 * A drill that is no longer in the library contributes nothing — it will not
 * be run and it is not in the document — so summing every entry here would
 * have this list promise a session length the PDF then contradicts.
 */
function totalOf(session: Session): number {
  return sessions.totalMinutes(session, knownPatternIds.value)
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-label="Sessions">
      <header class="head">
        <h2>Sessions</h2>
        <button class="chip" @click="emit('close')">Close</button>
      </header>

      <div class="row">
        <input v-model="newName" data-new-name class="input" placeholder="Tuesday U12" />
        <button data-new-session class="chip" @click="create">New session</button>
      </div>

      <p v-if="isEmpty" class="empty">No sessions yet. Name one above and add drills to it.</p>

      <ul v-else class="list">
        <li v-for="session in list" :key="session.id" data-session class="row">
          <template v-if="renamingId === session.id">
            <input v-model="renameDraft" data-rename-input class="input" />
            <button data-rename-save class="chip" @click="saveRename(session.id)">Save</button>
            <button class="chip" @click="renamingId = null">Cancel</button>
          </template>

          <template v-else-if="confirmingId === session.id">
            <span class="name">Delete “{{ session.name }}”?</span>
            <button data-confirm-delete class="chip chip--danger" @click="confirmDelete(session.id)">Delete</button>
            <button class="chip" @click="confirmingId = null">Cancel</button>
          </template>

          <template v-else>
            <span class="name">{{ session.name }}</span>
            <span class="date">{{ session.entries.length }} drills · {{ totalOf(session) }} min</span>
            <button data-open class="chip" @click="open(session)">Open</button>
            <button data-rename class="chip" @click="renamingId = session.id; renameDraft = session.name">Rename</button>
            <button data-delete class="chip" @click="confirmingId = session.id">Delete</button>
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: #000000aa; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.panel { background: #263238; color: #eceff1; border-radius: 0.6rem; width: min(38rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem; }
.head { display: flex; justify-content: space-between; align-items: center; }
.head h2 { margin: 0; font-size: 1.1rem; }
.empty { opacity: 0.7; }
.list { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
.row { display: flex; gap: 0.4rem; align-items: center; background: #37474f; padding: 0.45rem 0.6rem; border-radius: 0.4rem; margin-top: 0.5rem; }
.name { flex: 1; }
.date { opacity: 0.6; font-size: 0.8rem; }
.input { flex: 1; padding: 0.35rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: #263238; color: inherit; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
.chip--danger { background: #c62828; }
</style>
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/SessionLibrary.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionLibrary.vue tests/SessionLibrary.spec.ts
git commit -m "feat: a panel of saved sessions"
```

---

### Task 11: Editing one session

**Files:**
- Create: `src/components/SessionPlan.vue`
- Test: `tests/SessionPlan.spec.ts`

**Interfaces:**
- Consumes: `useSessions`, `useStorage`, `TagFilter`.
- Produces:
  - props: `{ session: Session | null }`
  - emits: `close: []`, `exportPdf: [session: Session]`

- [ ] **Step 1: Write the failing test**

Create `tests/SessionPlan.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SessionPlan from '../src/components/SessionPlan.vue'
import { useSessions } from '../src/composables/useSessions'
import { useStorage } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'
import type { Session } from '../src/types'

const sessions = useSessions()
const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
})

function sessionWith(entries: Array<{ patternId: string; minutes: number }>): Session {
  const created = sessions.createSession('Tuesday')
  const full = { ...created, entries: entries.map((e, i) => ({ id: `e${i}`, ...e })) }
  sessions.saveSession(full)
  return full
}

describe('SessionPlan', () => {
  it('lists the drills in order with a running total', () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const b = storage.savePattern('Pressing trap', useBoard().snapshot())
    const session = sessionWith([
      { patternId: a.id, minutes: 12 },
      { patternId: b.id, minutes: 20 },
    ])

    const wrapper = mount(SessionPlan, { props: { session } })

    const rows = wrapper.findAll('[data-entry]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Rondo')
    expect(wrapper.find('[data-total]').text()).toContain('32')
  })

  it('shows a drill that is gone as missing, and lets it be removed', async () => {
    const session = sessionWith([{ patternId: 'gone', minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    expect(wrapper.find('[data-missing]').exists()).toBe(true)

    await wrapper.find('[data-remove]').trigger('click')
    expect(sessions.listSessions()[0].entries).toEqual([])
  })

  it('leaves a missing drill out of the total', () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([
      { patternId: a.id, minutes: 12 },
      { patternId: 'gone', minutes: 20 },
    ])

    const wrapper = mount(SessionPlan, { props: { session } })
    expect(wrapper.find('[data-total]').text()).toContain('12')
  })

  it('moves a drill up and saves the new order', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const b = storage.savePattern('Pressing trap', useBoard().snapshot())
    const session = sessionWith([
      { patternId: a.id, minutes: 12 },
      { patternId: b.id, minutes: 20 },
    ])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.findAll('[data-up]')[1].trigger('click')

    expect(sessions.listSessions()[0].entries[0].patternId).toBe(b.id)
  })

  it('will not move the first drill up', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    expect(wrapper.findAll('[data-up]')[0].attributes('disabled')).toBeDefined()
  })

  it('changes a drill’s minutes', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-minutes]').setValue('18')

    expect(sessions.listSessions()[0].entries[0].minutes).toBe(18)
  })

  it('adds a drill from the picker', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-add-drill]').trigger('click')
    await wrapper.find('[data-pick]').trigger('click')

    expect(sessions.listSessions()[0].entries[0].patternId).toBe(a.id)
  })

  it('filters the picker by tag', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const b = storage.savePattern('Pressing trap', useBoard().snapshot())
    storage.setTags(a.id, ['rondo'])
    storage.setTags(b.id, ['pressing'])
    const session = sessionWith([])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-add-drill]').trigger('click')
    expect(wrapper.findAll('[data-pick]')).toHaveLength(2)

    const rondo = wrapper.findAll('[data-tag-chip]').find((c) => c.text() === 'rondo')!
    await rondo.trigger('click')

    expect(wrapper.findAll('[data-pick]')).toHaveLength(1)
  })

  it('asks App to export rather than exporting itself', async () => {
    const a = storage.savePattern('Rondo', useBoard().snapshot())
    const session = sessionWith([{ patternId: a.id, minutes: 12 }])

    const wrapper = mount(SessionPlan, { props: { session } })
    await wrapper.find('[data-export-pdf]').trigger('click')

    expect(wrapper.emitted('exportPdf')?.[0]?.[0]).toMatchObject({ id: session.id })
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/SessionPlan.spec.ts`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement**

Create `src/components/SessionPlan.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Pattern, Session } from '../types'
import { useSessions } from '../composables/useSessions'
import { useStorage } from '../composables/useStorage'
import TagFilter from './TagFilter.vue'

const props = defineProps<{ session: Session | null }>()

/**
 * The PDF is not built here. App owns the export lock, the progress notice
 * and the download, exactly as it does for the PNG and the GIF, and a panel
 * that exported for itself would be a second place those live.
 */
const emit = defineEmits<{ close: []; exportPdf: [session: Session] }>()

const sessions = useSessions()
const storage = useStorage()

const entries = ref<Session['entries']>([])
const patterns = ref<Pattern[]>([])
const picking = ref(false)
const pickerTags = ref<string[]>([])

watch(
  () => props.session,
  (session) => {
    entries.value = session ? [...session.entries] : []
    patterns.value = storage.listPatterns()
    availableTags.value = storage.allTags()
  },
  { immediate: true },
)

const byId = computed(() => new Map(patterns.value.map((p) => [p.id, p])))

const known = computed(() => new Set(patterns.value.map((p) => p.id)))

/** A missing drill contributes nothing: `totalMinutes` owns that rule. */
const total = computed(() =>
  props.session
    ? sessions.totalMinutes({ ...props.session, entries: entries.value }, known.value)
    : 0,
)

/**
 * A ref rather than a computed, for the reason given in PatternLibrary:
 * `allTags` reads localStorage, which Vue cannot track.
 */
const availableTags = ref<string[]>([])

const pickable = computed(() =>
  patterns.value.filter((pattern) =>
    pickerTags.value.every((tag) => (pattern.tags ?? []).includes(tag)),
  ),
)

/** Every edit writes through. There is no Save button to forget to press. */
function commit() {
  if (!props.session) return
  sessions.saveSession({ ...props.session, entries: [...entries.value] })
}

function move(index: number, by: number) {
  const to = index + by
  if (to < 0 || to >= entries.value.length) return
  const [entry] = entries.value.splice(index, 1)
  entries.value.splice(to, 0, entry)
  commit()
}

function remove(index: number) {
  entries.value.splice(index, 1)
  commit()
}

function setMinutes(index: number, value: string) {
  const minutes = Number(value)
  // Refuse rather than store: minutes are validated on the way back in, and a
  // zero would make the whole session unreadable next time it is opened.
  if (!Number.isFinite(minutes) || minutes <= 0) return
  entries.value[index] = { ...entries.value[index], minutes }
  commit()
}

function add(pattern: Pattern) {
  entries.value.push(sessions.newEntry(pattern.id, 10))
  picking.value = false
  commit()
}

/**
 * The session as it stands, not as it arrived.
 *
 * `props.session` is the object App handed over when the panel opened; every
 * edit since has gone into `entries`. Exporting the prop would build a PDF of
 * the running order the coach started with rather than the one they just
 * finished arranging.
 */
function currentSession(): Session {
  return { ...(props.session as Session), entries: [...entries.value] }
}
</script>

<template>
  <div v-if="session" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" :aria-label="session.name">
      <header class="head">
        <h2>{{ session.name }}</h2>
        <span data-total class="date">{{ total }} min</span>
        <button class="chip" @click="emit('close')">Close</button>
      </header>

      <p v-if="entries.length === 0" class="empty">No drills yet. Add one below.</p>

      <ul v-else class="list">
        <li v-for="(entry, index) in entries" :key="entry.id" data-entry class="row">
          <span v-if="byId.has(entry.patternId)" class="name">
            {{ byId.get(entry.patternId)!.name }}
          </span>
          <span v-else data-missing class="name missing">
            Drill no longer in your library
          </span>

          <input
            data-minutes
            class="minutes"
            type="number"
            min="1"
            :value="entry.minutes"
            @change="setMinutes(index, ($event.target as HTMLInputElement).value)"
          />
          <span class="date">min</span>

          <button data-up class="chip" :disabled="index === 0" @click="move(index, -1)">Up</button>
          <button
            data-down
            class="chip"
            :disabled="index === entries.length - 1"
            @click="move(index, 1)"
          >Down</button>
          <button data-remove class="chip chip--danger" @click="remove(index)">Remove</button>
        </li>
      </ul>

      <div class="row">
        <button data-add-drill class="chip" @click="picking = !picking">Add drill</button>
        <button data-export-pdf class="chip" @click="emit('exportPdf', currentSession())">Export PDF</button>
      </div>

      <div v-if="picking" class="picker">
        <TagFilter :tags="availableTags" :selected="pickerTags" @update="pickerTags = $event" />
        <ul class="list">
          <li v-for="pattern in pickable" :key="pattern.id" class="row">
            <span class="name">{{ pattern.name }}</span>
            <button data-pick class="chip" @click="add(pattern)">Add</button>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: #000000aa; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.panel { background: #263238; color: #eceff1; border-radius: 0.6rem; width: min(42rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
.head h2 { margin: 0; font-size: 1.1rem; flex: 1; }
.empty { opacity: 0.7; }
.list { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
.row { display: flex; gap: 0.4rem; align-items: center; background: #37474f; padding: 0.45rem 0.6rem; border-radius: 0.4rem; margin-top: 0.5rem; }
.name { flex: 1; }
.missing { opacity: 0.6; font-style: italic; }
.minutes { width: 4rem; padding: 0.3rem; border-radius: 0.3rem; border: 1px solid #ffffff40; background: #263238; color: inherit; }
.date { opacity: 0.6; font-size: 0.8rem; }
.picker { margin-top: 0.75rem; border-top: 1px solid #ffffff20; padding-top: 0.5rem; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }
.chip:disabled { opacity: 0.4; cursor: default; }
.chip--danger { background: #c62828; }
</style>
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/SessionPlan.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionPlan.vue tests/SessionPlan.spec.ts
git commit -m "feat: build a session from saved drills"
```

---

### Task 12: Wire it into the app

**Files:**
- Modify: `src/components/Toolbar.vue` — a Sessions button
- Modify: `src/App.vue` — hold both panels and run the export
- Test: `tests/Toolbar.spec.ts`, `tests/App.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `Toolbar` emits `openSessions: []`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Toolbar.spec.ts`:

```ts
it('asks to open the sessions panel', async () => {
  const wrapper = mount(Toolbar, { props: toolbarProps() })
  await wrapper.find('[data-open-sessions]').trigger('click')

  expect(wrapper.emitted('openSessions')).toBeTruthy()
})
```

Use whatever prop helper the file already has; if there is none, copy the props from an existing test in that file.

Add to `tests/App.spec.ts`:

```ts
it('opens the sessions panel from the toolbar', async () => {
  const wrapper = mount(App)
  await wrapper.find('[data-open-sessions]').trigger('click')

  expect(wrapper.find('[role="dialog"][aria-label="Sessions"]').exists()).toBe(true)
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/Toolbar.spec.ts tests/App.spec.ts`
Expected: FAIL — `[data-open-sessions]` not found.

- [ ] **Step 3: Add the button**

In `Toolbar.vue`, add `openSessions: []` to `defineEmits`, and beside the existing library button:

```vue
<button data-open-sessions class="chip" @click="emit('openSessions')">Sessions</button>
```

- [ ] **Step 4: Wire `App.vue`**

```ts
import SessionLibrary from './components/SessionLibrary.vue'
import SessionPlan from './components/SessionPlan.vue'
import { useSessions } from './composables/useSessions'
import { buildSessionPdf } from './sessionPdf'

const sessions = useSessions()
const sessionsOpen = ref(false)
const openSession = ref<Session | null>(null)

/**
 * Export a session as one PDF.
 *
 * Unlike the GIF, this does not lock the board: it rasterises through
 * BoardView off-screen and never touches the live one, so the coach can keep
 * working while it runs and a failure halfway through leaves their board
 * exactly as it was. The `exporting` guard is still here to stop a second
 * export starting on top of the first.
 */
async function exportSessionPdf(session: Session) {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await buildSessionPdf({
      session,
      patterns: storage.listPatterns(),
      onProgress: (done, total) => {
        notice.value = `Building the session… ${done} of ${total}`
      },
    })
    exporter.downloadBlob(blob, `${exporter.slugify(session.name || 'session')}.pdf`)
    notice.value = 'Session saved.'
  } catch (error) {
    notice.value = error instanceof Error ? error.message : 'The session could not be created.'
  } finally {
    exporting.value = false
  }
}
```

In the template, beside the existing library:

```vue
<SessionLibrary
  :open="sessionsOpen"
  @close="sessionsOpen = false"
  @open="openSession = $event; sessionsOpen = false"
/>
<SessionPlan
  :session="openSession"
  @close="openSession = null"
  @exportPdf="exportSessionPdf"
/>
```

and `@openSessions="sessionsOpen = true"` on `<Toolbar>`.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check and build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 7: Check by hand**

Run `npm run dev` and walk the whole feature: tag two drills, filter the library by a tag, create a session, add both drills, set minutes, reorder, export the PDF and open it. Confirm the cover totals, one page per drill, up to four boards with "Phase n of m" captions, and selectable notes text.

Then delete one of the drills from the library and confirm the warning names the session; delete it anyway and confirm the session shows a missing row and the PDF skips it.

- [ ] **Step 8: Update the docs**

Add the session panel and tags to `src/components/HelpPanel.vue` and to `README.md`, matching how the existing features are described there.

Then remove the two landed items from `docs/roadmap.md`: **A session plan** and **Pattern folders or tags**.

- [ ] **Step 9: Commit**

```bash
git add src/App.vue src/components/Toolbar.vue src/components/HelpPanel.vue README.md docs/roadmap.md tests/App.spec.ts tests/Toolbar.spec.ts
git commit -m "feat: sessions and tags in the app"
```

---

## Done when

- A coach can tag a drill, filter the library and the drill picker by tag, and both survive a reload.
- A session is created, filled, reordered, timed, reopened and deleted.
- Exporting produces a PDF with a cover, one page per drill, up to four captioned boards each, and selectable notes.
- Deleting a drill a session uses warns first; deleting it anyway leaves a removable missing row and a PDF that skips it.
- `npm test` passes and `npm run build` is clean.
- `docs/roadmap.md` no longer lists a session plan or tags.
