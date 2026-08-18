import { computed, reactive, ref, toRaw } from 'vue'
import type { Ball, Counter, CounterColor, Drawing, PitchType, Vec } from '../types'
import { PITCH_H, PITCH_W, clampToPitch } from '../geometry'

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
  state.counters.splice(index, 1)
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
