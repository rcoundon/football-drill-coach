import { ref } from 'vue'
import type { Ball, Counter, Drawing, Frame, Label, Marker, Pattern } from '../types'
import type { BoardSnapshot } from './useBoard'
import type { Vec } from '../types'

export const PATTERNS_KEY = 'fct.patterns.v1'
export const DRAFT_KEY = 'fct.draft.v1'

const SCHEMA_VERSION = 3

/** Versions this build can open. Only SCHEMA_VERSION is ever written. */
const READABLE_VERSIONS = new Set([1, 2, 3])

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

/**
 * Whether a drill carries every one of the coach's chosen tags. Lives here
 * rather than in a component so the filter row and the library panel share
 * one definition of what "matches" means.
 *
 * Takes only `tags`, not a whole `Pattern`, because that is all it reads —
 * the honest signature means a rename of `Pattern.tags` cannot slip past a
 * call site that only ever built `{ tags }`.
 */
/**
 * A tag list with one tag flipped in or out.
 *
 * Shared because both chip rows do it — the library's filter and the save
 * prompt's — and two spellings of "on if it was off" is how the two come to
 * behave differently under the same finger.
 */
export function toggleTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
}

export function matchesTags(pattern: Pick<Pattern, 'tags'>, selected: string[]): boolean {
  return selected.every((tag) => (pattern.tags ?? []).includes(tag))
}

/**
 * The ball could not be hidden until after version 1 shipped, and every
 * pattern written before that had one on the pitch. A missing flag
 * therefore means visible, not invalid.
 */
/**
 * The balls on a frame, however the frame was written.
 *
 * Before version 3 a frame had one ball, `frame.ball`, carrying its own
 * `visible` flag. That ball becomes the first of a list, and the flag is
 * lifted out to the drill by `ballsVisibleOf`. `sharedId` is minted once per
 * drill and handed to every phase, because playback matches a ball in one
 * phase to the same ball in the next — a fresh id per phase would leave it
 * with nothing to match.
 */
function ballsOf(frame: Record<string, unknown>, sharedId: string): Ball[] {
  if (Array.isArray(frame.balls)) return frame.balls as Ball[]
  if (!isObject(frame.ball)) return []
  const { pos, attachedTo } = frame.ball as { pos: Vec; attachedTo: string | null }
  return [{ id: sharedId, pos, attachedTo }]
}

/**
 * Whether the balls are shown, however the drill was written.
 *
 * Before version 3 this rode on the ball itself, which put it on the frame —
 * so hiding the ball on one phase left it showing on the next. It is a
 * drill-wide setting now, and an older drill's answer is taken from its first
 * phase. A missing flag means visible: the ball could not be hidden at all
 * until after version 1 shipped.
 */
function ballsVisibleOf(value: Record<string, unknown>): boolean {
  if (typeof value.ballsVisible === 'boolean') return value.ballsVisible
  const frames = value.frames as Record<string, unknown>[] | undefined
  const first = Array.isArray(frames) ? frames[0] : value
  const legacy = isObject(first) ? (first.ball as { visible?: unknown } | undefined) : undefined
  return !(isObject(legacy) && legacy.visible === false)
}

/**
 * A ball in a version 3 list. Its id is required, like every other thing on
 * the board — playback matches balls by it, and `removeBall` filters on it,
 * so an id-less ball would take every other id-less ball off with it.
 *
 * `isValidLegacyBall` is the exemption: a drill written before version 3 had
 * no ids to write, and migration mints one on the way in.
 */
function isValidBall(value: unknown): boolean {
  return isValidLegacyBall(value) && isObject(value) && typeof value.id === 'string'
}

/**
 * A version 3 ball list: every entry valid, and no two sharing an id.
 *
 * Duplicate ids are the same class of damage as a missing one. Playback
 * matches balls by id and `removeBall` filters on it, so two balls answering
 * to the same id would tween as one and vanish together when either is erased.
 *
 * The count is deliberately NOT checked against MAX_BALLS. A drill carrying
 * more than the interface would let a coach make still works — the cap only
 * stops them adding another — and refusing to open it would hide their drill
 * to prevent nothing.
 */
