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

  it('keeps line breaks but drops the spaces trailing each line', () => {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, '  Overlap  \r\nthen cross \n')!
    expect(label.text).toBe('Overlap\nthen cross')
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

describe('a label belongs to its phase', () => {
  /** A label on phase 1, then phase 2 added as a copy of it. */
  function onTwoPhases() {
    const board = useBoard()
    const label = board.addLabel({ x: 10, y: 10 }, 'Press')!
    board.addFrame()
    return { board, id: label.id }
  }

  it('goes on this phase only', () => {
    const board = useBoard()
    board.addFrame()
    board.addLabel({ x: 10, y: 10 }, 'Later')
    expect(board.state.frames[0].labels).toHaveLength(0)
    expect(board.state.frames[1].labels).toHaveLength(1)
  })

  it('is carried into a new phase under the same id, so playback can glide it', () => {
    const { board, id } = onTwoPhases()
    expect(board.state.frames[1].labels.map((l) => l.id)).toEqual([id])
  })

  it('changes its words on this phase only', () => {
    const { board, id } = onTwoPhases()
    board.setLabelText(id, 'Now cover')
    expect(board.state.frames[1].labels[0].text).toBe('Now cover')
    expect(board.state.frames[0].labels[0].text).toBe('Press')
  })

  it('comes off this phase only, whether deleted, cleared or removed in a group', () => {
    for (const remove of [
      (board: ReturnType<typeof useBoard>, id: string) => board.deleteLabel(id),
      (board: ReturnType<typeof useBoard>, id: string) => board.setLabelText(id, ''),
      (board: ReturnType<typeof useBoard>, id: string) => board.deleteGroup([{ kind: 'label', id }]),
    ]) {
      __resetBoardForTests()
      const { board, id } = onTwoPhases()
      remove(board, id)
      expect(board.state.frames[1].labels).toHaveLength(0)
      expect(board.state.frames[0].labels).toHaveLength(1)
    }
  })

  it('is copied onto this phase only', () => {
    const { board, id } = onTwoPhases()
    const [copy] = board.duplicateGroup([{ kind: 'label', id }], { x: 5, y: 5 })
    expect(board.state.frames[1].labels.map((l) => l.id)).toContain(copy.id)
    expect(board.state.frames[0].labels.map((l) => l.id)).not.toContain(copy.id)
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
