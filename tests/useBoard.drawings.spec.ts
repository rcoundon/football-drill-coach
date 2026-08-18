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
