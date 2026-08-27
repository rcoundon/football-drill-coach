import { computed, reactive, ref, toRaw } from 'vue'
import type {
  Ball,
  Counter,
  CounterColor,
  Drawing,
  Frame,
  Label,
  Marker,
  PitchType,
  SelectionRef,
  Vec,
} from '../types'
import { BALL_OFFSET, PITCH_H, PITCH_W, clampToPitch, distance, snapToAxis } from '../geometry'
import { MAX_FRAME_MS, MIN_FRAME_MS, interpolateFrames, timelineOf } from '../animation'
import type { FrameView } from '../animation'

export { BALL_OFFSET } from '../geometry'

export const UNDO_LIMIT = 50

/**
 * How close to a counter the ball must land to be taken into possession, in
 * pitch units.
 *
 * Deliberately SMALLER than COUNTER_SPACING: a snap radius wider than the gap
 * between counters would leave a laid-out squad with nowhere on the pitch a
 * coach could put the ball down and have it stay free. It does not need to
 * reach BALL_OFFSET, because `dropBall` measures to where an attached ball is
 * drawn as well as to the counter's centre.
 */
export const SNAP_RADIUS = 3.5

/** The drawn radius of a counter, in pitch units. Mirrors PlayerCounter's own RADIUS. */
export const COUNTER_RADIUS = 2.4

/**
 * Centre-to-centre distance a new counter keeps from every counter already
 * placed. Comfortably more than two drawn radii, so counters never touch.
 */
export const COUNTER_SPACING = 5.5

/**
 * How many balls a drill may have.
 *
 * Enough for any drill anyone has described — a ball per rondo grid, per
 * queue, per lane — and few enough that the pitch stays readable and the cap
 * can be a plain number rather than a policy.
 */
export const MAX_BALLS = 8

/** Centre-to-centre spacing between balls dropped one after another. */
const BALL_SPACING = 4

/** Minimum spacing between recorded freehand points, in pitch units. */
/** Room for a setup, coaching points and progressions, without unbounded paste. */
export const MAX_NOTES_LENGTH = 4000

/** Long enough for a coaching cue, short enough to stay readable on the pitch. */
export const MAX_LABEL_LENGTH = 40

export const MIN_PEN_STEP = 0.6

/** Arrows shorter than this are treated as an accidental tap. */
export const MIN_SEGMENT_LENGTH = 2

/**
 * The board as data: a list of moments, plus the settings that belong to the
 * drill rather than to any one of them.
 */
export type BoardSnapshot = {
  frames: Frame[]
  currentFrame: number
  labelsVisible: boolean
  /**
   * Whether the balls are on the pitch at all. Drill-wide, beside the other
   * two visibility settings: it used to ride on the ball itself, which put it
   * on the frame, so hiding the ball on one phase left it showing on the next.
   */
  ballsVisible: boolean
  notes: string
  notesVisible: boolean
  pitch: { type: PitchType; rotated: boolean }
}

/**
 * The board as everything else sees it: the data above, plus five accessors
 * onto whichever frame is current.
 *
 * The accessors are the reason roughly three hundred existing references to
 * `state.counters` and `state.ball` did not have to be rewritten when frames
 * arrived. Reading one through Vue's proxy tracks `frames` and
 * `currentFrame`, so switching frame re-renders without anything extra.
 */
export type BoardState = BoardSnapshot & FrameView

function emptyFrame(): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    // The board has always opened with a ball out. Not the pitch centre:
    // that is where the first counter lands, and the ball's hit circle would
    // sit on the counter's body, so the coach's first drag would grab the
    // ball instead of the player.
    balls: [{ id: 'ball-1', pos: { x: PITCH_W / 2, y: PITCH_H / 2 + 10 }, attachedTo: null }],
    drawings: [],
  }
}

function emptySnapshot(): BoardSnapshot {
  return {
    frames: [emptyFrame()],
    currentFrame: 0,
    labelsVisible: true,
    ballsVisible: true,
    notes: '',
    notesVisible: true,
    pitch: { type: 'blank', rotated: false },
  }
}

const FRAME_FIELDS = ['counters', 'markers', 'labels', 'balls', 'drawings'] as const

/**
 * Add the five accessors onto the current frame.
 *
 * Non-enumerable on purpose: a spread or a `structuredClone` of the state
 * must not materialise a second copy of the current frame's arrays alongside
 * the frame that owns them.
 */
function withFrameAccessors(base: BoardSnapshot): BoardState {
  const target = base as BoardState
  for (const field of FRAME_FIELDS) {
    Object.defineProperty(target, field, {
      enumerable: false,
      configurable: true,
      get(this: BoardState) {
        return this.frames[this.currentFrame][field]
      },
      set(this: BoardState, value: unknown) {
        ;(this.frames[this.currentFrame] as unknown as Record<string, unknown>)[field] = value
      },
    })
  }
  return target
}

/**
 * Deep copy. `toRaw` first: structuredClone throws DataCloneError on Vue's
 * reactive Proxy, and every snapshot starts from reactive state.
 */
function clone<T>(value: T): T {
  return structuredClone(toRaw(value))
}

const state = reactive<BoardState>(withFrameAccessors(emptySnapshot()))
const undoStack = ref<BoardSnapshot[]>([])
const redoStack = ref<BoardSnapshot[]>([])

/**
 * Where the drill is being watched from.
 *
 * `at` is milliseconds from the start of the drill. It is not part of the
 * snapshot: it is where the coach is looking, not something about the drill,
 * so it is neither saved nor undone. `currentFrame` is the part that is.
 *
 * The invariant, whenever the board is not playing and not being scrubbed:
 * `at === timeline.startOf(state.currentFrame)`.
 */
const playback = reactive({ playing: false, at: 0 })

const timeline = computed(() => timelineOf(state.frames))

const position = computed(() => timeline.value.at(playback.at))

/**
 * What the board draws.
 *
 * Parked on a frame this is the frame's own arrays, by identity, so nothing
 * about editing or rendering changes from before frames existed. Between two
 * frames it is a blend, which is derived and must never be written to — see
 * `isDerived`.
 */
const view = computed<FrameView>(() => {
  const { index, t } = position.value
  const frame = state.frames[index]
  if (t === 0 || index + 1 >= state.frames.length) return frame
  return interpolateFrames(frame, state.frames[index + 1], t)
})

