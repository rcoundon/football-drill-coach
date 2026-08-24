import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import type { BoardSnapshot } from '../src/composables/useBoard'
import type { Frame } from '../src/types'
import { MAX_FRAME_MS, MIN_FRAME_MS } from '../src/animation'

const board = useBoard()

function frame(partial: Partial<Frame> = {}): Frame {
  return {
    counters: [],
    markers: [],
    labels: [],
    ball: { pos: { x: 50, y: 30 }, attachedTo: null, visible: true },
    drawings: [],
    ...partial,
  }
}

function snapshotWith(frames: Frame[], currentFrame = 0): BoardSnapshot {
  return {
    frames,
    currentFrame,
    labelsVisible: true,
    notes: '',
    notesVisible: true,
    pitch: { type: 'blank', rotated: false },
  }
}

beforeEach(() => {
  __resetBoardForTests()
})

describe('the board starts as one frame', () => {
  it('has exactly one frame, and it is the current one', () => {
    expect(board.state.frames).toHaveLength(1)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('the flat fields read and write the current frame', () => {
  it('reads through to the current frame', () => {
    board.restoreSnapshot(
      snapshotWith([frame(), frame({ counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 9, y: 9 } }] })], 1),
    )
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].id).toBe('c1')
  })

  it('follows the current frame when it changes', () => {
    board.restoreSnapshot(
      snapshotWith([frame(), frame({ counters: [{ id: 'c1', color: 'red', label: '', pos: { x: 9, y: 9 } }] })], 1),
    )
    board.state.currentFrame = 0
    expect(board.state.counters).toEqual([])
  })

  it('a push through the flat field lands in the current frame and nowhere else', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 1))
    board.state.counters.push({ id: 'c1', color: 'blue', label: '', pos: { x: 1, y: 2 } })
    expect(board.state.frames[1].counters).toHaveLength(1)
    expect(board.state.frames[0].counters).toHaveLength(0)
  })

  it('an assignment through the flat field lands in the current frame and nowhere else', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 1))
    board.state.drawings = [
      { id: 'd1', kind: 'line', color: '#fff', from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
    ]
    expect(board.state.frames[1].drawings).toHaveLength(1)
    expect(board.state.frames[0].drawings).toHaveLength(0)
  })

  it('the ball belongs to the frame too', () => {
    board.restoreSnapshot(
      snapshotWith([frame(), frame({ ball: { pos: { x: 11, y: 12 }, attachedTo: null, visible: true } })], 1),
    )
    expect(board.state.ball.pos).toEqual({ x: 11, y: 12 })
  })
})

describe('undo carries every frame', () => {
  it('restores a frame the coach was not looking at', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 0))
    board.commit()
    board.state.frames[1].counters.push({ id: 'c1', color: 'red', label: '', pos: { x: 3, y: 4 } })
    expect(board.state.frames[1].counters).toHaveLength(1)
    board.undo()
    expect(board.state.frames[1].counters).toHaveLength(0)
  })

  it('restores which frame was current', () => {
    board.restoreSnapshot(snapshotWith([frame(), frame()], 1))
    board.commit()
    board.state.currentFrame = 0
    board.undo()
    expect(board.state.currentFrame).toBe(1)
  })
})

describe('a snapshot is plain data', () => {
  it('can be structured-cloned, which is what undo depends on', () => {
    board.addCounter('red')
    expect(() => structuredClone(board.snapshot())).not.toThrow()
  })

  it('does not carry the derived fields, which would be a second copy', () => {
    const snap = board.snapshot() as Record<string, unknown>
    expect(Object.keys(snap).sort()).toEqual(
      ['currentFrame', 'frames', 'labelsVisible', 'notes', 'notesVisible', 'pitch'].sort(),
    )
  })
})

