import { describe, it, expect, beforeEach } from 'vitest'
import {
  useBoard,
  __resetBoardForTests,
  MIN_PEN_STEP,
  MIN_SEGMENT_LENGTH,
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
    board.updateSegment(id, { x: 40, y: 25 })
    board.finishDrawing(id)
    expect((board.drawingById(id) as ArrowDrawing).to).toEqual({ x: 40, y: 25 })
  })

  it('records the pass style', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'pass')
    board.updateSegment(id, { x: 60, y: 10 })
    board.finishDrawing(id)
    expect((board.drawingById(id) as ArrowDrawing).style).toBe('pass')
  })

  it('discards an arrow shorter than MIN_SEGMENT_LENGTH', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    board.updateSegment(id, { x: 10 + MIN_SEGMENT_LENGTH * 0.5, y: 10 })
    board.finishDrawing(id)
    expect(board.state.drawings).toHaveLength(0)
    expect(board.canUndo.value).toBe(false)
  })

  it('is a single undo entry', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    board.undo()
    expect(board.state.drawings).toHaveLength(0)
  })
})

describe('deleteDrawing', () => {
  it('removes a drawing and is undoable', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 10 }, '#ff0', 'run')
    board.updateSegment(id, { x: 60, y: 30 })
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
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    board.clearDrawings()
    expect(board.state.drawings).toHaveLength(0)
    expect(board.state.counters).toHaveLength(1)
    board.undo()
    expect(board.state.drawings).toHaveLength(1)
  })
})

import type { LineDrawing } from '../src/types'

describe('straight lines', () => {
  it('creates a zero-length line at the press point', () => {
    const board = useBoard()
    const id = board.startLine({ x: 10, y: 10 }, '#fff')
    const line = board.drawingById(id) as LineDrawing
    expect(line.kind).toBe('line')
    expect(line.from).toEqual({ x: 10, y: 10 })
    expect(line.to).toEqual({ x: 10, y: 10 })
  })

  it('tracks the pointer', () => {
    const board = useBoard()
    const id = board.startLine({ x: 10, y: 10 }, '#fff')
    board.updateSegment(id, { x: 10, y: 50 })
    board.finishDrawing(id)
    expect((board.drawingById(id) as LineDrawing).to).toEqual({ x: 10, y: 50 })
  })

  it('snaps a nearly-horizontal drag flat', () => {
    const board = useBoard()
    const id = board.startLine({ x: 10, y: 30 }, '#fff')
    board.updateSegment(id, { x: 70, y: 31 })
    board.finishDrawing(id)
    const line = board.drawingById(id) as LineDrawing
    expect(line.to).toEqual({ x: 70, y: 30 })
  })

  it('does NOT snap an arrow, which represents a real movement path', () => {
    const board = useBoard()
    const id = board.startArrow({ x: 10, y: 30 }, '#ff0', 'run')
    board.updateSegment(id, { x: 70, y: 31 })
    board.finishDrawing(id)
    const arrow = board.drawingById(id) as { to: { x: number; y: number } }
    expect(arrow.to).toEqual({ x: 70, y: 31 })
  })

  it('clamps to the pitch', () => {
    const board = useBoard()
    const id = board.startLine({ x: 10, y: 10 }, '#fff')
    board.updateSegment(id, { x: -50, y: 10 })
    expect((board.drawingById(id) as LineDrawing).to.x).toBe(0)
  })

  it('discards a line shorter than MIN_SEGMENT_LENGTH and leaves no undo entry', () => {
    const board = useBoard()
    const id = board.startLine({ x: 10, y: 10 }, '#fff')
    board.updateSegment(id, { x: 10 + MIN_SEGMENT_LENGTH * 0.5, y: 10 })
    board.finishDrawing(id)
    expect(board.state.drawings).toHaveLength(0)
    expect(board.canUndo.value).toBe(false)
  })

  it('is a single undo entry', () => {
    const board = useBoard()
    const id = board.startLine({ x: 10, y: 10 }, '#fff')
    board.updateSegment(id, { x: 60, y: 10 })
    board.finishDrawing(id)
    board.undo()
    expect(board.state.drawings).toHaveLength(0)
  })

  it('is erased like any other drawing', () => {
    const board = useBoard()
    const id = board.startLine({ x: 10, y: 10 }, '#fff')
    board.updateSegment(id, { x: 60, y: 10 })
    board.finishDrawing(id)
    board.deleteDrawing(id)
    expect(board.state.drawings).toHaveLength(0)
  })
})

