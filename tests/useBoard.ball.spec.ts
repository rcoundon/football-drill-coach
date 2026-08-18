import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, SNAP_RADIUS, BALL_OFFSET } from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

describe('dropBall', () => {
  it('leaves the ball free when it lands on empty grass', () => {
    const board = useBoard()
    board.addCounter('red')
    board.moveCounter(board.state.counters[0].id, { x: 10, y: 10 })
    board.dropBall({ x: 80, y: 40 })
    expect(board.state.ball.attachedTo).toBeNull()
    expect(board.state.ball.pos).toEqual({ x: 80, y: 40 })
  })

  it('attaches the ball to a counter dropped within the snap radius', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30 + SNAP_RADIUS * 0.5, y: 30 })
    expect(board.state.ball.attachedTo).toBe(c.id)
  })

  it('does not attach to a counter just outside the snap radius', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30 + SNAP_RADIUS * 1.5, y: 30 })
    expect(board.state.ball.attachedTo).toBeNull()
  })

  it('attaches to the NEAREST counter when two are in range', () => {
    const board = useBoard()
    const near = board.addCounter('red')
    const far = board.addCounter('blue')
    board.moveCounter(near.id, { x: 30, y: 30 })
    board.moveCounter(far.id, { x: 30 + SNAP_RADIUS * 0.9, y: 30 })
    board.dropBall({ x: 30.1, y: 30 })
    expect(board.state.ball.attachedTo).toBe(near.id)
  })

  it('keeps possession when the attached ball is tapped and released where it sits', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    expect(board.state.ball.attachedTo).toBe(c.id)

    // A tap grabs the ball where it is drawn — at its offset from the holder —
    // and a release without movement must put it straight back.
    board.moveBall(board.ballPosition())
    board.dropBall(board.state.ball.pos)
    expect(board.state.ball.attachedTo).toBe(c.id)
  })

  it('detaches when dragged off a player onto empty grass', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    expect(board.state.ball.attachedTo).toBe(c.id)
    board.dropBall({ x: 90, y: 10 })
    expect(board.state.ball.attachedTo).toBeNull()
  })
})

describe('ballPosition', () => {
  it('is the stored position when the ball is free', () => {
    const board = useBoard()
    board.dropBall({ x: 12, y: 34 })
    expect(board.ballPosition()).toEqual({ x: 12, y: 34 })
  })

  it('rides at a fixed offset from the counter holding it', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    expect(board.ballPosition()).toEqual({ x: 30 + BALL_OFFSET.x, y: 30 + BALL_OFFSET.y })
  })

  it('follows the counter when the counter moves', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    board.moveCounter(c.id, { x: 70, y: 20 })
    expect(board.ballPosition()).toEqual({ x: 70 + BALL_OFFSET.x, y: 20 + BALL_OFFSET.y })
  })

  it('falls back to the free position if the holder vanishes', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    board.state.ball.attachedTo = 'ghost'
    expect(() => board.ballPosition()).not.toThrow()
  })
})

describe('deleting the counter that holds the ball', () => {
  it('frees the ball at that counter last position', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 44, y: 22 })
    board.dropBall({ x: 44, y: 22 })
    board.deleteCounter(c.id)
    expect(board.state.ball.attachedTo).toBeNull()
    expect(board.state.ball.pos).toEqual({ x: 44, y: 22 })
  })
})

describe('moveBall', () => {
  it('detaches the ball as soon as a drag starts', () => {
    const board = useBoard()
    const c = board.addCounter('red')
    board.moveCounter(c.id, { x: 30, y: 30 })
    board.dropBall({ x: 30, y: 30 })
    board.moveBall({ x: 31, y: 31 })
    expect(board.state.ball.attachedTo).toBeNull()
  })

  it('clamps to the pitch', () => {
    const board = useBoard()
    board.moveBall({ x: -10, y: -10 })
    expect(board.state.ball.pos).toEqual({ x: 0, y: 0 })
  })
})
