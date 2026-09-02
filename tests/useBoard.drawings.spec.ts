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

describe('translateDrawing', () => {
  function drawArrow(from = { x: 20, y: 30 }, to = { x: 60, y: 30 }): string {
    const board = useBoard()
    const id = board.startArrow(from, '#fff', 'pass')
    board.updateSegment(id, to)
    board.finishDrawing(id)
    return id
  }

  function drawPen(points: { x: number; y: number }[]): string {
    const board = useBoard()
    const id = board.startPen(points[0], '#fff')
    for (const point of points.slice(1)) board.extendPen(id, point)
    board.finishDrawing(id)
    return id
  }

  it('slides both ends of a segment by the same amount', () => {
    const board = useBoard()
    const id = drawArrow()
    board.translateDrawing(id, { x: 5, y: -10 })
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow.from).toEqual({ x: 25, y: 20 })
    expect(arrow.to).toEqual({ x: 65, y: 20 })
  })

  it('slides every point of a pen stroke', () => {
    const board = useBoard()
    const id = drawPen([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 10 },
    ])
    board.translateDrawing(id, { x: 5, y: 5 })
    expect((board.drawingById(id) as PenDrawing).points).toEqual([
      { x: 15, y: 15 },
      { x: 25, y: 25 },
      { x: 35, y: 15 },
    ])
  })

  it('leaves a curve bowed the same way, since the bend rides the chord', () => {
    const board = useBoard()
    const id = drawArrow()
    board.setArrowBend(id, 6, 0.2)
    board.translateDrawing(id, { x: 5, y: 5 })
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow.bend).toBe(6)
    expect(arrow.bendAlong).toBe(0.2)
  })

  it('stops at the touchline rather than carrying the drawing off the pitch', () => {
    const board = useBoard()
    const id = drawArrow({ x: 20, y: 30 }, { x: 60, y: 30 })
    board.translateDrawing(id, { x: 1000, y: 0 })
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow.to.x).toBe(PITCH_W)
    // The whole shape moved together: the 40-unit gap between the ends held.
    expect(arrow.from.x).toBe(PITCH_W - 40)
  })

  it('keeps sliding along an edge it is already against', () => {
    const board = useBoard()
    const id = drawArrow({ x: 20, y: 0 }, { x: 60, y: 0 })
    board.translateDrawing(id, { x: 10, y: -5 })
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow.from).toEqual({ x: 30, y: 0 })
    expect(arrow.to).toEqual({ x: 70, y: 0 })
  })

  it('does not distort a drawing wider than the pitch it is pushed against', () => {
    const board = useBoard()
    const id = drawArrow({ x: 0, y: 30 }, { x: PITCH_W, y: 30 })
    board.translateDrawing(id, { x: 20, y: 0 })
    const arrow = board.drawingById(id) as ArrowDrawing
    expect(arrow.to.x - arrow.from.x).toBe(PITCH_W)
  })

  it('does not commit, because it is called on every pointer move of a drag', () => {
    const board = useBoard()
    const id = drawArrow()
    board.translateDrawing(id, { x: 5, y: 5 })
    board.undo()
    expect(board.state.drawings).toEqual([])
    expect(board.canUndo.value).toBe(false)
  })

  it('ignores an id that names nothing', () => {
    const board = useBoard()
    expect(() => board.translateDrawing('nope', { x: 5, y: 5 })).not.toThrow()
  })
})