describe('state stays structured-cloneable after a discarded stroke', () => {
  it('can still snapshot after a stray tap is discarded', () => {
    const board = useBoard()
    board.startPen({ x: 10, y: 10 }, '#fff')
    const id = board.state.drawings[0].id
    board.finishDrawing(id)
    // A discarded stroke rewrites state.drawings. If that rewrite put
    // reactive proxies back into raw state, the next commit cannot clone it.
    expect(() => board.addCounter('red')).not.toThrow()
  })

  it('can still snapshot after a discarded stroke that had a real one before it', () => {
    const board = useBoard()
    const keep = board.startArrow({ x: 5, y: 5 }, '#fff', 'run')
    board.updateSegment(keep, { x: 60, y: 40 })
    board.finishDrawing(keep)

    const tap = board.startPen({ x: 10, y: 10 }, '#fff')
    board.finishDrawing(tap)

    expect(() => board.addCounter('red')).not.toThrow()
    expect(board.state.drawings).toHaveLength(1)
  })

  it('can still undo after a discarded stroke scrubbed the history', () => {
    const board = useBoard()
    board.addCounter('blue')
    const keep = board.startArrow({ x: 5, y: 5 }, '#fff', 'run')
    board.updateSegment(keep, { x: 60, y: 40 })
    board.finishDrawing(keep)

    const tap = board.startPen({ x: 10, y: 10 }, '#fff')
    board.finishDrawing(tap)

    expect(() => board.undo()).not.toThrow()
  })
})

describe('arrow bend', () => {
  /** A finished arrow along the horizontal, ready to be bent. */
  function drawArrow(style: 'run' | 'pass' = 'pass'): string {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#fff', style)
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    return id
  }

  it('leaves a freshly drawn arrow straight', () => {
    const board = useBoard()
    expect((board.drawingById(drawArrow()) as ArrowDrawing).bend).toBeUndefined()
  })

  it('records the bend the handle was dragged to', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6)
    expect((board.drawingById(id) as ArrowDrawing).bend).toBe(6)
  })

  it('bends runs as well as passes', () => {
    const board = useBoard()
    const id = drawArrow('run')
    board.setArrowBend(id, -4)
    expect((board.drawingById(id) as ArrowDrawing).bend).toBe(-4)
  })

  it('does not commit, because it is called on every pointer move of a drag', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6)
    // One undo entry exists — the arrow's own. Bending pushed none of its
    // own, so undo goes back past the whole arrow rather than to a straight one.
    board.undo()
    expect(board.state.drawings).toEqual([])
    expect(board.canUndo.value).toBe(false)
  })

  it('is undone with the commit the handle grab made', () => {
    const board = useBoard()
    const id = drawArrow()
    board.commit()
    board.setArrowBend(id, 6)
    board.undo()
    expect((board.drawingById(id) as ArrowDrawing).bend).toBeUndefined()
  })

  it('is restored by redo', () => {
    const board = useBoard()
    const id = drawArrow()
    board.commit()
    board.setArrowBend(id, 6)
    board.undo()
    board.redo()
    expect((board.drawingById(id) as ArrowDrawing).bend).toBe(6)
  })

  it('ignores a bend on a plain line, which marks out ground rather than movement', () => {
    const board = useBoard()
    const id = board.startLine({ x: 20, y: 30 }, '#fff')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    board.setArrowBend(id, 6)
    expect(board.drawingById(id)).not.toHaveProperty('bend')
  })

  it('ignores an id that names nothing', () => {
    const board = useBoard()
    expect(() => board.setArrowBend('nope', 6)).not.toThrow()
  })
})
