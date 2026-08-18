import { computed, reactive, ref, toRaw } from 'vue'
import type { Ball, Counter, CounterColor, Drawing, PitchType, Vec } from '../types'
import { PITCH_H, PITCH_W, clampToPitch, distance } from '../geometry'

export const UNDO_LIMIT = 50

/** How close to a counter the ball must land to be taken into possession, in pitch units. */
export const SNAP_RADIUS = 3.5

/** Where an attached ball sits relative to its holder, in pitch units. */
export const BALL_OFFSET: Vec = { x: 1.8, y: 1.8 }

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
  idCounter = 0
}