/**
 * Set for the duration of a GIF export.
 *
 * An export drives the playhead by hand, sampling one moment at a time, and
 * a sample can land exactly on a frame — `position.value.t === 0` — where the
 * ordinary derived check would say editing is fine. It is not: `play()` or
 * `goToFrame()` firing mid-export would run a second clock, or jump the
 * playhead, against the export's own seek loop and corrupt the samples it is
 * already part-way through collecting. Folding this into `isDerived` closes
 * that gap the same way the blend check does, and for free locks every
 * ordinary mutator too — a player should not appear mid-export any more than
 * mid-play.
 */
const exportLock = ref(false)

/** True while what is on screen is a blend rather than a frame, or while a GIF export is sampling it. */
const isDerived = computed(() => playback.playing || position.value.t !== 0 || exportLock.value)

function beginExport(): void {
  exportLock.value = true
}

/** Release the lock `beginExport` took. Safe to call whether or not it did. */
function endExport(): void {
  exportLock.value = false
}

let idCounter = 0

/**
 * Filter an array that lives in reactive state, without poisoning it.
 *
 * Reading an array through Vue's reactive proxy hands back *proxied*
 * elements, so a plain `arr.filter(...)` produces a new array full of
 * proxies. Assigning that back stores proxies in the raw target, and
 * `structuredClone` — which every snapshot depends on — cannot clone a
 * proxy. The failure surfaces later and far away, as a DataCloneError on
 * the next unrelated commit.
 *
 * Unwrap first, and the survivors stay plain.
 */
function rawFilter<T>(array: T[], keep: (item: T) => boolean): T[] {
  return (toRaw(array) as T[]).filter((item) => keep(toRaw(item) as T))
}

/**
 * Every frame, unproxied.
 *
 * The cast is drill-wide: adding, removing or renaming a player, cone or
 * label applies to the whole drill, because a squad does not change halfway
 * through a session and a player popping into existence mid-animation is
 * never what anyone meant. Only positions and drawings belong to one moment.
 */
function allFrames(): Frame[] {
  return state.frames
}

/** A plain copy of the current state, safe to keep. */
function snapshot(): BoardSnapshot {
  const raw = toRaw(state)
  return structuredClone({
    frames: raw.frames,
    currentFrame: raw.currentFrame,
    labelsVisible: raw.labelsVisible,
    ballsVisible: raw.ballsVisible,
    notes: raw.notes,
    notesVisible: raw.notesVisible,
    pitch: raw.pitch,
  })
}

function apply(snap: BoardSnapshot): void {
  const copy = clone(snap)
  // A snapshot from a damaged draft, or a pattern whose frames were trimmed,
  // must not leave `currentFrame` pointing past the end: every accessor would
  // then read through `undefined` and the board would render as an exception
  // with no way back from inside the app.
  const frames = copy.frames?.length ? copy.frames : [emptyFrame()]
  state.frames = frames
  state.currentFrame = Math.max(0, Math.min(copy.currentFrame ?? 0, frames.length - 1))
  state.labelsVisible = copy.labelsVisible ?? true
  state.ballsVisible = copy.ballsVisible ?? true
  state.notes = copy.notes ?? ''
  state.notesVisible = copy.notesVisible ?? true
  state.pitch = copy.pitch
  playback.playing = false
  stopClock()
  playback.at = timeline.value.startOf(state.currentFrame)
}

let rafHandle: number | null = null
let lastTick = 0

function stopClock(): void {
  if (rafHandle !== null) cancelAnimationFrame(rafHandle)
  rafHandle = null
}

/**
 * Delta-timed rather than frame-counted, so a drill plays at the speed the
 * coach set it to on a slow tablet as well as a fast laptop.
 */
function tick(now: number): void {
  if (!playback.playing) return
  const delta = lastTick === 0 ? 0 : now - lastTick
  lastTick = now
  playback.at = Math.min(playback.at + delta, timeline.value.total)
  state.currentFrame = position.value.index
  if (playback.at >= timeline.value.total) {
    // Stops on the last frame. The exported GIF loops; a drill being
    // demonstrated wants to end somewhere.
    pause()
    return
  }
  rafHandle = requestAnimationFrame(tick)
}

function play(): void {
  // An export drives the playhead itself; a second clock racing its seek
  // loop is exactly what corrupts the samples.
  if (exportLock.value) return
  if (playback.playing) return
  if (timeline.value.total <= 0) return
  // At the very end, play means play again — a button that appears to do
  // nothing is worse than one that starts over.
  if (playback.at >= timeline.value.total) playback.at = 0
  playback.playing = true
  lastTick = 0
  state.currentFrame = position.value.index
  rafHandle = requestAnimationFrame(tick)
}

function pause(): void {
  playback.playing = false
  stopClock()
  state.currentFrame = position.value.index
}

function rewind(): void {
  pause()
  playback.at = 0
  state.currentFrame = 0
}

/** Drag-time. Leaves the view derived, so editing stays blocked. */
function scrubTo(ms: number): void {
  pause()
  playback.at = Math.max(0, Math.min(ms, timeline.value.total))
  state.currentFrame = position.value.index
}

/**
 * Release. Lands on the nearer frame, so the board is never left parked
 * mid-move refusing every drag with nothing on screen saying why.
 */
function endScrub(): void {
  const { index, t } = position.value
  const target = t > 0.5 ? Math.min(index + 1, state.frames.length - 1) : index
  goToFrame(target)
}

/**
 * Refuse a change while the board is showing a blend of two frames.
 *
 * The blend is a derived object: writing to it would be thrown away on the
 * next tick, and the coach would drag a player and watch nothing happen.
 * Blocking here rather than only in the component means no future caller can
 * forget.
 *
 * `addCounter`, `addMarker`, `startPen`, `startArrow` and `startLine` are
 * deliberately NOT guarded with this. Guarding them would mean changing a
 * return type that dozens of existing tests depend on, for no gain: every one
 * of them is reached only through `PitchBoard`'s pointer handlers or the
 * toolbar's player swatches, both of which are blocked elsewhere. Do not add
 * a guard to them later — it breaks that return type and the tests with it.
 *
 * `commit()` is deliberately NOT guarded with this either, even though every
 * moment-writer above already refuses at its own first line and so never
 * reaches it while derived. `setNotes`, the visibility toggles, `setPitchType`
 * and `setRotated` are drill-wide and stay callable while derived on purpose —
 * and they still call `commit()`. Guarding it there would silently drop their
 * undo entry while letting the mutation through, which is worse than doing
 * nothing: an edit that cannot be undone. Do not add a guard to `commit()`
 * later for the same reason.
 */