function isValidBallList(value: unknown[]): boolean {
  if (!value.every(isValidBall)) return false
  const ids = value.map((ball) => (ball as { id: string }).id)
  return new Set(ids).size === ids.length
}

function isValidLegacyBall(value: unknown): boolean {
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

  if (typeof value.version !== 'number' || !READABLE_VERSIONS.has(value.version)) {
    throw new Error(
      `That pattern was saved by a different version of this app (version ${String(value.version)}). Update the app to open it.`,
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

  // A v2 pattern has no pattern-level drawings at all — they moved onto the
  // frame that owns them. Only a v1 pattern still has this field, so it must
  // be tolerated as absent rather than required.
  if (value.drawings !== undefined) {
    if (!Array.isArray(value.drawings)) throw new Error('That pattern is missing its drawings.')
    if (!value.drawings.every(isValidDrawing)) {
      throw new Error('That pattern has a damaged drawing.')
    }
  }

  if (value.notes !== undefined && typeof value.notes !== 'string') {
    throw new Error('That pattern has damaged notes.')
  }

  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || !value.tags.every((t) => typeof t === 'string')) {
      throw new Error('That pattern has damaged tags.')
    }
  }

  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error('That pattern has no frames.')
  }

  for (const frame of value.frames) {
    if (!isObject(frame) || !Array.isArray(frame.counters)) {
      throw new Error('That pattern has a damaged frame.')
    }
    // Either shape is readable: a list from version 3, a single ball before it.
    if (frame.balls !== undefined && !Array.isArray(frame.balls)) {
      throw new Error('That pattern has a damaged ball position.')
    }
    if (frame.balls === undefined && !isObject(frame.ball)) {
      throw new Error('That pattern has a damaged frame.')
    }
    if (!frame.counters.every(isValidCounter)) {
      throw new Error('That pattern has a damaged player position.')
    }
    // The older single ball is only consulted when there is no list at all.
    // Keying on the shape being an array instead let a good legacy `ball`
    // excuse a `balls` field that was outright garbage.
    const ballsOk =
      frame.balls === undefined
        ? isValidLegacyBall(frame.ball)
        : Array.isArray(frame.balls) && isValidBallList(frame.balls)
    if (!ballsOk) {
      throw new Error('That pattern has a damaged ball position.')
    }
    if (!markersOf(frame).every(isValidMarker)) {
      throw new Error('That pattern has a damaged cone position.')
    }
    if (!labelsOf(frame).every(isValidLabel)) {
      throw new Error('That pattern has a damaged label.')
    }
    if (frame.drawings !== undefined) {
      if (!Array.isArray(frame.drawings) || !frame.drawings.every(isValidDrawing)) {
        throw new Error('That pattern has a damaged drawing.')
      }
    }
    if (frame.duration !== undefined) {
      if (typeof frame.duration !== 'number' || !Number.isFinite(frame.duration) || frame.duration <= 0) {
        throw new Error('That pattern has a damaged frame duration.')
      }
    }
    if (frame.note !== undefined && typeof frame.note !== 'string') {
      throw new Error('That pattern has a damaged phase note.')
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

/**
 * An id for a ball recovered from a drill saved before balls had them.
 *
 * Mirrors `newId` in useBoard rather than importing it, for the same reason
 * `emptyFrameData` mirrors `emptyFrame`: the two modules stay apart.
 */
function makeBallId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function makeId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Fill in what a frame saved by an older build does not have.
 *
 * A v1 pattern kept its drawings at the pattern level, where they hung over
 * the whole drill. They belong to the first frame now — the only frame a v1
 * pattern has.
 */
function frameWithDefaults(
  frame: Record<string, unknown>,
  legacyDrawings: Drawing[],
  ballId: string,
): Frame {
  return {
    counters: (frame.counters ?? []) as Counter[],
    markers: markersOf(frame) as Marker[],
    labels: labelsOf(frame) as Label[],
    balls: ballsOf(frame, ballId),
    drawings: (frame.drawings ?? legacyDrawings) as Drawing[],
    ...(typeof frame.duration === 'number' ? { duration: frame.duration } : {}),
    ...(typeof frame.note === 'string' && frame.note !== '' ? { note: frame.note } : {}),
  }
}

/**
 * The same empty moment `emptyFrame()` builds in useBoard — not imported, to
 * keep the two modules apart. Never reached by a pattern that went through
 * `parsePattern`, which already rejects an empty frames array; this is only
 * a last-resort fallback for a caller that hands `patternToSnapshot` a
 * pattern that skipped that check.
 */
function emptyFrameData(): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    balls: [],
    drawings: [],
  }
}

