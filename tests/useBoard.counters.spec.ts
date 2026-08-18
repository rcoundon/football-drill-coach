import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
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

  it('numbers counters from 1 within each colour independently', () => {
    const board = useBoard()
    expect(board.addCounter('red').label).toBe('1')
    expect(board.addCounter('red').label).toBe('2')
    expect(board.addCounter('blue').label).toBe('1')
    expect(board.addCounter('red').label).toBe('3')
  })

  it('is undoable', () => {
    const board = useBoard()
    board.addCounter('red')
    board.undo()
    expect(board.state.counters).toHaveLength(0)
  })
})

describe('label numbering after deletion', () => {
  it('leaves a gap rather than renumbering surviving counters', () => {
    const board = useBoard()
    const one = board.addCounter('red')
    const two = board.addCounter('red')
    const three = board.addCounter('red')
    board.deleteCounter(two.id)
    expect(board.counterById(one.id)!.label).toBe('1')
    expect(board.counterById(three.id)!.label).toBe('3')
  })

  it('gives the next new counter a label above the highest in use', () => {
    const board = useBoard()
    board.addCounter('red')
    const two = board.addCounter('red')
    board.deleteCounter(two.id)
    // Highest surviving red label is 1, so the next is 2 — reusing the gap.
    expect(board.addCounter('red').label).toBe('2')
  })

  it('is not confused by a hand-edited non-numeric label', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, 'GK')
    expect(board.addCounter('red').label).toBe('1')
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
    expect(board.counterById(c.id)!.label).toBe('1')
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
