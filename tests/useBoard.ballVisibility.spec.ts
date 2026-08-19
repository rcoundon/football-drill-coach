import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('ball visibility', () => {
  it('starts visible', () => {
    expect(useBoard().state.ball.visible).toBe(true)
  })

  it('toggles off and back on', () => {
    const board = useBoard()
    board.toggleBallVisible()
    expect(board.state.ball.visible).toBe(false)
    board.toggleBallVisible()
    expect(board.state.ball.visible).toBe(true)
  })

  it('is undoable', () => {
    const board = useBoard()
    board.toggleBallVisible()
    board.undo()
    expect(board.state.ball.visible).toBe(true)
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
    board.dropBall({ x: 30, y: 30 })
    expect(board.state.ball.attachedTo).toBe(player.id)

    board.toggleBallVisible()
    expect(board.state.ball.attachedTo).toBe(player.id)

    board.toggleBallVisible()
    expect(board.state.ball.attachedTo).toBe(player.id)
  })

  it('comes back visible after a reset', () => {
    const board = useBoard()
    board.toggleBallVisible()
    board.resetBoard()
    expect(board.state.ball.visible).toBe(true)
  })
})