function locked(): boolean {
  return isDerived.value
}

/**
 * Record the state as it was BEFORE the caller's mutation.
 *
 * Call this immediately before mutating. Everything that changes the board
 * goes through here — that is what makes undo correct by construction.
 *
 * Returns the entry it pushed, so a caller that may later need to take its
 * own entry back can identify it without assuming where in the stack it sits.
 */
function commit(): BoardSnapshot {
  const entry = snapshot()
  undoStack.value.push(entry)
  if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
  redoStack.value = []
  return entry
}

function undo(): void {
  if (locked()) return
  const previous = undoStack.value.pop()
  if (!previous) return
  redoStack.value.push(snapshot())
  apply(previous)
}

function redo(): void {
  if (locked()) return
  const next = redoStack.value.pop()
  if (!next) return
  undoStack.value.push(snapshot())
  apply(next)
}

/**
 * Mint an id that is unique by construction, across sessions as well as
 * within one.
 *
 * A plain incrementing counter is not enough: the autosaved draft is
 * restored on every page load, so the board already holds ids minted by an
 * earlier run of this module while the counter has restarted at zero. The
 * next id then collides with a live object and every lookup that follows
 * (`counterById`, `deleteCounter`, the possession ring, Vue's `:key`,
 * `DrawingLayer`'s marker ids) silently targets the wrong one.
 *
 * Time gives cross-session uniqueness, the counter gives uniqueness within
 * a millisecond, and the random suffix covers two sessions starting in the
 * same millisecond. Nothing has to remember to scan restored ids, so no
 * future caller can forget to.
 */
function newId(): string {
  idCounter += 1
  const time = Date.now().toString(36)
  const seq = idCounter.toString(36)
  const random = Math.random().toString(36).slice(2, 6)
  return `o${time}${seq}${random}`
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

/**
 * Clear the board for the next drill.
 *
 * The pitch type and orientation deliberately survive: the next drill is
 * nearly always on the same pitch, and snapping back to a blank landscape
 * view would mean re-selecting it every time.
 */
function resetBoard(): void {
  if (locked()) return
  commit()
  apply({ ...emptySnapshot(), pitch: { ...toRaw(state).pitch } })
}

/**
 * Remove every counter, leaving drawings and the pitch untouched.
 *
 * A ball being carried is set down where it was riding rather than removed,
 * matching what deleting its holder already does — the drill still has a
 * ball in it, it just no longer belongs to anyone.
 */
function clearCounters(): void {
  if (locked()) return
  if (state.counters.length === 0) return
  commit()
  for (const frame of allFrames()) {
    // Every ball someone was carrying is set down where it was being carried,
    // rather than removed: the drill still has its balls, they just no longer
    // belong to anyone.
    for (const ball of frame.balls) {
      if (!ball.attachedTo) continue
      ball.pos = ballRestPositionIn(frame, ball)
      ball.attachedTo = null
    }
    frame.counters = []
  }
}

function loadSnapshot(snap: BoardSnapshot): void {
  if (locked()) return
  commit()
  apply(snap)
}

/**
 * Put a snapshot on the board WITHOUT an undo entry.
 *
 * For restoring the autosaved draft at startup, which is not something the
 * coach did and so must not be undoable. Committing it leaves a freshly
 * opened app with one undo entry — an empty board — so a reflexive Ctrl+Z
 * wipes the restored work, and the debounced autosave then writes the empty
 * board over the draft.
 */
function restoreSnapshot(snap: BoardSnapshot): void {
  apply(snap)
}

/**
 * Add a moment, as a copy of the one the coach is on.
 *
 * A copy rather than a blank board, because the next frame of a drill is
 * nearly always the same players a few yards further on. It also means the
 * cast stays in step without anything having to enforce it, and the drawings
 * carry over so the arrow describing a pass survives until the pass has
 * happened and the coach rubs it out.
 */
function addFrame(): number {
  if (locked()) return state.currentFrame
  commit()
  const index = state.currentFrame + 1
  state.frames.splice(index, 0, clone(toRaw(state).frames[state.currentFrame]))
  state.currentFrame = index
  parkPlayhead()
  return index
}

/** A drill has to be something. The last frame cannot be removed. */
function deleteFrame(index: number): void {
  if (locked()) return
  if (state.frames.length <= 1) return
  if (index < 0 || index >= state.frames.length) return
  commit()
  state.frames.splice(index, 1)
  // A frame removed from earlier in the drill shifts everything after it
  // down, the one being watched included. Without this the coach deletes
  // frame 1 and finds themselves looking at a different moment.
  if (index < state.currentFrame) state.currentFrame -= 1
  else state.currentFrame = Math.min(state.currentFrame, state.frames.length - 1)
  parkPlayhead()
}

/** Reorder, keeping the coach on the frame they were looking at. */
function moveFrame(from: number, to: number): void {
  if (locked()) return
  const last = state.frames.length - 1
  if (from < 0 || from > last || to < 0 || to > last || from === to) return
  commit()
  // Follow the frame the coach is watching wherever the reorder puts it,
  // including when it is some other frame that moved across it.
  const watched = state.frames[state.currentFrame]
  const [frame] = state.frames.splice(from, 1)
  state.frames.splice(to, 0, frame)
  const found = state.frames.indexOf(watched)
  if (found === -1) throw new Error('moveFrame lost track of the watched frame')
  state.currentFrame = found
  parkPlayhead()
}

function setFrameDuration(index: number, ms: number): void {
  if (locked()) return
  const frame = state.frames[index]
  if (!frame) return
  commit()
  frame.duration = Math.round(Math.max(MIN_FRAME_MS, Math.min(MAX_FRAME_MS, ms)))
  // Retiming a phase moves where every phase after it begins, this one
  // included, so where the playhead is parked has just changed meaning.
  parkPlayhead()
}

/**
 * Select a frame. Deliberately not a commit: looking at a moment changes
 * nothing about the drill, and stepping through five frames to read them
 * should not bury real work under five entries that changed nothing.
 */
/**
 * Park the playhead at the start of whichever phase the coach is now on.
 *
 * The board renders whatever phase the PLAYHEAD is on, while edits go to
 * `currentFrame`. Any operation that moves the coach to a different phase must
 * therefore move the playhead too — otherwise they edit one phase while
 * looking at another, and a drag appears to do nothing because it landed on a
 * phase that is not on screen. Adding, deleting and reordering a phase each
 * did exactly that before this existed.
 */
function parkPlayhead(): void {
  playback.at = timeline.value.startOf(state.currentFrame)
}

function goToFrame(index: number): void {
  // Jumping the playhead mid-export would desync it from the export's own
  // seek loop, the same way play() would.
  if (exportLock.value) return
  if (index < 0 || index >= state.frames.length) return
  pause()
  state.currentFrame = index
  parkPlayhead()
}

function counterById(id: string): Counter | undefined {
  return state.counters.find((c) => c.id === id)
}

/** True when no counter already sits close enough to hide a counter placed at `p`. */
function isClearOfCounters(p: Vec): boolean {
  return state.counters.every((c) => distance(c.pos, p) >= COUNTER_SPACING)
}

/** True when a counter drawn at `p` sits wholly inside the pitch. */
function isInsidePitch(p: Vec): boolean {
  return (
    p.x >= COUNTER_RADIUS &&
    p.x <= PITCH_W - COUNTER_RADIUS &&
    p.y >= COUNTER_RADIUS &&
    p.y <= PITCH_H - COUNTER_RADIUS
  )
}

/**
 * Where to drop the next counter.
 *
 * Straight to the centre while the centre is free, then outward in rings of
 * candidate positions. Deterministic — the same board always yields the
 * same spot — and it reuses the gap a deleted counter left rather than
 * drifting outward forever. Candidates that would put a counter over the
 * touchline are skipped, so the result is always inside the pitch.
 */
function nextCounterPosition(): Vec {
  const centre = { x: PITCH_W / 2, y: PITCH_H / 2 }
  if (isClearOfCounters(centre)) return centre

  const rings = Math.ceil(Math.max(PITCH_W, PITCH_H) / COUNTER_SPACING)
  for (let ring = 1; ring <= rings; ring++) {
    const radius = ring * COUNTER_SPACING
    const steps = ring * 8
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps
      const candidate = {
        x: centre.x + radius * Math.cos(angle),
        y: centre.y + radius * Math.sin(angle),
      }
      if (!isInsidePitch(candidate)) continue
      if (isClearOfCounters(candidate)) return candidate
    }
  }

  // A pitch this full has nowhere clear left; stacking beats refusing to add.
  return centre
}

