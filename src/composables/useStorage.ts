import { ref } from 'vue'
import type { Frame, Pattern } from '../types'
import type { BoardSnapshot } from './useBoard'

export const PATTERNS_KEY = 'fct.patterns.v1'
export const DRAFT_KEY = 'fct.draft.v1'

const SCHEMA_VERSION = 1

const lastError = ref<string | null>(null)

/**
 * Whether the most recent LIBRARY write actually reached localStorage.
 *
 * `savePattern` deliberately writes nothing when the library is unreadable,
 * and a write can also fail on quota, yet it still returns the pattern it
 * built in memory. Callers that want to tell the coach "saved" — or to treat
 * the pattern as the one now open — have to know which happened.
 *
 * Draft autosaves do not touch this: it answers for the library only.
 */
const lastWriteSucceeded = ref(true)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A position in pitch units: { x: number, y: number }. */
function isVec(value: unknown): boolean {
  return isObject(value) && typeof value.x === 'number' && typeof value.y === 'number'
}

function isValidCounter(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.color === 'string' &&
    typeof value.label === 'string' &&
    isVec(value.pos)
  )
}

/**
 * The ball could not be hidden until after version 1 shipped, and every
 * pattern written before that had one on the pitch. A missing flag
 * therefore means visible, not invalid.
 */
function withBallDefaults(ball: unknown): unknown {
  if (!isObject(ball)) return ball
  return { ...ball, visible: ball.visible !== false }
}

function isValidBall(value: unknown): boolean {
  return (
    isObject(value) &&
    isVec(value.pos) &&
    (value.attachedTo === null || typeof value.attachedTo === 'string')
  )
}

function isValidLabel(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    isVec(value.pos)
  )
}

/**
 * Labels arrived after version 1 shipped, so a pattern or draft written
 * before them has no labels array. Read a missing one as empty rather than
 * rejecting the coach's real saved work.
 */
function labelsOf(value: Record<string, unknown>): unknown[] {
  return Array.isArray(value.labels) ? value.labels : []
}

function isValidMarker(value: unknown): boolean {
  return isObject(value) && typeof value.id === 'string' && isVec(value.pos)
}

/**
 * Cones arrived after version 1 shipped, so a pattern or draft written
 * before them simply has no markers array. That is the coach's real saved
 * work: treat a missing array as an empty one rather than rejecting it.
 */
function markersOf(value: Record<string, unknown>): unknown[] {
  return Array.isArray(value.markers) ? value.markers : []
}