describe('moving a group', () => {
  /** A shape: two players, a cone, a label and an arrow across the middle. */
  function layOutAShape() {
    const board = useBoard()
    const red = board.addCounter('red')
    board.moveCounter(red.id, { x: 20, y: 20 })
    const blue = board.addCounter('blue')
    board.moveCounter(blue.id, { x: 40, y: 20 })
    const cone = board.addMarker({ x: 30, y: 40 })
    const label = board.addLabel({ x: 50, y: 50 }, 'press')!
    const arrow = board.startArrow({ x: 20, y: 20 }, '#fff', 'pass')
    board.updateSegment(arrow, { x: 40, y: 20 })
    board.finishDrawing(arrow)
    return {
      red,
      blue,
      cone,
      label,
      arrow,
      refs: [
        { kind: 'counter' as const, id: red.id },
        { kind: 'counter' as const, id: blue.id },
        { kind: 'marker' as const, id: cone.id },
        { kind: 'label' as const, id: label.id },
        { kind: 'drawing' as const, id: arrow },
      ],
    }
  }

  it('slides every member by the same amount', () => {
    const board = useBoard()
    const shape = layOutAShape()
    board.translateGroup(shape.refs, { x: 10, y: 5 })
    expect(board.counterById(shape.red.id)!.pos).toEqual({ x: 30, y: 25 })
    expect(board.counterById(shape.blue.id)!.pos).toEqual({ x: 50, y: 25 })
    expect(board.markerById(shape.cone.id)!.pos).toEqual({ x: 40, y: 45 })
    expect(board.labelById(shape.label.id)!.pos).toEqual({ x: 60, y: 55 })
    expect((board.drawingById(shape.arrow) as ArrowDrawing).from).toEqual({ x: 30, y: 25 })
  })

  it('holds the shape together at the touchline instead of squashing it', () => {
    const board = useBoard()
    const shape = layOutAShape()
    board.translateGroup(shape.refs, { x: 1000, y: 0 })
    const red = board.counterById(shape.red.id)!.pos
    const blue = board.counterById(shape.blue.id)!.pos
    // The 20-unit gap between the two players survived the trip to the edge.
    expect(blue.x - red.x).toBe(20)
    expect(blue.x).toBeLessThanOrEqual(PITCH_W)
  })

  it('keeps sliding along an edge the group already rests on', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 30, y: 0 })
    board.translateGroup([{ kind: 'counter', id: counter.id }], { x: 10, y: -5 })
    expect(board.counterById(counter.id)!.pos).toEqual({ x: 40, y: 0 })
  })

  it('ignores members that have since gone', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 30, y: 30 })
    const refs = [
      { kind: 'counter' as const, id: counter.id },
      { kind: 'drawing' as const, id: 'gone' },
    ]
    expect(() => board.translateGroup(refs, { x: 5, y: 5 })).not.toThrow()
    expect(board.counterById(counter.id)!.pos).toEqual({ x: 35, y: 35 })
  })

  it('does nothing at all for an empty group', () => {
    const board = useBoard()
    expect(() => board.translateGroup([], { x: 5, y: 5 })).not.toThrow()
  })

  it('does not commit, because it is called on every pointer move of a drag', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.translateGroup([{ kind: 'counter', id: counter.id }], { x: 5, y: 5 })
    board.undo()
    expect(board.state.counters).toEqual([])
    expect(board.canUndo.value).toBe(false)
  })
})

describe('deleting a group', () => {
  it('takes every member off in one go', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const cone = board.addMarker({ x: 20, y: 20 })
    const label = board.addLabel({ x: 30, y: 30 }, 'press')!
    const arrow = board.startArrow({ x: 40, y: 40 }, '#fff', 'pass')
    board.updateSegment(arrow, { x: 60, y: 40 })
    board.finishDrawing(arrow)

    board.deleteGroup([
      { kind: 'counter', id: counter.id },
      { kind: 'marker', id: cone.id },
      { kind: 'label', id: label.id },
      { kind: 'drawing', id: arrow },
    ])

    expect(board.state.counters).toEqual([])
    expect(board.state.markers).toEqual([])
    expect(board.state.labels).toEqual([])
    expect(board.state.drawings).toEqual([])
  })

  it('is one undo entry, not one per member', () => {
    const board = useBoard()
    const first = board.addCounter('red')
    const second = board.addCounter('blue')
    board.deleteGroup([
      { kind: 'counter', id: first.id },
      { kind: 'counter', id: second.id },
    ])
    board.undo()
    expect(board.state.counters).toHaveLength(2)
  })

  it('sets a carried ball down rather than taking it off with its holder', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 30, y: 30 })
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    expect(board.state.balls[0].attachedTo).toBe(counter.id)

    board.deleteGroup([{ kind: 'counter', id: counter.id }])

    expect(board.state.balls[0].attachedTo).toBeNull()
    expect(board.state.ballsVisible).toBe(true)
  })

  it('does nothing, and costs no history, for an empty group', () => {
    const board = useBoard()
    board.addCounter('red')
    board.deleteGroup([])
    board.undo()
    expect(board.state.counters).toEqual([])
    expect(board.canUndo.value).toBe(false)
  })
})

