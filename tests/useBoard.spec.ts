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
    board.updateSegment(arrow, { x: 60, y: 30 })
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
      markers: [],
      labels: [],
      labelsVisible: true,
      ball: { pos: { x: 5, y: 5 }, attachedTo: null, visible: true },
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
      markers: [],
      labels: [],
      labelsVisible: true,
      ball: { pos: { x: 5, y: 5 }, attachedTo: null, visible: true },
      drawings: [],
      pitch: { type: 'full' as const, rotated: false },
    }
    board.loadSnapshot(snap)
    board.state.counters[0].pos.x = 99
    expect(snap.counters[0].pos.x).toBe(10)
  })
})

describe('resetBoard', () => {
  it('clears players, ball and drawings', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 20, y: 20 })
    board.dropBall({ x: 20, y: 20 })
    const line = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(line, { x: 60, y: 5 })
    board.finishDrawing(line)

    board.resetBoard()

    expect(board.state.counters).toEqual([])
    expect(board.state.drawings).toEqual([])
    expect(board.state.ball.attachedTo).toBeNull()
  })

  it('puts the ball back where a fresh board starts it', () => {
    const board = useBoard()
    const fresh = { ...board.state.ball.pos }
    board.moveBall({ x: 90, y: 10 })
    board.resetBoard()
    expect(board.state.ball.pos).toEqual(fresh)
  })

  /**
   * Reset is for starting the next drill, and that is nearly always on the
   * same pitch. Snapping back to a blank landscape pitch would mean
   * re-selecting the view every single time.
   */
  it('keeps the pitch type and orientation', () => {
    const board = useBoard()
    board.setPitchType('half')
    board.setRotated(true)
    board.addCounter('red')

    board.resetBoard()

    expect(board.state.pitch).toEqual({ type: 'half', rotated: true })
  })

  it('is undoable', () => {
    const board = useBoard()
    board.addCounter('red')
    board.resetBoard()
    board.undo()
    expect(board.state.counters).toHaveLength(1)
  })
})

describe('clearCounters', () => {
  it('removes every counter but leaves the drawings alone', () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('blue')
    const line = board.startLine({ x: 5, y: 5 }, '#fff')
    board.updateSegment(line, { x: 60, y: 5 })
    board.finishDrawing(line)

    board.clearCounters()

    expect(board.state.counters).toEqual([])
    expect(board.state.drawings).toHaveLength(1)
  })

  it('frees the ball where it was riding, rather than removing it', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 20 })
    board.dropBall({ x: 30, y: 20 })
    const riding = board.ballPosition()

    board.clearCounters()

    expect(board.state.ball.attachedTo).toBeNull()
    expect(board.state.ball.pos).toEqual(riding)
  })

  it('leaves a free ball exactly where it was', () => {
    const board = useBoard()
    board.addCounter('red')
    board.dropBall({ x: 80, y: 40 })
    board.clearCounters()
    expect(board.state.ball.pos).toEqual({ x: 80, y: 40 })
  })

  it('is undoable', () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('blue')
    board.clearCounters()
    board.undo()
    expect(board.state.counters).toHaveLength(2)
  })

  it('does nothing, and adds no undo entry, when there are no counters', () => {
    const board = useBoard()
    board.clearCounters()
    expect(board.canUndo.value).toBe(false)
  })

  it('lets the next counter start from 1 again', () => {
    const board = useBoard()
    board.addCounter('red')
    board.addCounter('red')
    board.clearCounters()
    expect(board.addCounter('red').label).toBe('1')
  })
})