/** Absent, or a number the renderer can actually put in a path. */
function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function isValidDrawing(value: unknown): boolean {
  if (!isObject(value)) return false
  if (value.kind === 'pen') return Array.isArray(value.points)
  if (value.kind === 'arrow' || value.kind === 'line') {
    if (!isVec(value.from) || !isVec(value.to)) return false
    // Curves arrived after version 1, so an arrow with neither field is a
    // straight one saved before them. A value that is present must still be a
    // real number: anything else reaches the renderer as an unreadable path.
    return isOptionalNumber(value.bend) && isOptionalNumber(value.bendAlong)
  }
  return false
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

  if (
    !isObject(value.pitch) ||
    typeof value.pitch.type !== 'string' ||
    typeof value.pitch.rotated !== 'boolean'
  ) {
    throw new Error('That pattern is missing its pitch settings.')
  }

  if (!Array.isArray(value.drawings)) throw new Error('That pattern is missing its drawings.')

  if (value.notes !== undefined && typeof value.notes !== 'string') {
    throw new Error('That pattern has damaged notes.')
  }
  if (!value.drawings.every(isValidDrawing)) {
    throw new Error('That pattern has a damaged drawing.')
  }

  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error('That pattern has no frames.')
  }

  for (const frame of value.frames) {
    if (!isObject(frame) || !Array.isArray(frame.counters) || !isObject(frame.ball)) {
      throw new Error('That pattern has a damaged frame.')
    }
    if (!frame.counters.every(isValidCounter)) {
      throw new Error('That pattern has a damaged player position.')
    }
    if (!isValidBall(frame.ball)) {
      throw new Error('That pattern has a damaged ball position.')
    }
    if (!markersOf(frame).every(isValidMarker)) {
      throw new Error('That pattern has a damaged cone position.')
    }
    if (!labelsOf(frame).every(isValidLabel)) {
      throw new Error('That pattern has a damaged label.')
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

const UNREADABLE_LIBRARY_MESSAGE =
  'Your saved patterns could not be read, so saving now would overwrite them. Export or clear your saved patterns first, then try again.'

type LibraryRead = {
  patterns: Pattern[]
  /** True when the top-level stored value itself could not be trusted (bad JSON, or not an array). */
  unreadable: boolean
  /**
   * The individual entries that failed to parse even though the top-level
   * value was fine, exactly as they were stored. Carried, not counted, so
   * every write can put them back untouched.
   */
  damaged: unknown[]
}

/**
 * Read the library and say what kind of problem, if any, was found.
 *
 * `unreadable` is the disaster case: the stored bytes could not be trusted
 * at all, and a caller that goes on to write would permanently destroy them.
 *
 * A `damaged` entry is the partial case: the rest of the library is good and
 * the coach must still be able to save, delete and rename. But the damaged
 * rows are the coach's work too, and the spec promises corrupt data is "left
 * untouched so it can be recovered" — so they ride along with every write
 * rather than being dropped on the first one. `writeLibrary` is the only
 * supported way to write, and it takes them as an argument for that reason.
 */
function readLibrary(): LibraryRead {
  let raw: unknown
  try {
    raw = readRaw(PATTERNS_KEY)
  } catch {
    return { patterns: [], unreadable: true, damaged: [] }
  }

  if (raw === null) return { patterns: [], unreadable: false, damaged: [] }
  if (!Array.isArray(raw)) return { patterns: [], unreadable: true, damaged: [] }

  const patterns: Pattern[] = []
  const damaged: unknown[] = []
  for (const entry of raw) {
    try {
      patterns.push(parsePattern(entry))
    } catch {
      damaged.push(entry)
    }
  }
  return { patterns, unreadable: false, damaged }
}

function damagedMessage(count: number): string {
  return `${count} saved pattern(s) could not be read. They have been left untouched so they can be recovered.`
}

function listPatterns(): Pattern[] {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()

  if (unreadable) {
    lastError.value =
      'Your saved patterns could not be read. The stored data has been left untouched so it can be recovered.'
    return []
  }

  if (damaged.length > 0) lastError.value = damagedMessage(damaged.length)
  return patterns
}

/**
 * Write the library back, damaged rows included.
 *
 * Every write goes through here so that no code path can drop a row it
 * merely failed to understand.
 */
function writeLibrary(patterns: Pattern[], damaged: unknown[]): boolean {
  return writeRaw(PATTERNS_KEY, [...patterns, ...damaged])
}

/**
 * Record whether a write landed, and say whether the coach should also be
 * told that damaged rows were carried through it.
 */
function recordWrite(ok: boolean, damaged: unknown[]): boolean {
  lastWriteSucceeded.value = ok
  return ok && damaged.length > 0
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function toPattern(name: string, snap: BoardSnapshot, id: string, createdAt: string): Pattern {
  const copy = structuredClone(snap)
  // Stopgap: the pattern format still has exactly one frame, whose drawings
  // live on the pattern rather than the frame. Task 4 rewrites this function
  // to carry every frame once the library has somewhere to show them.
  const frame = copy.frames[copy.currentFrame] ?? copy.frames[0]
  return {
    id,
    name,
    version: SCHEMA_VERSION,
    pitch: copy.pitch,
    drawings: frame.drawings,
    frames: [
      {
        counters: frame.counters,
        markers: frame.markers ?? [],
        labels: frame.labels ?? [],
        ball: frame.ball,
        drawings: [],
      },
    ],
    labelsVisible: copy.labelsVisible ?? true,
    notes: copy.notes ?? '',
    notesVisible: copy.notesVisible ?? true,
    createdAt,
    updatedAt: nowIso(),
  }
}

function savePattern(name: string, snap: BoardSnapshot, id?: string): Pattern {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()

  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return toPattern(name, snap, id ?? makeId(), nowIso())
  }

  const existing = id ? patterns.find((p) => p.id === id) : undefined
  const pattern = toPattern(name, snap, existing?.id ?? id ?? makeId(), existing?.createdAt ?? nowIso())

  const index = patterns.findIndex((p) => p.id === pattern.id)
  if (index === -1) patterns.push(pattern)
  else patterns[index] = pattern

  if (recordWrite(writeLibrary(patterns, damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length)
  }
  return pattern
}

function deletePattern(id: string): void {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return
  }
  if (recordWrite(writeLibrary(patterns.filter((p) => p.id !== id), damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length)
  }
}

function renamePattern(id: string, name: string): void {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return
  }
  const pattern = patterns.find((p) => p.id === id)
  if (!pattern) return
  pattern.name = name
  pattern.updatedAt = nowIso()
  if (recordWrite(writeLibrary(patterns, damaged), damaged)) {
    lastError.value = damagedMessage(damaged.length)
  }
}

function patternToSnapshot(pattern: Pattern): BoardSnapshot {
  const copy = structuredClone(pattern)
  const frame = copy.frames[0]
  return {
    frames: [
      {
        counters: frame.counters,
        markers: markersOf(frame as unknown as Record<string, unknown>) as Frame['markers'],
        labels: labelsOf(frame as unknown as Record<string, unknown>) as Frame['labels'],
        ball: withBallDefaults(frame.ball) as Frame['ball'],
        // Pattern-level drawings, not the frame's own (currently always
        // empty) field — see the stopgap note on toPattern.
        drawings: copy.drawings,
      },
    ],
    currentFrame: 0,
    labelsVisible: (copy as { labelsVisible?: boolean }).labelsVisible ?? true,
    notes: (copy as { notes?: string }).notes ?? '',
    notesVisible: (copy as { notesVisible?: boolean }).notesVisible ?? true,
    pitch: copy.pitch,
  }
}

function saveDraft(snap: BoardSnapshot): void {
  lastError.value = null
  writeRaw(DRAFT_KEY, snap)
}

function isValidPitch(value: unknown): boolean {
  return isObject(value) && typeof value.type === 'string' && typeof value.rotated === 'boolean'
}

/** Validate a single frame within a snapshot, to the same standard as the library path. */
function isValidFrame(value: unknown): boolean {
  return (
    isObject(value) &&
    Array.isArray(value.counters) &&
    value.counters.every(isValidCounter) &&
    markersOf(value).every(isValidMarker) &&
    labelsOf(value).every(isValidLabel) &&
    isValidBall(value.ball) &&
    Array.isArray(value.drawings) &&
    value.drawings.every(isValidDrawing)
  )
}

/**
 * Validate an untrusted value as a board snapshot, to the same standard the
 * library path applies, reusing the same predicates.
 *
 * A draft that passes a weaker check than the library is worse than no check
 * at all: a draft missing its ball is restored, `ballPosition` throws during
 * render, and because the draft is reloaded on every start the app is
 * bricked with no way back from inside it.
 */
function isValidSnapshot(value: unknown): boolean {
  return (
    isObject(value) &&
    Array.isArray(value.frames) &&
    value.frames.length > 0 &&
    value.frames.every(isValidFrame) &&
    isValidPitch(value.pitch)
  )
}

/**
 * The draft is transient working state, not the library, so a draft that
 * fails validation is discarded rather than preserved: starting on an empty
 * board loses at most the last few seconds, while restoring a broken one
 * loses the app.
 */
function loadDraft(): BoardSnapshot | null {
  try {
    const raw = readRaw(DRAFT_KEY)
    if (!isValidSnapshot(raw)) return null
    // A draft written before cones or labels existed has frames with no
    // markers/labels array.
    const draft = raw as Record<string, unknown>
    const frames = (draft.frames as Record<string, unknown>[]).map((frame) => ({
      ...frame,
      ball: withBallDefaults(frame.ball),
      markers: markersOf(frame),
      labels: labelsOf(frame),
    }))
    const currentFrame = typeof draft.currentFrame === 'number' ? draft.currentFrame : 0
    return {
      ...draft,
      frames,
      currentFrame: Math.max(0, Math.min(currentFrame, frames.length - 1)),
      labelsVisible: draft.labelsVisible !== false,
      notes: typeof draft.notes === 'string' ? draft.notes : '',
      notesVisible: draft.notesVisible !== false,
    } as unknown as BoardSnapshot
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

  const { patterns, unreadable, damaged } = readLibrary()
  if (unreadable) {
    throw new Error(
      'Your saved patterns could not be read, so importing now would overwrite them. Export or clear your saved patterns first, then try again.',
    )
  }

  const incoming = raw.map((entry) => parsePattern(entry))

  // Tracked incrementally: a collision can be with the existing library OR
  // with an earlier entry in this same file. Either way the id must be
  // unique before it lands in localStorage.
  const seenIds = new Set(patterns.map((p) => p.id))

  const added: Pattern[] = []
  for (const pattern of incoming) {
    if (!seenIds.has(pattern.id)) {
      seenIds.add(pattern.id)
      added.push(pattern)
      continue
    }
    const renamed = { ...pattern, id: makeId(), name: `${pattern.name} (imported)` }
    seenIds.add(renamed.id)
    added.push(renamed)
  }

  recordWrite(writeLibrary([...patterns, ...added], damaged), damaged)
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
  lastWriteSucceeded,
}

export function useStorage() {
  return storage
}