/**
 * Counters arrive unlabelled. Most drills are explained by colour and
 * position, and an automatic number is one the coach has to clear before
 * writing the one they actually wanted. Double-press a counter to label it.
 */
function addCounter(color: CounterColor): Counter {
  commit()
  const counter: Counter = {
    id: newId(),
    color,
    label: '',
    pos: nextCounterPosition(),
  }
  // Same id and same spot on every frame, so a new player stands still until
  // the coach moves them somewhere.
  for (const frame of allFrames()) frame.counters.push(clone(counter))
  // Looked back up rather than returning `counter` itself: the caller gets
  // the live counter on the current frame, which keeps tracking it the way
  // every other lookup does, rather than a detached copy left stale by the
  // next move.
  return counterById(counter.id)!
}

/**
 * The last commit made by note typing, if the very next change was also
 * note typing. Committing per keystroke would bury every other undo entry
 * under a drill's worth of characters.
 */
let notesUndoEntry: BoardSnapshot | null = null

function setNotes(text: string): void {
  const clean = text.slice(0, MAX_NOTES_LENGTH)
  if (clean === state.notes) return
  // Coalesce consecutive typing: only the first keystroke of a run commits.
  // Compare against the raw entry — reading the stack through the ref hands
  // back a proxy, which never matches the object commit() returned.
  const top = undoStack.value.at(-1)
  if (notesUndoEntry === null || (top && toRaw(top) !== notesUndoEntry)) {
    notesUndoEntry = commit()
  }
  state.notes = clean
}

function toggleNotesVisible(): void {
  commit()
  state.notesVisible = !state.notesVisible
}

function labelById(id: string): Label | undefined {
  return state.labels.find((l) => l.id === id)
}

/** Trimmed and capped; an empty label is not worth putting on the pitch. */
function cleanLabelText(text: string): string {
  return text.trim().slice(0, MAX_LABEL_LENGTH)
}

function addLabel(at: Vec, text: string): Label | null {
  if (locked()) return null
  const clean = cleanLabelText(text)
  if (clean === '') return null
  commit()
  const label: Label = { id: newId(), pos: clampToPitch(at), text: clean }
  for (const frame of allFrames()) frame.labels.push(clone(label))
  // Read back out of state rather than returning the local `label` that was
  // cloned in: the clone pushed into every frame's array is a copy, so the
  // local is an orphan that would never again reflect a later move.
  return labelById(label.id)!
}

/** Clearing the text removes the label: an empty one has nothing to say. */
function setLabelText(id: string, text: string): void {
  if (locked()) return
  const label = labelById(id)
  if (!label) return
  const clean = cleanLabelText(text)
  commit()
  for (const frame of allFrames()) {
    if (clean === '') {
      frame.labels = rawFilter(frame.labels, (l) => l.id !== id)
      continue
    }
    const target = frame.labels.find((l) => l.id === id)
    if (target) target.text = clean
  }
}

/** Called on every pointer-move of a drag, so it deliberately does not commit. */
function moveLabel(id: string, pos: Vec): void {
  if (locked()) return
  const label = labelById(id)
  if (!label) return
  label.pos = clampToPitch(pos)
}

function deleteLabel(id: string): void {
  if (locked()) return
  if (!labelById(id)) return
  commit()
  for (const frame of allFrames()) {
    frame.labels = rawFilter(frame.labels, (l) => l.id !== id)
  }
}

function toggleLabelsVisible(): void {
  commit()
  state.labelsVisible = !state.labelsVisible
}

function markerById(id: string): Marker | undefined {
  return state.markers.find((m) => m.id === id)
}

