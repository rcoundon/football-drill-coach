import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, MAX_LABEL_LENGTH } from '../src/composables/useBoard'
import { PITCH_H, PITCH_W } from '../src/geometry'

beforeEach(() => __resetBoardForTests())

describe('addLabel', () => {
  it('places the text exactly where it was tapped', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 24, y: 18 }, 'Press trigger')!
    expect(label.pos).toEqual({ x: 24, y: 18 })
    expect(label.text).toBe('Press trigger')
    expect(board.state.labels).toHaveLength(1)
  })

  it('clamps a tap outside the pitch back onto it', () => {
    const board = useBoard()
    const label = board.addLabel({ x: -30, y: 9999 }, 'Wide')!
    expect(label.pos).toEqual({ x: 0, y: PITCH_H })
  })

  it('trims the text and caps its length', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, `   ${'x'.repeat(MAX_LABEL_LENGTH + 20)}   `)!
    expect(label.text).toHaveLength(MAX_LABEL_LENGTH)
  })

  it('refuses text that is empty once trimmed, and adds no undo entry', () => {
    const board = useBoard()
    expect(board.addLabel({ x: 10, y: 10 }, '   ')).toBeNull()
    expect(board.state.labels).toHaveLength(0)
    expect(board.canUndo.value).toBe(false)
  })

  it('is undoable, one entry per label', () => {
    const board = useBoard()
    board.addLabel({ x: 10, y: 10 }, 'One')
    board.addLabel({ x: 30, y: 10 }, 'Two')
    board.undo()
    expect(board.state.labels).toHaveLength(1)
  })

  it('gives every label an id that cannot collide with a counter', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const label = board.addLabel({ x: 10, y: 10 }, 'Note')
    expect(label!.id).not.toBe(counter.id)
  })
})

describe('editing and moving a label', () => {
  it('changes the text and is undoable', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, 'Before')!
    board.setLabelText(label.id, 'After')
    expect(board.labelById(label.id)!.text).toBe('After')
    board.undo()
    expect(board.labelById(label.id)!.text).toBe('Before')
  })

  it('deletes the label when its text is cleared', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, 'Gone soon')!
    board.setLabelText(label.id, '  ')
    expect(board.state.labels).toHaveLength(0)
  })

  it('moves without committing, because a drag calls it repeatedly', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, 'Drag me')!
    board.moveLabel(label.id, { x: 40, y: 25 })
    board.moveLabel(label.id, { x: 50, y: 25 })
    expect(board.labelById(label.id)!.pos).toEqual({ x: 50, y: 25 })
    board.undo()
    expect(board.state.labels).toHaveLength(0)
  })

  it('clamps a move to the pitch', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, 'Edge')!
    board.moveLabel(label.id, { x: 9999, y: -5 })
    expect(board.labelById(label.id)!.pos).toEqual({ x: PITCH_W, y: 0 })
  })

  it('deletes and is undoable', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, 'Bye')!
    board.deleteLabel(label.id)
    expect(board.state.labels).toHaveLength(0)
    board.undo()
    expect(board.state.labels).toHaveLength(1)
  })
})

describe('labels and the rest of the board', () => {
  it('never takes possession of the ball', () => {
    const board = useBoard()
    board.addLabel({ x: 30, y: 30 }, 'Here')
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    expect(board.state.balls[0].attachedTo).toBeNull()
  })

  it('survives Clear players and Clear drawings', () => {
    const board = useBoard()
    board.addCounter('red')
    board.addLabel({ x: 10, y: 10 }, 'Stay')
    board.clearCounters()
    board.clearDrawings()
    expect(board.state.labels).toHaveLength(1)
  })

  it('is taken away by Reset', () => {
    const board = useBoard()
    board.addLabel({ x: 10, y: 10 }, 'Gone')
    board.resetBoard()
    expect(board.state.labels).toEqual([])
  })
})

describe('label visibility', () => {
  it('starts visible and toggles', () => {
    const board = useBoard()
    expect(board.state.labelsVisible).toBe(true)
    board.toggleLabelsVisible()
    expect(board.state.labelsVisible).toBe(false)
  })

  it('is undoable', () => {
    const board = useBoard()
    board.toggleLabelsVisible()
    board.undo()
    expect(board.state.labelsVisible).toBe(true)
  })

  it('keeps the labels themselves while hidden', () => {
    const board = useBoard()
    board.addLabel({ x: 10, y: 10 }, 'Still here')
    board.toggleLabelsVisible()
    expect(board.state.labels).toHaveLength(1)
  })
})
