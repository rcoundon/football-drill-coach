import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, UNDO_LIMIT } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('useBoard singleton', () => {
  it('returns the same board to every caller', () => {
    expect(useBoard()).toBe(useBoard())
  })

  it('starts empty, on a blank landscape pitch', () => {
    const { state } = useBoard()
    expect(state.counters).toEqual([])
    expect(state.drawings).toEqual([])
    expect(state.ball.attachedTo).toBeNull()
    expect(state.pitch).toEqual({ type: 'blank', rotated: false })
  })

  it('mints unique ids', () => {
    const { newId } = useBoard()
    const ids = new Set([newId(), newId(), newId()])
    expect(ids.size).toBe(3)
  })

  /**
   * The draft is restored on every page load, so ids minted in one session
   * meet ids minted in the next. A per-session counter restarts at zero and
   * hands the new object an id the restored board is already using, after
   * which counterById, deleteCounter and the possession ring all target the
   * wrong object. `__resetBoardForTests` stands in for that reload.
   */
  it('mints ids that cannot collide with ids minted before a reload', () => {
    const { newId } = useBoard()
    const before = [newId(), newId(), newId()]
    __resetBoardForTests()
    const after = [newId(), newId(), newId()]
    expect(new Set([...before, ...after]).size).toBe(6)
  })

  it('gives a new counter an id no restored counter is already using', () => {
    const board = useBoard()
    const first = board.addCounter('red')
    const draft = board.snapshot()

    __resetBoardForTests() // the coach reloads the page
    board.loadSnapshot(draft)

    const fresh = board.addCounter('blue')
    expect(fresh.id).not.toBe(first.id)
    expect(new Set(board.state.counters.map((c) => c.id)).size).toBe(2)

    // Moving the new counter must not move the restored one.
    board.moveCounter(fresh.id, { x: 10, y: 10 })
    expect(board.counterById(first.id)!.pos).not.toEqual({ x: 10, y: 10 })
  })

  it('gives a new drawing an id no restored drawing is already using', () => {
    const board = useBoard()
    const arrow = board.startArrow({ x: 10, y: 10 }, '#fff', 'run')
    board.updateArrow(arrow, { x: 60, y: 30 })
    board.finishDrawing(arrow)
    const draft = board.snapshot()

    __resetBoardForTests()
    board.loadSnapshot(draft)

    const second = board.startArrow({ x: 20, y: 20 }, '#fff', 'run')
    expect(second).not.toBe(arrow)
    expect(new Set(board.state.drawings.map((d) => d.id)).size).toBe(2)
  })
})

describe('pitch settings', () => {
  it('changes the pitch type', () => {
    const board = useBoard()
    board.setPitchType('full')
    expect(board.state.pitch.type).toBe('full')
  })

  it('toggles rotation', () => {
    const board = useBoard()
    board.toggleRotated()
    expect(board.state.pitch.rotated).toBe(true)
    board.toggleRotated()
    expect(board.state.pitch.rotated).toBe(false)
  })

  it('is undoable', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.undo()
    expect(board.state.pitch.type).toBe('blank')
  })
})

describe('undo and redo', () => {
  it('reports nothing to undo on a fresh board', () => {
    const board = useBoard()
    expect(board.canUndo.value).toBe(false)
    expect(board.canRedo.value).toBe(false)
  })

  it('restores the previous state', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.setPitchType('half')
    board.undo()
    expect(board.state.pitch.type).toBe('full')
    board.undo()
    expect(board.state.pitch.type).toBe('blank')
  })

  it('redoes what was undone', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.undo()
    board.redo()
    expect(board.state.pitch.type).toBe('full')
  })

  it('clears the redo stack when new work is committed', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.undo()
    board.setPitchType('half')
    expect(board.canRedo.value).toBe(false)
    board.redo()
    expect(board.state.pitch.type).toBe('half')
  })

  it('does nothing when there is nothing to undo', () => {
    const board = useBoard()
    expect(() => board.undo()).not.toThrow()
    expect(board.state.pitch.type).toBe('blank')
  })

  it('caps the undo stack', () => {
    const board = useBoard()
    for (let i = 0; i < UNDO_LIMIT + 20; i++) {
      board.setPitchType(i % 2 === 0 ? 'full' : 'half')
    }
    let undone = 0
    while (board.canUndo.value) {
      board.undo()
      undone++
      if (undone > UNDO_LIMIT + 50) break
    }
    expect(undone).toBe(UNDO_LIMIT)
  })

  it('snapshots are deep copies, not references into live state', () => {
    const board = useBoard()
    const snap = board.snapshot()
    board.setPitchType('full')
    expect(snap.pitch.type).toBe('blank')
  })
})

describe('loadSnapshot', () => {
  it('replaces the whole board', () => {
    const board = useBoard()
    board.loadSnapshot({
      counters: [{ id: 'a', color: 'red', label: '1', pos: { x: 10, y: 10 } }],
      ball: { pos: { x: 5, y: 5 }, attachedTo: null },
      drawings: [],
      pitch: { type: 'full', rotated: true },
    })
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.pitch.rotated).toBe(true)
  })

  it('does not share references with the snapshot it was given', () => {
    const board = useBoard()
    const snap = {
      counters: [{ id: 'a', color: 'red' as const, label: '1', pos: { x: 10, y: 10 } }],
      ball: { pos: { x: 5, y: 5 }, attachedTo: null },
      drawings: [],
      pitch: { type: 'full' as const, rotated: false },
    }
    board.loadSnapshot(snap)
    board.state.counters[0].pos.x = 99
    expect(snap.counters[0].pos.x).toBe(10)
  })
})

describe('resetBoard', () => {
  it('clears the board and is undoable', () => {
    const board = useBoard()
    board.setPitchType('full')
    board.resetBoard()
    expect(board.state.pitch.type).toBe('blank')
    board.undo()
    expect(board.state.pitch.type).toBe('full')
  })
})