describe('a snapshot with a bad current frame is brought back into range', () => {
  it('clamps an index past the end', () => {
    board.restoreSnapshot(snapshotWith([frame()], 7))
    expect(board.state.currentFrame).toBe(0)
  })

  it('replaces an empty frame list with one empty frame', () => {
    board.restoreSnapshot(snapshotWith([], 0))
    expect(board.state.frames).toHaveLength(1)
    expect(board.state.counters).toEqual([])
  })
})

describe('adding a frame', () => {
  it('copies the frame you are on and selects the copy', () => {
    board.addCounter('red')
    const before = board.state.counters[0].pos
    const index = board.addFrame()
    expect(index).toBe(1)
    expect(board.state.frames).toHaveLength(2)
    expect(board.state.currentFrame).toBe(1)
    expect(board.state.counters[0].pos).toEqual(before)
  })

  it('copies rather than shares, so moving on one frame leaves the other', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.moveCounter(id, { x: 20, y: 20 })
    expect(board.state.frames[0].counters[0].pos).not.toEqual({ x: 20, y: 20 })
    expect(board.state.frames[1].counters[0].pos).toEqual({ x: 20, y: 20 })
  })

  it('carries the drawings over, so the pass you drew is still there', () => {
    const id = board.startArrow({ x: 10, y: 10 }, '#fff', 'pass')
    board.updateSegment(id, { x: 30, y: 30 })
    board.addFrame()
    expect(board.state.drawings).toHaveLength(1)
    board.deleteDrawing(board.state.drawings[0].id)
    expect(board.state.drawings).toHaveLength(0)
    expect(board.state.frames[0].drawings).toHaveLength(1)
  })

  it('inserts after the current frame rather than at the end', () => {
    board.addFrame()
    board.goToFrame(0)
    board.addFrame()
    expect(board.state.frames).toHaveLength(3)
    expect(board.state.currentFrame).toBe(1)
  })

  it('is undoable', () => {
    board.addFrame()
    board.undo()
    expect(board.state.frames).toHaveLength(1)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('deleting a frame', () => {
  it('removes it and lands on a frame that still exists', () => {
    board.addFrame()
    board.addFrame()
    board.deleteFrame(2)
    expect(board.state.frames).toHaveLength(2)
    expect(board.state.currentFrame).toBe(1)
  })

  it('is refused when it is the only frame left', () => {
    board.deleteFrame(0)
    expect(board.state.frames).toHaveLength(1)
    expect(board.canUndo.value).toBe(false)
  })
})

describe('reordering frames', () => {
  it('moves a frame and keeps the same one selected', () => {
    board.addCounter('red')
    board.addFrame()
    board.moveCounter(board.state.counters[0].id, { x: 20, y: 20 })
    board.moveFrame(1, 0)
    expect(board.state.frames[0].counters[0].pos).toEqual({ x: 20, y: 20 })
    expect(board.state.currentFrame).toBe(0)
  })

  it('ignores an index that is not there', () => {
    board.addFrame()
    board.moveFrame(0, 9)
    expect(board.state.frames).toHaveLength(2)
    expect(board.canUndo.value).toBe(true) // only the addFrame
    board.undo()
    expect(board.canUndo.value).toBe(false)
  })
})

describe('frame duration', () => {
  it('is stored on the frame', () => {
    board.addFrame()
    board.setFrameDuration(1, 400)
    expect(board.state.frames[1].duration).toBe(400)
  })

  it('is clamped to something a coach can actually see', () => {
    board.addFrame()
    board.setFrameDuration(1, 5)
    expect(board.state.frames[1].duration).toBe(MIN_FRAME_MS)
    board.setFrameDuration(1, 999_999)
    expect(board.state.frames[1].duration).toBe(MAX_FRAME_MS)
  })
})

describe('going to a frame', () => {
  it('selects it', () => {
    board.addFrame()
    board.goToFrame(0)
    expect(board.state.currentFrame).toBe(0)
  })

  it('costs nothing in undo history, because it changed nothing about the drill', () => {
    board.addFrame()
    board.undo()
    board.goToFrame(0)
    expect(board.canUndo.value).toBe(false)
  })

  it('ignores an index that is not there', () => {
    board.goToFrame(4)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('the cast is drill-wide', () => {
  it('a player added on one frame is on every frame', () => {
    board.addFrame()
    board.goToFrame(1)
    board.addCounter('blue')
    expect(board.state.frames[0].counters).toHaveLength(1)
    expect(board.state.frames[1].counters).toHaveLength(1)
    expect(board.state.frames[0].counters[0].id).toBe(board.state.frames[1].counters[0].id)
  })

  it('a player deleted on one frame is off every frame', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.deleteCounter(id)
    expect(board.state.frames[0].counters).toHaveLength(0)
    expect(board.state.frames[1].counters).toHaveLength(0)
  })

  it('renumbering a player renumbers them everywhere', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.setCounterLabel(id, '7')
    expect(board.state.frames[0].counters[0].label).toBe('7')
    expect(board.state.frames[1].counters[0].label).toBe('7')
  })

  it('cones and labels follow the same rule', () => {
    board.addFrame()
    board.addMarker({ x: 10, y: 10 })
    board.addLabel({ x: 20, y: 20 }, 'press')
    expect(board.state.frames[0].markers).toHaveLength(1)
    expect(board.state.frames[0].labels).toHaveLength(1)
    board.deleteMarker(board.state.markers[0].id)
    expect(board.state.frames[0].markers).toHaveLength(0)
  })

  it('a drawing does not — it belongs to the moment it describes', () => {
    board.addFrame()
    const id = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(id, { x: 25, y: 25 })
    expect(board.state.frames[1].drawings).toHaveLength(1)
    expect(board.state.frames[0].drawings).toHaveLength(0)
  })

  it('moving a player moves them on this frame only', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.moveCounter(id, { x: 30, y: 30 })
    expect(board.state.frames[0].counters[0].pos).not.toEqual({ x: 30, y: 30 })
  })

  it('clearing the players clears them from every frame', () => {
    board.addCounter('red')
    board.addFrame()
    board.clearCounters()
    expect(board.state.frames[0].counters).toHaveLength(0)
    expect(board.state.frames[1].counters).toHaveLength(0)
  })

  it('clearing the drawings clears them from every frame', () => {
    const id = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(id, { x: 25, y: 25 })
    board.addFrame()
    board.clearDrawings()
    expect(board.state.frames[0].drawings).toHaveLength(0)
    expect(board.state.frames[1].drawings).toHaveLength(0)
  })
})

describe('groups across frames', () => {
  it('deleting a group takes its players off every frame and its drawings off this one', () => {
    board.addCounter('red')
    const counterId = board.state.counters[0].id
    const drawingId = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(drawingId, { x: 25, y: 25 })
    board.addFrame()
    board.deleteGroup([
      { kind: 'counter', id: counterId },
      { kind: 'drawing', id: drawingId },
    ])
    expect(board.state.frames[0].counters).toHaveLength(0)
    expect(board.state.frames[1].counters).toHaveLength(0)
    expect(board.state.frames[1].drawings).toHaveLength(0)
    expect(board.state.frames[0].drawings).toHaveLength(1)
  })

  it('a copied player appears on every frame, offset from where the original stands there', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.addFrame()
    board.moveCounter(id, { x: 60, y: 30 })
    const copies = board.duplicateGroup([{ kind: 'counter', id }], { x: 4, y: 4 })
    const copyId = copies[0].id
    const on0 = board.state.frames[0].counters.find((c) => c.id === copyId)!
    const on1 = board.state.frames[1].counters.find((c) => c.id === copyId)!
    expect(on1.pos).toEqual({ x: 64, y: 34 })
    // Frame 0 still has the original where it started, and the copy beside it
    // there too — so the copy repeats the original's run rather than standing
    // still through it.
    expect(on0.pos).not.toEqual(on1.pos)
  })
})
