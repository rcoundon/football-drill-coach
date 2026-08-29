import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, MAX_NOTES_LENGTH } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('drill notes', () => {
  /**
   * Closed to begin with: an empty field is not worth a quarter of the
   * screen, and the pitch is what a coach is looking at.
   */
  it('start empty, with the panel closed', () => {
    const board = useBoard()
    expect(board.state.notes).toBe('')
    expect(board.state.notesVisible).toBe(false)
  })

  it('are set and are undoable', () => {
    const board = useBoard()
    board.setNotes('Two touch max.\nSwitch after 90 seconds.')
    expect(board.state.notes).toBe('Two touch max.\nSwitch after 90 seconds.')
    board.undo()
    expect(board.state.notes).toBe('')
  })

  it('keep their line breaks, which carry the meaning of a list', () => {
    const board = useBoard()
    board.setNotes('Setup:\n- 20x20 grid\n- 4v2')
    expect(board.state.notes.split('\n')).toHaveLength(3)
  })

  it('are capped, so a runaway paste cannot fill storage', () => {
    const board = useBoard()
    board.setNotes('x'.repeat(MAX_NOTES_LENGTH + 500))
    expect(board.state.notes).toHaveLength(MAX_NOTES_LENGTH)
  })

  /**
   * Typing commits on every keystroke would bury the undo stack, so
   * setNotes coalesces consecutive edits into one entry.
   */
  it('collapse consecutive edits into a single undo entry', () => {
    const board = useBoard()
    board.setNotes('T')
    board.setNotes('Tw')
    board.setNotes('Two')
    board.undo()
    expect(board.state.notes).toBe('')
  })

  it('start a fresh undo entry after something else happens in between', () => {
    const board = useBoard()
    board.setNotes('First')
    board.addCounter('red')
    board.setNotes('Second')
    board.undo()
    expect(board.state.notes).toBe('First')
  })

  it('toggle visibility, undoably', () => {
    const board = useBoard()
    board.toggleNotesVisible()
    expect(board.state.notesVisible).toBe(true)
    board.undo()
    expect(board.state.notesVisible).toBe(false)
  })

  it('are cleared by Reset', () => {
    const board = useBoard()
    board.setNotes('Old drill')
    board.resetBoard()
    expect(board.state.notes).toBe('')
  })

  it('survive clearing the players', () => {
    const board = useBoard()
    board.setNotes('Coaching points')
    board.addCounter('red')
    board.clearCounters()
    expect(board.state.notes).toBe('Coaching points')
  })
})

/**
 * A note that belongs to one phase rather than to the drill. Unlike the
 * players, it deliberately does not reach every phase: the point of it is
 * what happens at this moment and not at the others.
 */
describe('a phase note', () => {
  it('is empty until something is typed', () => {
    const board = useBoard()
    expect(board.frameNote(0)).toBe('')
  })

  it('belongs to the phase it was typed on', () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameNote(1, 'Overload arrives late.')
    expect(board.frameNote(1)).toBe('Overload arrives late.')
    expect(board.frameNote(0)).toBe('')
    expect(board.state.notes).toBe('')
  })

  it('is undoable, coalescing a run of typing into one entry', () => {
    const board = useBoard()
    board.setFrameNote(0, 'Ove')
    board.setFrameNote(0, 'Overl')
    board.setFrameNote(0, 'Overload')
    board.undo()
    expect(board.frameNote(0)).toBe('')
  })

  /** Cleared is indistinguishable from never typed into. */
  it('is dropped rather than stored empty', () => {
    const board = useBoard()
    board.setFrameNote(0, 'Something')
    board.setFrameNote(0, '')
    expect(board.state.frames[0].note).toBeUndefined()
  })

  it('is capped like the drill notes', () => {
    const board = useBoard()
    board.setFrameNote(0, 'x'.repeat(MAX_NOTES_LENGTH + 50))
    expect(board.frameNote(0)).toHaveLength(MAX_NOTES_LENGTH)
  })

  it('refuses while the drill is mid-move', () => {
    const board = useBoard()
    board.addFrame()
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)
    board.scrubTo(500)
    board.setFrameNote(0, 'Nope')
    expect(board.frameNote(0)).toBe('')
    board.endScrub()
  })
})
