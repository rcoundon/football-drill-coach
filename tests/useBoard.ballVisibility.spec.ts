import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('ball visibility', () => {
  it('starts visible', () => {
    expect(useBoard().state.ballsVisible).toBe(true)
  })

  it('toggles off and back on', () => {
    const board = useBoard()
    board.toggleBallsVisible()
    expect(board.state.ballsVisible).toBe(false)
    board.toggleBallsVisible()
    expect(board.state.ballsVisible).toBe(true)
  })

  it('is undoable', () => {
    const board = useBoard()
    board.toggleBallsVisible()
    board.undo()
    expect(board.state.ballsVisible).toBe(true)
  })

  /**
   * Hiding the ball is about what the drill shows, not about who had it.
   * Keeping attachedTo means showing it again puts it back with the player
   * who was carrying it, rather than dumping it on the grass.
   */
  it('remembers who was carrying it while hidden', () => {
    const board = useBoard()
    const player = board.addCounter('red')
    board.moveCounter(player.id, { x: 30, y: 30 })
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    expect(board.state.balls[0].attachedTo).toBe(player.id)

    board.toggleBallsVisible()
    expect(board.state.balls[0].attachedTo).toBe(player.id)

    board.toggleBallsVisible()
    expect(board.state.balls[0].attachedTo).toBe(player.id)
  })

  it('comes back visible after a reset', () => {
    const board = useBoard()
    board.toggleBallsVisible()
    board.resetBoard()
    expect(board.state.ballsVisible).toBe(true)
  })
})