function toPattern(name: string, snap: BoardSnapshot, id: string, createdAt: string): Pattern {
  const copy = structuredClone(snap)
  return {
    id,
    name,
    version: SCHEMA_VERSION,
    pitch: copy.pitch,
    frames: copy.frames,
    labelsVisible: copy.labelsVisible ?? true,
    ballsVisible: copy.ballsVisible ?? true,
    notes: copy.notes ?? '',
    notesVisible: copy.notesVisible ?? true,
    tags: [],
    createdAt,
    updatedAt: nowIso(),
  }
}

/**
 * `forkFromId` is separate from `id`: a fork deliberately saves under a
 * fresh id (so `id` is undefined, and `existing` below is too) while still
 * needing to know which drill it was copied from, to carry its tags across.
 */
function savePattern(name: string, snap: BoardSnapshot, id?: string, forkFromId?: string): Pattern {
  lastError.value = null
  const { patterns, unreadable, damaged } = readLibrary()

  if (unreadable) {
    lastError.value = UNREADABLE_LIBRARY_MESSAGE
    lastWriteSucceeded.value = false
    return toPattern(name, snap, id ?? makeId(), nowIso())
  }

  const existing = id ? patterns.find((p) => p.id === id) : undefined
  const pattern = toPattern(name, snap, existing?.id ?? id ?? makeId(), existing?.createdAt ?? nowIso())
  // Saving the board over a drill must not silently untag it, and neither
  // must forking one: a copy of a rondo is still a rondo, and having to
  // refile a fork by hand is the exact problem tags exist to solve. A
  // brand new drill has none, which is what `toPattern` already gave it.
  const forkSource = forkFromId ? patterns.find((p) => p.id === forkFromId) : undefined
  pattern.tags = existing?.tags ?? forkSource?.tags ?? []

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

/**
 * Every tag in use, sorted. The filter row's order is the app's business.
 *
 * Does not check `readLibrary().unreadable` itself and report it the way
 * `listPatterns` does: every caller today calls `listPatterns()` first, on
 * the same read, so that error already surfaced. Reads unreadable as "no
 * tags" rather than duplicating the check — add it back if a caller ever
 * calls this without calling `listPatterns()` first.
 */
function allTags(): string[] {
  const tags = new Set<string>()
  for (const pattern of readLibrary().patterns) {
    for (const tag of pattern.tags ?? []) tags.add(tag)
  }
  return [...tags].sort()
}

function patternToSnapshot(pattern: Pattern): BoardSnapshot {
  const copy = structuredClone(pattern) as unknown as Record<string, unknown>
  const legacy = (copy.drawings ?? []) as Drawing[]
  const rawFrames = Array.isArray(copy.frames) ? (copy.frames as Record<string, unknown>[]) : []
  // One id for the drill's single legacy ball, shared by every phase, so
  // playback can still match it up. Unused once the frames carry their own.
  const legacyBallId = makeBallId()
  const frames = rawFrames.map((frame, index) =>
    // Only the first frame inherits the legacy drawings. A v1 pattern has no
    // others, and a v2 one has no legacy drawings to inherit.
    frameWithDefaults(frame, index === 0 ? legacy : [], legacyBallId),
  )
  return {
    // A drill starts at the beginning. Reopening halfway through the
    // animation is never what anyone meant by opening a pattern.
    frames: frames.length > 0 ? frames : [emptyFrameData()],
    currentFrame: 0,
    labelsVisible: (copy.labelsVisible as boolean | undefined) ?? true,
    ballsVisible: ballsVisibleOf(copy),
    notes: (copy.notes as string | undefined) ?? '',
    notesVisible: (copy.notesVisible as boolean | undefined) ?? true,
    pitch: copy.pitch as BoardSnapshot['pitch'],
  }
}

function saveDraft(snap: BoardSnapshot): void {
  lastError.value = null
  writeRaw(DRAFT_KEY, snap)
}

function isValidPitch(value: unknown): boolean {
  return isObject(value) && typeof value.type === 'string' && typeof value.rotated === 'boolean'
}

/**
 * Validate a single frame's worth of board data, to the same standard as the
 * library path.
 *
 * Drawings are required, not optional, here: unlike markers and labels
 * (which arrived after this validator did, so a pattern saved before them
 * genuinely has no such array) every draft this app has ever written has
 * always had a drawings array on its one moment. A missing one means the
 * draft is damaged, not old.
 */
function isValidFrame(value: unknown): boolean {
  return (
    isObject(value) &&
    Array.isArray(value.counters) &&
    value.counters.every(isValidCounter) &&
    markersOf(value).every(isValidMarker) &&
    labelsOf(value).every(isValidLabel) &&
    // Either shape: a list from version 3, a single ball before it. Only the
    // list is held to having ids — a legacy ball gets one when it migrates —
    // and the legacy one is consulted only when there is no list at all, so a
    // good `ball` cannot excuse a `balls` field that is garbage.
    (value.balls === undefined
      ? isValidLegacyBall(value.ball)
      : Array.isArray(value.balls) && isValidBallList(value.balls)) &&
    Array.isArray(value.drawings) &&
    value.drawings.every(isValidDrawing) &&
    // Optional — the first frame of a draft has none — but a present value
    // has to be one `durationOf` can actually use, exactly as `parsePattern`
    // already requires for a saved pattern's frames.
    (value.duration === undefined ||
      (typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration > 0)) &&
    (value.note === undefined || typeof value.note === 'string')
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
 *
 * A draft written before playback existed is flat — one moment with no
 * `frames` array at all — so both shapes are accepted here and the flat one
 * is wrapped into a single frame on the way out, in `toSnapshot`.
 */
function isValidSnapshot(value: unknown): boolean {
  if (!isObject(value)) return false
  if (!isValidPitch(value.pitch)) return false
  if (Array.isArray(value.frames)) {
    return value.frames.length > 0 && value.frames.every(isValidFrame)
  }
  return isValidFrame(value)
}

/**
 * Turn an already-validated draft value into a BoardSnapshot.
 *
 * `currentFrame` is passed through as stored, not clamped here: `apply()` in
 * useBoard already clamps it for every caller — a trimmed pattern, a fresh
 * board, this draft — because it is the one place that must, regardless of
 * where the snapshot came from. Clamping again here would just be a second
 * copy of that rule, free to drift from the first.
 */
function toSnapshot(value: Record<string, unknown>): BoardSnapshot {
  const legacyBallId = makeBallId()
  const frames = Array.isArray(value.frames)
    ? (value.frames as Record<string, unknown>[]).map((frame) =>
        frameWithDefaults(frame, [], legacyBallId),
      )
    : // A draft from before playback existed: the whole board was one moment.
      [frameWithDefaults(value, [], legacyBallId)]
  return {
    frames,
    currentFrame: typeof value.currentFrame === 'number' ? value.currentFrame : 0,
    labelsVisible: (value.labelsVisible as boolean | undefined) ?? true,
    ballsVisible: ballsVisibleOf(value),
    notes: (value.notes as string | undefined) ?? '',
    notesVisible: (value.notesVisible as boolean | undefined) ?? true,
    pitch: value.pitch as BoardSnapshot['pitch'],
  }
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
    return toSnapshot(raw as Record<string, unknown>)
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

  // parsePattern only checks tags are strings, not that they are normalised —
  // a hand-edited file can carry ["Rondo", "rondo "], which would otherwise
  // land as two chips in the filter row for what the coach meant as one tag.
  // Import is where untrusted data enters the library, so it is normalised
  // here, the same way `setTags` normalises a tag typed by hand.
  const incoming = raw.map((entry) => parsePattern(entry)).map((pattern) =>
    pattern.tags === undefined ? pattern : { ...pattern, tags: normaliseTags(pattern.tags) },
  )

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
  setTags,
  allTags,
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
