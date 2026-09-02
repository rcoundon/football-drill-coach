import { describe, it, expect, beforeEach } from 'vitest'
import {
  useBoard,
  __resetBoardForTests,
  COUNTER_RADIUS,
  COUNTER_SPACING,
} from '../src/composables/useBoard'
import { PITCH_H, PITCH_W } from '../src/geometry'

beforeEach(() => __resetBoardForTests())

describe('addCounter', () => {
  it('drops the counter at the centre of the pitch', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    expect(c.pos).toEqual({ x: PITCH_W / 2, y: PITCH_H / 2 })
  })

  it('adds it to state with the requested colour', () => {
    const board = useBoard()
    board.addCounter('blue')
    expect(board.state.counters).toHaveLength(1)
    expect(board.state.counters[0].color).toBe('blue')
  })

  /**
   * Counters arrive unlabelled. Most drills are explained by colour and
   * position, and a number nobody asked for is a number the coach has to
   * clear before writing the one they actually want.
   */
  it('leaves the counter unlabelled', () => {
    const board = useBoard()
    expect(board.addCounter('red').label).toBe('')
    expect(board.addCounter('red').label).toBe('')
    expect(board.addCounter('blue').label).toBe('')
  })

  it('is undoable', () => {
    const board = useBoard()
    board.addCounter('red')
    board.undo()
    expect(board.state.counters).toHaveLength(0)
  })
})

/**
 * Dropping every counter at the pitch centre buries each new one under the
 * last: a coach laying out a squad gets a single heap and has to drag them
 * off it blind. Each counter must land clear of the ones already placed.
 */
describe('placement of a new counter', () => {
  it('never lands on top of a counter already on the board', () => {
    const board = useBoard()
    const placed = Array.from({ length: 22 }, (_, i) =>
      board.addCounter(i % 2 === 0 ? 'red' : 'blue'),
    )

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = board.counterById(placed[i].id)!.pos
        const b = board.counterById(placed[j].id)!.pos
        const gap = Math.hypot(a.x - b.x, a.y - b.y)
        expect(gap, `counters ${i} and ${j} overlap`).toBeGreaterThanOrEqual(COUNTER_SPACING - 1e-9)
      }
    }
  })

  it('keeps every counter, drawn radius included, inside the pitch', () => {
    const board = useBoard()
    for (let i = 0; i < 22; i++) board.addCounter('red')

    for (const counter of board.state.counters) {
      expect(counter.pos.x).toBeGreaterThanOrEqual(COUNTER_RADIUS - 1e-9)
      expect(counter.pos.x).toBeLessThanOrEqual(PITCH_W - COUNTER_RADIUS + 1e-9)
      expect(counter.pos.y).toBeGreaterThanOrEqual(COUNTER_RADIUS - 1e-9)
      expect(counter.pos.y).toBeLessThanOrEqual(PITCH_H - COUNTER_RADIUS + 1e-9)
    }
  })

  it('fills the gap left by a deleted counter rather than drifting outward forever', () => {
    const board = useBoard()
    const first = board.addCounter('red')
    const second = board.addCounter('red')
    const spot = { ...board.counterById(second.id)!.pos }
    board.deleteCounter(second.id)

    const replacement = board.addCounter('blue')
    expect(replacement.pos).toEqual(spot)
    expect(board.counterById(first.id)!.pos).not.toEqual(spot)
  })
})

describe('moveCounter', () => {
  it('moves the counter', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 10, y: 20 })
    expect(board.counterById(c.id)!.pos).toEqual({ x: 10, y: 20 })
  })

  it('clamps the counter to the pitch', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: -50, y: 5000 })
    expect(board.counterById(c.id)!.pos).toEqual({ x: 0, y: PITCH_H })
  })

  it('does NOT push an undo entry, because a drag calls it repeatedly', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 10, y: 10 })
    board.moveCounter(c.id, { x: 11, y: 11 })
    board.moveCounter(c.id, { x: 12, y: 12 })
    board.undo() // undoes the add, not any of the moves
    expect(board.state.counters).toHaveLength(0)
  })

  it('ignores an unknown id', () => {
    const board = useBoard()
    expect(() => board.moveCounter('nope', { x: 1, y: 1 })).not.toThrow()
  })
})