/**
 * Drop a cone exactly where the coach tapped.
 *
 * Unlike a player, a cone is not shuffled clear of its neighbours: cones
 * are laid out in deliberate shapes — gates, grids, channels — and moving
 * one off the spot it was placed would defeat the point.
 */
function addMarker(at: Vec): Marker {
  commit()
  const marker: Marker = { id: newId(), pos: clampToPitch(at) }
  for (const frame of allFrames()) frame.markers.push(clone(marker))
  return markerById(marker.id)!
}

/** Called on every pointer-move of a drag, so it deliberately does not commit. */
function moveMarker(id: string, pos: Vec): void {
  if (locked()) return
  const marker = markerById(id)
  if (!marker) return
  marker.pos = clampToPitch(pos)
}

function deleteMarker(id: string): void {
  if (locked()) return
  if (!markerById(id)) return
  commit()
  for (const frame of allFrames()) {
    frame.markers = rawFilter(frame.markers, (m) => m.id !== id)
  }
}

/** Called on every pointer-move of a drag, so it deliberately does not commit. */
function moveCounter(id: string, pos: Vec): void {
  if (locked()) return
  const counter = counterById(id)
  if (!counter) return
  counter.pos = clampToPitch(pos)
}

function setCounterLabel(id: string, label: string): void {
  if (locked()) return
  const counter = counterById(id)
  if (!counter) return
  commit()
  const clean = label.trim().slice(0, 4)
  for (const frame of allFrames()) {
    const target = frame.counters.find((c) => c.id === id)
    if (target) target.label = clean
  }
}

function deleteCounter(id: string): void {
  if (locked()) return
  const index = state.counters.findIndex((c) => c.id === id)
  if (index === -1) return
  commit()
  for (const frame of allFrames()) {
    const victim = frame.counters.find((c) => c.id === id)
    if (victim) {
      for (const ball of frame.balls) {
        if (ball.attachedTo !== id) continue
        ball.pos = { ...victim.pos }
        ball.attachedTo = null
      }
    }
    frame.counters = rawFilter(frame.counters, (c) => c.id !== id)
  }
}

/** Drag-time move. Detaches from any holder; does not commit. */
/**
 * Show or hide every ball, keeping who was carrying what either way.
 *
 * Drill-wide, like the labels and the notes. It used to write through the
 * frame accessor, so hiding the ball on one phase left it showing on the next
 * — a bug nobody met, because it predates phases and there was only one ball.
 */
function toggleBallsVisible(): void {
  commit()
  state.ballsVisible = !state.ballsVisible
}

function ballById(id: string): Ball | undefined {
  return state.balls.find((b) => b.id === id)
}

/**
 * Where the next ball goes.
 *
 * Stepped along from the one before rather than dropped on top of it, so a
 * coach can see they got a second ball. Clamped, so a drill already using the
 * right touchline does not put the next one off the pitch.
 */
function nextBallPosition(): Vec {
  const last = state.balls[state.balls.length - 1]
  if (!last) return { x: PITCH_W / 2, y: PITCH_H / 2 + 10 }

  const isFree = (p: Vec) => state.balls.every((b) => b.pos.x !== p.x || b.pos.y !== p.y)

  /*
   * Stepping once from the last ball is not enough on its own. Clamping means
   * a ball on the touchline puts every one after it on the same unreachable
   * spot, and stepping blindly can land exactly on some OTHER ball, since the
   * last one added is not necessarily the nearest. So try outwards in both
   * directions, then downwards, and take the first spot nothing occupies.
   */
  for (let step = 1; step <= MAX_BALLS; step++) {
    for (const candidate of [
      { x: last.pos.x + BALL_SPACING * step, y: last.pos.y },
      { x: last.pos.x - BALL_SPACING * step, y: last.pos.y },
      { x: last.pos.x, y: last.pos.y + BALL_SPACING * step },
      { x: last.pos.x, y: last.pos.y - BALL_SPACING * step },
    ]) {
      const at = clampToPitch(candidate)
      if (isFree(at)) return at
    }
  }

  // A pitch this crowded has nowhere clear left; stacking beats refusing to
  // add, the same trade `nextCounterPosition` makes.
  return clampToPitch({ x: last.pos.x + BALL_SPACING, y: last.pos.y })
}

/**
 * Put another ball out, free, on every phase.
 *
 * A ball is cast, like a player: it exists for the whole drill, and only where
 * it stands differs from phase to phase. Returns null at the cap so a caller
 * can tell the difference between "added" and "there are already eight".
 */
function addBall(): Ball | null {
  if (locked()) return null
  if (state.balls.length >= MAX_BALLS) return null
  commit()
  const ball: Ball = { id: newId(), pos: nextBallPosition(), attachedTo: null }
  for (const frame of allFrames()) frame.balls.push(clone(ball))
  return ballById(ball.id) ?? null
}

/**
 * Take a ball off every phase.
 *
 * Unlike a frame there is no floor at one: a shape or pressing drill has no
 * ball in it at all, and the visibility toggle is for hiding balls a drill
 * still has rather than for pretending it has none.
 */
function removeBall(id: string): void {
  if (locked()) return
  if (!ballById(id)) return
  commit()
  for (const frame of allFrames()) {
    frame.balls = rawFilter(frame.balls, (b) => b.id !== id)
  }
}

/** Drag-time move of one ball. Detaches it from any holder; does not commit. */
function moveBall(id: string, pos: Vec): void {
  if (locked()) return
  const ball = ballById(id)
  if (!ball) return
  ball.attachedTo = null
  ball.pos = clampToPitch(pos)
}

/** Where this counter's ball would be drawn if it had possession. */
function ballRestPosition(counter: Counter): Vec {
  return { x: counter.pos.x + BALL_OFFSET.x, y: counter.pos.y + BALL_OFFSET.y }
}

/**
 * How far a ball released at `at` is from belonging to `counter`.
 *
 * Measured to the counter's centre AND to where its ball would be drawn,
 * whichever is nearer. Both matter: dropping the ball onto a player is the
 * obvious way to give it to them, but an attached ball is DRAWN one
 * BALL_OFFSET away, so releasing it where it already sits is a full offset
 * from the holder's centre — and often much closer to a neighbour's. Measuring
 * to centres alone therefore handed the ball to the wrong player on the very
 * layout `nextCounterPosition` produces.
 */
function ballDistanceTo(counter: Counter, at: Vec): number {
  return Math.min(distance(at, counter.pos), distance(at, ballRestPosition(counter)))
}

