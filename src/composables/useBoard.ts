import { computed, reactive, ref, toRaw } from 'vue'
import type { Ball, Counter, CounterColor, Drawing, PitchType, Vec } from '../types'
import { PITCH_H, PITCH_W, clampToPitch, distance } from '../geometry'

export const UNDO_LIMIT = 50

/**
 * Where an attached ball sits relative to its holder, in pitch units.
 *
 * Far enough out that the ball's own hit circle clears the whole drawn
 * counter: the ball is painted after the counters, so any overlap steals the
 * press, and an overlap reaching the counter's centre means pressing the
 * middle of a player in possession grabs the ball instead of the player.
 * See BALL_HIT_RADIUS_ATTACHED in BallToken.vue for the other half.
 */
export const BALL_OFFSET: Vec = { x: 3.4, y: 3.4 }

/**
 * How close to a counter the ball must land to be taken into possession, in
 * pitch units. Deliberately wider than the offset above: the ball is drawn
 * at that offset while attached, so a tap on it and a release without
 * movement lands one offset away from its holder and must keep possession.
 */
export const SNAP_RADIUS = 6

/** The drawn radius of a counter, in pitch units. Mirrors PlayerCounter's own RADIUS. */
export const COUNTER_RADIUS = 2.4

/**
 * Centre-to-centre distance a new counter keeps from every counter already
 * placed. Comfortably more than two drawn radii, so counters never touch.
 */
export const COUNTER_SPACING = 5.5

/** Minimum spacing between recorded freehand points, in pitch units. */
export const MIN_PEN_STEP = 0.6

/** Arrows shorter than this are treated as an accidental tap. */
export const MIN_ARROW_LENGTH = 2

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

/**
 * Deep copy. `toRaw` first: structuredClone throws DataCloneError on Vue's
 * reactive Proxy, and every snapshot starts from reactive state.
 */
function clone<T>(value: T): T {
  return structuredClone(toRaw(value))
}

const state = reactive<BoardState>(emptyState())
const undoStack = ref<BoardSnapshot[]>([])
const redoStack = ref<BoardSnapshot[]>([])

let idCounter = 0

/** A plain copy of the current state, safe to keep. */
function snapshot(): BoardSnapshot {
  const raw = toRaw(state)
  return structuredClone({
    counters: raw.counters,
    ball: raw.ball,
    drawings: raw.drawings,
    pitch: raw.pitch,
  })
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

function resetBoard(): void {
  commit()
  apply(emptyState())
}

function loadSnapshot(snap: BoardSnapshot): void {
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

function addCounter(color: CounterColor): Counter {
  commit()
  const counter: Counter = {
    id: newId(),
    color,
    label: nextLabelFor(color),
    pos: nextCounterPosition(),
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
  if (state.ball.attachedTo === id) {
    state.ball.pos = { ...state.counters[index].pos }
    state.ball.attachedTo = null
  }
  state.counters.splice(index, 1)
}

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

/** Drag-time; does not commit. */
function updateArrow(id: string, to: Vec): void {
  const drawing = drawingById(id)
  if (!drawing || drawing.kind !== 'arrow') return
  drawing.to = clampToPitch(to)
}

/** Erase every trace of a drawing from the undo and redo history. */
function forgetDrawingInHistory(id: string): void {
  for (const stack of [undoStack, redoStack]) {
    for (const entry of stack.value) {
      entry.drawings = entry.drawings.filter((d) => d.id !== id)
    }
  }
}

/**
 * End a stroke. A stroke too small to be intentional is removed, along with
 * the undo entry its start pushed, so a stray tap leaves no trace.
 *
 * The invariant this relies on: `startPen`/`startArrow` recorded the exact
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
      : distance(drawing.from, drawing.to) < MIN_ARROW_LENGTH

  if (!degenerate) return

  state.drawings = state.drawings.filter((d) => d.id !== id)

  if (startEntry) {
    const index = undoStack.value.findIndex((entry) => toRaw(entry) === startEntry)
    if (index !== -1) undoStack.value.splice(index, 1)
  }
  forgetDrawingInHistory(id)
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
  restoreSnapshot,
  resetBoard,
  setPitchType,
  setRotated,
  toggleRotated,
  newId,
  addCounter,
  moveCounter,
  setCounterLabel,
  deleteCounter,
  counterById,
  nextLabelFor,
  moveBall,
  dropBall,
  ballPosition,
  startPen,
  extendPen,
  startArrow,
  updateArrow,
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
  apply(emptyState())
  undoStack.value = []
  redoStack.value = []
  strokeUndoEntries.clear()
  idCounter = 0
}