describe('setCounterLabel', () => {
  it('sets the label and is undoable', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, 'Sam')
    expect(board.counterById(c.id)!.label).toBe('Sam')
    board.undo()
    expect(board.counterById(c.id)!.label).toBe('')
  })

  it('takes a number, which is what most coaches will want', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, '9')
    expect(board.counterById(c.id)!.label).toBe('9')
  })

  it('clears back to unlabelled', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, '7')
    board.setCounterLabel(c.id, '  ')
    expect(board.counterById(c.id)!.label).toBe('')
    expect(board.state.counters).toHaveLength(1)
  })

  it('trims whitespace and caps the length at 4 characters', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, '   Rodriguez   ')
    expect(board.counterById(c.id)!.label).toBe('Rodr')
  })
})

describe('deleteCounter', () => {
  it('removes the counter and is undoable', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.deleteCounter(c.id)
    expect(board.state.counters).toHaveLength(0)
    board.undo()
    expect(board.state.counters).toHaveLength(1)
  })
})

/**
 * A player is cast for the whole drill — the same person from start to end —
 * so their colour is not something that can differ from phase to phase, any
 * more than their name is.
 */
describe('recolouring a player', () => {
  it('changes them on every phase, undoably', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    board.addFrame()

    board.setCounterColor(counter.id, 'blue')
    expect(board.state.frames.every((f) => f.counters[0].color === 'blue')).toBe(true)

    board.undo()
    expect(board.state.frames.every((f) => f.counters[0].color === 'red')).toBe(true)
  })

  /**
   * Checked by undoing rather than by reading `canUndo`, which was already
   * true from adding the player and stayed true either way.
   */
  it('commits nothing when the colour is already what was asked for', () => {
    const board = useBoard()
    const counter = board.addCounter('red')

    board.setCounterColor(counter.id, 'red')
    board.undo()

    // One undo reaches past the colour that never changed to the player.
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('bending a run', () => {
  /** A player on a second phase, which is the only place a run exists. */
  function playerWithARun() {
    const board = useBoard()
    const c = board.addCounter('red')
    board.addFrame()
    board.moveCounter(c.id, { x: 30, y: 10 })
    return { board, id: c.id }
  }

  it('stores the bend on the phase it is set on', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    expect(board.counterById(id)!.bend).toBe(4)
    expect(board.counterById(id)!.bendAlong).toBe(0.1)
  })

  it('leaves the other phases straight', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    board.goToFrame(0)
    expect(board.counterById(id)!.bend).toBeUndefined()
  })

  it('stores a straightened run as no fields at all', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    board.setCounterBend(id, 0, 0)
    expect('bend' in board.counterById(id)!).toBe(false)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })

  it('drops the skew when the bow goes', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0.1)
    board.setCounterBend(id, 0)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })

  it('stores an even arc as no skew field', () => {
    const { board, id } = playerWithARun()
    board.setCounterBend(id, 4, 0)
    expect(board.counterById(id)!.bend).toBe(4)
    expect('bendAlong' in board.counterById(id)!).toBe(false)
  })

  it('does nothing while the drill is playing', () => {
    const { board, id } = playerWithARun()
    board.play()
    board.setCounterBend(id, 4, 0.1)
    board.pause()
    expect(board.counterById(id)!.bend).toBeUndefined()
  })

  /**
   * A duplicated phase starts with nobody having moved into it — its cast
   * stands exactly where the original's does, so there is no run yet to
   * describe a curve for. A bend copied along with the rest of the counter
   * would sit there unseen until the coach drags the player, at which point
   * it would bow the new run into a shape nobody drew.
   */
  describe('duplicating a phase that has a bent run', () => {
    it('addFrame gives the copy a straight run once the player moves', () => {
      const { board, id } = playerWithARun()
      board.setCounterBend(id, 8, 0.3)
      board.addFrame()
      board.moveCounter(id, { x: 60, y: 40 })
      expect(board.counterById(id)!.bend).toBeUndefined()
      expect(board.counterById(id)!.bendAlong).toBeUndefined()
    })

    it('duplicateFrame does the same, being the same operation', () => {
      const { board, id } = playerWithARun()
      board.setCounterBend(id, 8, 0.3)
      board.duplicateFrame(board.state.currentFrame)
      board.moveCounter(id, { x: 60, y: 40 })
      expect(board.counterById(id)!.bend).toBeUndefined()
      expect(board.counterById(id)!.bendAlong).toBeUndefined()
    })
  })
})