/** Pointer-up. Resolves possession; does not commit. */
/**
 * Pointer-up on one ball. Resolves possession; does not commit.
 *
 * A player already carrying a ball is passed over, so a ball dropped on
 * occupied feet stays free where it landed rather than displacing theirs.
 * Swapping was considered and rejected: balls are interchangeable and look
 * alike, so either way the coach sees one ball attached and one free nearby —
 * swapping only changes which ball is which internally, which surfaces in
 * playback alone.
 */
function dropBall(id: string, pos: Vec): void {
  if (locked()) return
  const ball = ballById(id)
  if (!ball) return
  const at = clampToPitch(pos)
  ball.pos = at

  const taken = new Set(
    state.balls.filter((b) => b.id !== id && b.attachedTo).map((b) => b.attachedTo as string),
  )

  let nearest: Counter | undefined
  let nearestDistance = Infinity
  for (const counter of state.counters) {
    if (taken.has(counter.id)) continue
    const d = ballDistanceTo(counter, at)
    if (d < nearestDistance) {
      nearestDistance = d
      nearest = counter
    }
  }

  ball.attachedTo = nearest && nearestDistance <= SNAP_RADIUS ? nearest.id : null
}

/** Where the ball should actually be drawn. */
/** Where one ball should actually be drawn, in a given frame. */
function ballRestPositionIn(frame: Frame, ball: Ball): Vec {
  if (ball.attachedTo) {
    const holder = frame.counters.find((c) => c.id === ball.attachedTo)
    if (holder) return ballRestPosition(holder)
  }
  return ball.pos
}

/** Where one ball should actually be drawn on the frame being edited. */
function ballPosition(id: string): Vec {
  const ball = ballById(id)
  if (!ball) return { x: 0, y: 0 }
  if (ball.attachedTo) {
    const holder = counterById(ball.attachedTo)
    if (holder) return ballRestPosition(holder)
  }
  return ball.pos
}

function drawingById(id: string): Drawing | undefined {
  return state.drawings.find((d) => d.id === id)
}

/**
 * The undo entry each in-progress stroke's start pushed, kept by drawing id.
 *
 * A stroke that turns out to be a stray tap has to take its own entry back.
 * It cannot assume that entry is on top of the stack: the toolbar sits
 * outside the board's pointer capture, so a second finger can change the
 * pitch — pushing another entry — while the stroke is still down.
 */
const strokeUndoEntries = new Map<string, BoardSnapshot>()

function startPen(at: Vec, color: string): string {
  const entry = commit()
  const id = newId()
  strokeUndoEntries.set(id, entry)
  state.drawings.push({ id, kind: 'pen', color, points: [clampToPitch(at)] })
  return id
}

/** Drag-time; does not commit. Skips points too close to the previous one. */
function extendPen(id: string, at: Vec): void {
  if (locked()) return
  const drawing = drawingById(id)
  if (!drawing || drawing.kind !== 'pen') return
  const point = clampToPitch(at)
  const last = drawing.points[drawing.points.length - 1]
  if (last && distance(last, point) < MIN_PEN_STEP) return
  drawing.points.push(point)
}

function startArrow(at: Vec, color: string, style: 'run' | 'pass'): string {
  const entry = commit()
  const id = newId()
  strokeUndoEntries.set(id, entry)
  const point = clampToPitch(at)
  state.drawings.push({ id, kind: 'arrow', color, style, from: point, to: { ...point } })
  return id
}

function startLine(at: Vec, color: string): string {
  const entry = commit()
  const id = newId()
  strokeUndoEntries.set(id, entry)
  const point = clampToPitch(at)
  state.drawings.push({ id, kind: 'line', color, from: point, to: { ...point } })
  return id
}

/**
 * Drag-time for anything dragged out as a straight segment; does not commit.
 *
 * Lines snap to the horizontal or vertical when they are close to it, since
 * a zone edge is meant to be straight. Arrows deliberately do not: an arrow
 * traces a run or a pass, and squaring it off would misstate the movement.
 */
function updateSegment(id: string, to: Vec): void {
  if (locked()) return
  const drawing = drawingById(id)
  if (!drawing || drawing.kind === 'pen') return
  const point = clampToPitch(to)
  drawing.to = drawing.kind === 'line' ? snapToAxis(drawing.from, point) : point
}

/**
 * Bow an arrow off its straight line, and set where along it the bow peaks.
 * Called on every pointer-move of a handle drag, so it deliberately does not
 * commit — the grab does that.
 *
 * Zeroes are stored as absent fields rather than zeroes, so a straightened
 * arrow is indistinguishable from one that was never bent and an even arc
 * from one that was never skewed. Straightening drops the skew as well:
 * there is no peak to place on an arrow with no bow.
 */
function setArrowBend(id: string, bend: number, bendAlong = 0): void {
  if (locked()) return
  const drawing = drawingById(id)
  if (!drawing || drawing.kind !== 'arrow') return
  if (bend === 0) {
    delete drawing.bend
    delete drawing.bendAlong
    return
  }
  drawing.bend = bend
  if (bendAlong === 0) delete drawing.bendAlong
  else drawing.bendAlong = bendAlong
}

/**
 * Move one end of a segment that is already drawn. Called on every
 * pointer-move of a handle drag, so it deliberately does not commit — the
 * grab does that.
 *
 * A line still snaps to the horizontal or vertical, exactly as it does while
 * being drawn, and it snaps against the end that stayed put rather than
 * always against its start. An arrow still does not: it traces a run or a
 * pass, and squaring it off would misstate the movement.
 *
 * A curve needs nothing done to it. `bend` and `bendAlong` are held against
 * the chord, so the bow keeps its shape and its lean while the ends move.
 */
function moveSegmentEnd(id: string, end: 'from' | 'to', pos: Vec): void {
  if (locked()) return
  const drawing = drawingById(id)
  if (!drawing || drawing.kind === 'pen') return
  const anchor = end === 'to' ? drawing.from : drawing.to
  const point = clampToPitch(pos)
  drawing[end] = drawing.kind === 'line' ? snapToAxis(anchor, point) : point
}

/** Every point a drawing is made of, in no particular order. */
function pointsOf(drawing: Drawing): Vec[] {
  return drawing.kind === 'pen' ? drawing.points : [drawing.from, drawing.to]
}

