import { describe, it, expect, beforeEach } from 'vitest'
import {
  useBoard,
  __resetBoardForTests,
  MIN_PEN_STEP,
  MIN_SEGMENT_LENGTH,
} from '../src/composables/useBoard'
import type { ArrowDrawing, PenDrawing } from '../src/types'
import { PITCH_W } from '../src/geometry'

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

  it('records where along the arrow the bow peaks', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6, 0.2)
    expect((board.drawingById(id) as ArrowDrawing).bendAlong).toBe(0.2)
  })

  it('leaves an evenly bowed arrow with no offset to store', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6)
    expect(board.drawingById(id)).not.toHaveProperty('bendAlong')
  })

  it('recentres the peak when the offset is dragged back to nothing', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6, 0.2)
    board.setArrowBend(id, 6, 0)
    expect(board.drawingById(id)).not.toHaveProperty('bendAlong')
  })

  it('takes the skew away with the bow when the arrow is straightened', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6, 0.2)
    board.setArrowBend(id, 0, 0.2)
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow).not.toHaveProperty('bend')
    expect(arrow).not.toHaveProperty('bendAlong')
  })
})

describe('moving a segment end', () => {
  function drawArrow(): string {
    const board = useBoard()
    const id = board.startArrow({ x: 20, y: 30 }, '#fff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    return id
  }

  function drawLine(): string {
    const board = useBoard()
    const id = board.startLine({ x: 20, y: 30 }, '#fff')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)
    return id
  }

  it('moves the end the coach grabbed', () => {
    const board = useBoard()
    const id = drawArrow()
    board.moveSegmentEnd(id, 'to', { x: 70, y: 40 })
    expect((board.drawingById(id) as ArrowDrawing).to).toEqual({ x: 70, y: 40 })
  })

  it('leaves the other end where it was', () => {
    const board = useBoard()
    const id = drawArrow()
    board.moveSegmentEnd(id, 'to', { x: 70, y: 40 })
    expect((board.drawingById(id) as ArrowDrawing).from).toEqual({ x: 20, y: 30 })
  })

  it('moves the start end too', () => {
    const board = useBoard()
    const id = drawArrow()
    board.moveSegmentEnd(id, 'from', { x: 10, y: 10 })
    expect((board.drawingById(id) as ArrowDrawing).from).toEqual({ x: 10, y: 10 })
  })

  it('keeps the end on the pitch', () => {
    const board = useBoard()
    const id = drawArrow()
    board.moveSegmentEnd(id, 'to', { x: 500, y: -40 })
    expect((board.drawingById(id) as ArrowDrawing).to).toEqual({ x: PITCH_W, y: 0 })
  })

  it('keeps a curve bowed the same way, because the bend is held against the chord', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6, 0.2)
    board.moveSegmentEnd(id, 'to', { x: 60, y: 50 })
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow.bend).toBe(6)
    expect(arrow.bendAlong).toBe(0.2)
  })

  it('does not commit, because it is called on every pointer move of a drag', () => {
    const board = useBoard()
    const id = drawArrow()
    board.moveSegmentEnd(id, 'to', { x: 70, y: 40 })
    board.undo()
    expect(board.state.drawings).toEqual([])
    expect(board.canUndo.value).toBe(false)
  })

  it('snaps a line back onto the horizontal, the way drawing one does', () => {
    const board = useBoard()
    const id = drawLine()
    board.moveSegmentEnd(id, 'to', { x: 70, y: 31 })
    expect((board.drawingById(id) as LineDrawing).to).toEqual({ x: 70, y: 30 })
  })

  it('snaps a line against the end that stayed put, not always against its start', () => {
    const board = useBoard()
    const id = drawLine()
    board.moveSegmentEnd(id, 'from', { x: 10, y: 31 })
    expect((board.drawingById(id) as LineDrawing).from).toEqual({ x: 10, y: 30 })
  })

  it('leaves an arrow unsnapped, since an arrow traces a movement', () => {
    const board = useBoard()
    const id = drawArrow()
    board.moveSegmentEnd(id, 'to', { x: 70, y: 31 })
    expect((board.drawingById(id) as ArrowDrawing).to).toEqual({ x: 70, y: 31 })
  })

  it('ignores a pen stroke, which has no two ends to speak of', () => {
    const board = useBoard()
    const id = board.startPen({ x: 10, y: 10 }, '#fff')
    board.extendPen(id, { x: 20, y: 20 })
    board.finishDrawing(id)
    expect(() => board.moveSegmentEnd(id, 'to', { x: 70, y: 40 })).not.toThrow()
    expect((board.drawingById(id) as PenDrawing).points).toHaveLength(2)
  })

  it('ignores an id that names nothing', () => {
    const board = useBoard()
    expect(() => board.moveSegmentEnd('nope', 'to', { x: 70, y: 40 })).not.toThrow()
  })
})
