import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, MAX_NOTES_LENGTH } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('drill notes', () => {
  it('start empty and visible', () => {
    const board = useBoard()
    expect(board.state.notes).toBe('')
    expect(board.state.notesVisible).toBe(true)
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
    expect(board.state.notesVisible).toBe(false)
    board.undo()
    expect(board.state.notesVisible).toBe(true)
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