/**
 * Slide a whole drawing across the pitch. Called on every pointer-move of a
 * drag, so it deliberately does not commit — the drag does that on its first
 * real movement.
 *
 * The delta is trimmed against the drawing's bounding box rather than each
 * point being clamped on its own. Clamping points individually squashes a
 * shape against the touchline instead of stopping it there, which turns a
 * drag off the edge into silent damage. Trimming also lets a drawing already
 * resting on an edge keep sliding along it.
 *
 * A curve needs nothing done to it: `bend` and `bendAlong` are held against
 * the chord, so the bow travels with its ends.
 */
function translateDrawing(id: string, delta: Vec): void {
  if (locked()) return
  translateGroup([{ kind: 'drawing', id }], delta)
}

/**
 * The points a selected thing is made of, or null when it is no longer on
 * the board. Tokens have one; a drawing has all of its own.
 *
 * The arrays are the live objects, not copies, so moving a group is a matter
 * of adding to what comes back.
 */
function pointsOfRef(ref: SelectionRef): Vec[] | null {
  if (ref.kind === 'drawing') {
    const drawing = drawingById(ref.id)
    return drawing ? pointsOf(drawing) : null
  }
  const token =
    ref.kind === 'counter'
      ? counterById(ref.id)
      : ref.kind === 'marker'
        ? markerById(ref.id)
        : ref.kind === 'ball'
          ? ballById(ref.id)
          : labelById(ref.id)
  return token ? [token.pos] : null
}

/**
 * Slide a set of points, trimming the move so the shape stays on the pitch.
 *
 * The delta is trimmed rather than each point clamped: clamping collapses a
 * shape against the touchline, and trimming lets a shape already on an edge
 * keep sliding along it. Something wider than the pitch cannot be brought
 * inside and squeezing it would distort it, so the room it has is allowed to
 * go negative and the min/max simply cancel the move on that axis.
 */
function translatePoints(points: Vec[], delta: Vec): void {
  if (points.length === 0) return

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)

  const dx = Math.min(PITCH_W - Math.max(...xs), Math.max(-Math.min(...xs), delta.x))
  const dy = Math.min(PITCH_H - Math.max(...ys), Math.max(-Math.min(...ys), delta.y))

  for (const point of points) {
    point.x += dx
    point.y += dy
  }
}

/**
 * Slide a whole group across the pitch. Called on every pointer-move of a
 * drag, so it deliberately does not commit.
 *
 * Members that have since gone are skipped rather than treated as being at
 * the origin, which would drag the whole group towards the corner.
 */
function translateGroup(refs: SelectionRef[], delta: Vec): void {
  if (locked()) return
  translatePoints(refs.flatMap((ref) => pointsOfRef(ref) ?? []), delta)
}

/** The live position points of a reference, within one frame. */
function pointsOfRefIn(frame: Frame, ref: SelectionRef): Vec[] | null {
  if (ref.kind === 'counter') {
    const counter = frame.counters.find((c) => c.id === ref.id)
    return counter ? [counter.pos] : null
  }
  if (ref.kind === 'marker') {
    const marker = frame.markers.find((m) => m.id === ref.id)
    return marker ? [marker.pos] : null
  }
  if (ref.kind === 'label') {
    const label = frame.labels.find((l) => l.id === ref.id)
    return label ? [label.pos] : null
  }
  if (ref.kind === 'ball') {
    const ball = frame.balls.find((b) => b.id === ref.id)
    return ball ? [ball.pos] : null
  }
  const drawing = frame.drawings.find((d) => d.id === ref.id)
  return drawing ? pointsOf(drawing) : null
}

/**
 * Take a whole group off the board in one undo entry, rather than one per
 * member — a coach who boxed a shape and pressed Delete meant one action.
 *
 * The cast comes off every frame; a drawing belongs to the moment it
 * describes, so it comes off only this one.
 *
 * A ball being carried by a deleted player is set down where it was riding,
 * matching what deleting a single player already does: the drill still has a
 * ball in it, it just no longer belongs to anyone.
 */
function deleteGroup(refs: SelectionRef[]): void {
  if (locked()) return
  if (refs.length === 0) return
  const ids = {
    counter: new Set<string>(),
    marker: new Set<string>(),
    label: new Set<string>(),
    drawing: new Set<string>(),
    ball: new Set<string>(),
  }
  for (const ref of refs) ids[ref.kind].add(ref.id)

  commit()

  for (const frame of allFrames()) {
    for (const ball of frame.balls) {
      if (!ball.attachedTo || !ids.counter.has(ball.attachedTo)) continue
      ball.pos = ballRestPositionIn(frame, ball)
      ball.attachedTo = null
    }
    frame.counters = rawFilter(frame.counters, (c) => !ids.counter.has(c.id))
    frame.markers = rawFilter(frame.markers, (m) => !ids.marker.has(m.id))
    frame.labels = rawFilter(frame.labels, (l) => !ids.label.has(l.id))
    // A ball is cast, like a player: removed from the whole drill, not one phase.
    frame.balls = rawFilter(frame.balls, (b) => !ids.ball.has(b.id))
  }

  // Drawings belong to the moment, so only this one loses them.
  state.drawings = rawFilter(state.drawings, (d) => !ids.drawing.has(d.id))
}

/**
 * Copy a whole group, offset a little so the copy is plainly a copy rather
 * than something that quietly landed on top of the original.
 *
 * The copy joins the cast on every frame, offset from wherever the original
 * stands on that frame, so a duplicated player repeats the original's run
 * rather than standing still through it. A drawing belongs to the moment it
 * describes, so only the current frame gets a copy of one.
 *
 * Returns the copies, so the caller can leave the coach holding them: the
 * next thing anyone does after duplicating a shape is drag it into place. A
 * copied player never inherits the ball — a drill has one ball, and
 * duplicating a shape is not a reason to grow another.
 */
