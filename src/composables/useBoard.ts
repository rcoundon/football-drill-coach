import { computed, reactive, ref, toRaw } from 'vue'
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
