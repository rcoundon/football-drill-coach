import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import type { BoardSnapshot } from '../src/composables/useBoard'
import type { Frame } from '../src/types'

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