function duplicateGroup(refs: SelectionRef[], offset: Vec): SelectionRef[] {
  if (locked()) return []
  const live = refs.filter((ref) => pointsOfRef(ref) !== null)
  if (live.length === 0) return []

  /*
   * Balls are capped, so only as many as there is room for are copied. Worked
   * out before any frame is touched, because the answer has to be the same for
   * every phase — a cap applied per phase would leave a ball on some and not
   * others, which is exactly what the cast rule exists to prevent.
   *
   * And before `commit`, so a copy that turns out to be entirely refused does
   * not leave an undo entry for work that never happened.
   */
  const room = MAX_BALLS - state.balls.length
  let ballsSoFar = 0
  const copyable = live.filter((ref) => ref.kind !== 'ball' || ballsSoFar++ < room)
  if (copyable.length === 0) return []

  commit()

  // One new id per original, shared by that original's copy on every frame,
  // so the copies are one player rather than one per moment.
  const copies: SelectionRef[] = copyable.map((ref) => ({ kind: ref.kind, id: newId() }))

  allFrames().forEach((frame, index) => {
    const isCurrent = index === state.currentFrame
    const made: SelectionRef[] = []

    copyable.forEach((ref, i) => {
      const copyId = copies[i].id
      if (ref.kind === 'counter') {
        const original = frame.counters.find((c) => c.id === ref.id)
        if (!original) return
        // Cloned whole rather than field by field, so anything a counter
        // grows later comes along without being listed here. A copy never
        // inherits the ball: a drill has one ball, and duplicating a shape is
        // not a reason to grow another.
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.counters.push(copy)
      } else if (ref.kind === 'marker') {
        const original = frame.markers.find((m) => m.id === ref.id)
        if (!original) return
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.markers.push(copy)
      } else if (ref.kind === 'label') {
        const original = frame.labels.find((l) => l.id === ref.id)
        if (!original) return
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.labels.push(copy)
      } else if (ref.kind === 'ball') {
        const original = frame.balls.find((b) => b.id === ref.id)
        if (!original) return
        const copy = clone(toRaw(original))
        copy.id = copyId
        // Free, whatever the original was doing. A drill has the carriers it
        // has, and copying a shape is not a reason to grow another.
        copy.attachedTo = null
        frame.balls.push(copy)
      } else {
        // Drawings belong to the moment, so only this one gets a copy.
        if (!isCurrent) return
        const original = frame.drawings.find((d) => d.id === ref.id)
        if (!original) return
        const copy = clone(toRaw(original))
        copy.id = copyId
        frame.drawings.push(copy)
      }
      made.push(copies[i])
    })

    // Each frame is trimmed against the pitch on its own, so a copy made
    // beside a touchline in one moment is not pushed off in another.
    translatePoints(made.flatMap((ref) => pointsOfRefIn(frame, ref) ?? []), offset)
  })

  return copies
}

/** Erase every trace of a drawing from the undo and redo history. */
function forgetDrawingInHistory(id: string): void {
  for (const stack of [undoStack, redoStack]) {
    for (const entry of stack.value) {
      for (const frame of entry.frames) {
        frame.drawings = rawFilter(frame.drawings, (d) => d.id !== id)
      }
    }
  }
}

/**
 * End a stroke. A stroke too small to be intentional is removed, along with
 * the undo entry its start pushed, so a stray tap leaves no trace.
 *
 * The invariant this relies on: `startPen`/`startArrow`/`startLine` recorded the exact
 * entry object they pushed, so it is found by identity. It is deliberately
 * NOT assumed to be on top of the stack — the toolbar lives outside the
 * board's pointer capture, so a second finger can commit (a pitch change,
 * say) between the press and the release, and popping blind would silently
 * throw that unrelated entry away instead. Snapshots taken during the
 * stroke are scrubbed of the discarded drawing too, so undoing back past
 * the stroke cannot resurrect it.
 */
function finishDrawing(id: string): void {
  const drawing = drawingById(id)
  const startEntry = strokeUndoEntries.get(id)
  strokeUndoEntries.delete(id)
  if (!drawing) return

  const degenerate =
    drawing.kind === 'pen'
      ? drawing.points.length < 2
      : distance(drawing.from, drawing.to) < MIN_SEGMENT_LENGTH

  if (!degenerate) return

  state.drawings = rawFilter(state.drawings, (d) => d.id !== id)

  if (startEntry) {
    const index = undoStack.value.findIndex((entry) => toRaw(entry) === startEntry)
    if (index !== -1) undoStack.value.splice(index, 1)
  }
  forgetDrawingInHistory(id)
}

function deleteDrawing(id: string): void {
  if (locked()) return
  const index = state.drawings.findIndex((d) => d.id === id)
  if (index === -1) return
  commit()
  state.drawings.splice(index, 1)
}

function clearDrawings(): void {
  if (locked()) return
  if (state.frames.every((frame) => frame.drawings.length === 0)) return
  commit()
  for (const frame of allFrames()) frame.drawings = []
}

const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

const board = {
  state,
  commit,
  undo,
  redo,
  canUndo,
  playback,
  timeline,
  view,
  isDerived,
  play,
  pause,
  rewind,
  scrubTo,
  endScrub,
  beginExport,
  endExport,
  canRedo,
  snapshot,
  loadSnapshot,
  restoreSnapshot,
  resetBoard,
  clearCounters,
  addFrame,
  deleteFrame,
  moveFrame,
  setFrameDuration,
  goToFrame,
  setPitchType,
  setRotated,
  toggleRotated,
  newId,
  addCounter,
  moveCounter,
  setCounterLabel,
  deleteCounter,
  counterById,
  markerById,
  labelById,
  addLabel,
  setLabelText,
  moveLabel,
  deleteLabel,
  toggleLabelsVisible,
  setNotes,
  toggleNotesVisible,
  addMarker,
  moveMarker,
  deleteMarker,
  moveBall,
  toggleBallsVisible,
  dropBall,
  ballPosition,
  ballById,
  addBall,
  removeBall,
  startPen,
  extendPen,
  startArrow,
  startLine,
  updateSegment,
  moveSegmentEnd,
  translateDrawing,
  translateGroup,
  duplicateGroup,
  deleteGroup,
  setArrowBend,
  finishDrawing,
  deleteDrawing,
  clearDrawings,
  drawingById,
}

export function useBoard() {
  return board
}

/** Test-only: put the singleton back to its just-loaded condition. */
export function __resetBoardForTests(): void {
  notesUndoEntry = null
  apply(emptySnapshot())
  undoStack.value = []
  redoStack.value = []
  strokeUndoEntries.clear()
  idCounter = 0
  playback.playing = false
  playback.at = 0
  exportLock.value = false
  stopClock()
}