describe('duplicating a group', () => {
  it('leaves the original where it was', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 20, y: 20 })
    board.duplicateGroup([{ kind: 'counter', id: counter.id }], { x: 4, y: 4 })
    expect(board.counterById(counter.id)!.pos).toEqual({ x: 20, y: 20 })
  })

  it('drops the copy at the offset asked for', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 20, y: 20 })
    const [copy] = board.duplicateGroup([{ kind: 'counter', id: counter.id }], { x: 4, y: 4 })
    expect(board.counterById(copy.id)!.pos).toEqual({ x: 24, y: 24 })
  })

  it('gives the copy an id of its own', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const [copy] = board.duplicateGroup([{ kind: 'counter', id: counter.id }], { x: 4, y: 4 })
    expect(copy.id).not.toBe(counter.id)
    expect(board.state.counters).toHaveLength(2)
  })

  it('keeps what makes each member what it is', () => {
    const board = useBoard()
    const counter = board.addCounter('blue')
    board.setCounterLabel(counter.id, '7')
    const label = board.addLabel({ x: 30, y: 30 }, 'press')!
    const arrow = board.startArrow({ x: 10, y: 10 }, '#e53935', 'run')
    board.updateSegment(arrow, { x: 40, y: 10 })
    board.finishDrawing(arrow)
    board.setArrowBend(arrow, 5, 0.2)

    const copies = board.duplicateGroup(
      [
        { kind: 'counter', id: counter.id },
        { kind: 'label', id: label.id },
        { kind: 'drawing', id: arrow },
      ],
      { x: 4, y: 4 },
    )

    const copiedCounter = board.counterById(copies[0].id)!
    expect(copiedCounter.color).toBe('blue')
    expect(copiedCounter.label).toBe('7')
    expect(board.labelById(copies[1].id)!.text).toBe('press')
    const copiedArrow = board.drawingById(copies[2].id) as ArrowDrawing
    expect(copiedArrow.color).toBe('#e53935')
    expect(copiedArrow.style).toBe('run')
    expect(copiedArrow.bend).toBe(5)
    expect(copiedArrow.bendAlong).toBe(0.2)
  })

  it('hands back the copies, so the coach is left holding them', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const cone = board.addMarker({ x: 20, y: 20 })
    const copies = board.duplicateGroup(
      [
        { kind: 'counter', id: counter.id },
        { kind: 'marker', id: cone.id },
      ],
      { x: 4, y: 4 },
    )
    expect(copies.map((c) => c.kind)).toEqual(['counter', 'marker'])
    expect(board.state.counters).toHaveLength(2)
    expect(board.state.markers).toHaveLength(2)
  })

  it('trims the offset so a copy of a shape at the edge stays on the pitch', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: PITCH_W, y: 20 })
    const [copy] = board.duplicateGroup([{ kind: 'counter', id: counter.id }], { x: 4, y: 4 })
    expect(board.counterById(copy.id)!.pos.x).toBe(PITCH_W)
  })

  it('gives the copy no ball, whoever was carrying the original', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 30, y: 30 })
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    expect(board.state.balls[0].attachedTo).toBe(counter.id)

    const [copy] = board.duplicateGroup([{ kind: 'counter', id: counter.id }], { x: 4, y: 4 })

    expect(board.state.balls[0].attachedTo).toBe(counter.id)
    expect(board.state.balls[0].attachedTo).not.toBe(copy.id)
  })

  it('is one undo entry, not one per member', () => {
    const board = useBoard()
    const first = board.addCounter('red')
    const second = board.addCounter('blue')
    board.duplicateGroup(
      [
        { kind: 'counter', id: first.id },
        { kind: 'counter', id: second.id },
      ],
      { x: 4, y: 4 },
    )
    board.undo()
    expect(board.state.counters).toHaveLength(2)
  })

  it('does nothing, and costs no history, for an empty group', () => {
    const board = useBoard()
    board.addCounter('red')
    expect(board.duplicateGroup([], { x: 4, y: 4 })).toEqual([])
    board.undo()
    expect(board.state.counters).toEqual([])
    expect(board.canUndo.value).toBe(false)
  })

  /**
   * A counter's bend describes the leg walked into whichever phase it sits
   * on, so the copy must carry the same bend on every phase the original
   * has one on — and stay straight on the phases the original is straight
   * on — rather than the current phase's value bleeding into the rest.
   */
  it('gives the copy the same bend on every phase it appears on', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.addFrame()
    board.moveCounter(counter.id, { x: 30, y: 30 })
    board.setCounterBend(counter.id, 7, 0.4)

    const [copy] = board.duplicateGroup([{ kind: 'counter', id: counter.id }], { x: 4, y: 4 })

    expect(board.counterById(copy.id)!.bend).toBe(7)
    expect(board.counterById(copy.id)!.bendAlong).toBe(0.4)

    board.goToFrame(0)
    expect(board.counterById(copy.id)!.bend).toBeUndefined()
  })

  it('skips members that have since gone', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const copies = board.duplicateGroup(
      [
        { kind: 'counter', id: counter.id },
        { kind: 'drawing', id: 'gone' },
      ],
      { x: 4, y: 4 },
    )
    expect(copies).toHaveLength(1)
  })
})

/**
 * Dragging a shape is trimmed against the pitch being drawn, not the full
 * one. On a half pitch the room either side is off the board, and a shape
 * slid into it is a shape the coach can no longer see or reach.
 */
describe('dragging a drawing on a half pitch', () => {
  it('cannot be slid off the drawn half', () => {
    const board = useBoard()
    board.setPitchType('half')

    const id = board.startArrow({ x: 40, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)

    // Far enough left to leave the half entirely, were it not trimmed.
    board.translateGroup([{ kind: 'drawing', id }], { x: -100, y: 0 })

    const arrow = board.drawingById(id) as ArrowDrawing
    const xs = [arrow.from.x, arrow.to.x]
    expect(Math.min(...xs)).toBeCloseTo(25, 5)
    expect(Math.max(...xs)).toBeCloseTo(45, 5)
  })

  it('still reaches both ends of a full pitch', () => {
    const board = useBoard()
    board.setPitchType('full')

    const id = board.startArrow({ x: 40, y: 30 }, '#ffffff', 'pass')
    board.updateSegment(id, { x: 60, y: 30 })
    board.finishDrawing(id)

    board.translateGroup([{ kind: 'drawing', id }], { x: -100, y: 0 })

    const arrow = board.drawingById(id) as ArrowDrawing
    expect(Math.min(arrow.from.x, arrow.to.x)).toBeCloseTo(0, 5)
  })
})
