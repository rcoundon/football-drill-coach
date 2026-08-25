import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard, __resetBoardForTests, MAX_BALLS, SNAP_RADIUS } from '../src/composables/useBoard'

const board = useBoard()

beforeEach(() => {
  __resetBoardForTests()
})

describe('a fresh board', () => {
  it('starts with one ball, as it always did', () => {
    expect(board.state.balls).toHaveLength(1)
    expect(board.state.balls[0].attachedTo).toBeNull()
  })

  it('shows the balls until told otherwise', () => {
    expect(board.state.ballsVisible).toBe(true)
  })
})

describe('adding and removing balls', () => {
  it('adds one, free, somewhere on the pitch', () => {
    const added = board.addBall()
    expect(added).not.toBeNull()
    expect(board.state.balls).toHaveLength(2)
    expect(board.state.balls[1].attachedTo).toBeNull()
  })

  it('gives every ball its own id', () => {
    board.addBall()
    board.addBall()
    const ids = new Set(board.state.balls.map((b) => b.id))
    expect(ids.size).toBe(board.state.balls.length)
  })

  it('does not drop two balls on the same spot', () => {
    board.addBall()
    const [a, b] = board.state.balls
    expect(a.pos).not.toEqual(b.pos)
  })

  it('refuses past the cap', () => {
    while (board.state.balls.length < MAX_BALLS) board.addBall()
    expect(board.state.balls).toHaveLength(MAX_BALLS)
    expect(board.addBall()).toBeNull()
    expect(board.state.balls).toHaveLength(MAX_BALLS)
  })

  it('removes one, and will go all the way to none — a shape drill has no ball', () => {
    board.removeBall(board.state.balls[0].id)
    expect(board.state.balls).toHaveLength(0)
  })

  it('is undoable', () => {
    board.addBall()
    board.undo()
    expect(board.state.balls).toHaveLength(1)
  })
})

describe('balls are cast, like players', () => {
  it('a ball added on one phase is on every phase', () => {
    board.addFrame()
    board.addBall()
    expect(board.state.frames[0].balls).toHaveLength(2)
    expect(board.state.frames[1].balls).toHaveLength(2)
    expect(board.state.frames[0].balls[1].id).toBe(board.state.frames[1].balls[1].id)
  })

  it('a ball removed on one phase is off every phase', () => {
    board.addFrame()
    const id = board.state.balls[0].id
    board.removeBall(id)
    expect(board.state.frames[0].balls).toHaveLength(0)
    expect(board.state.frames[1].balls).toHaveLength(0)
  })

  it('but moving one moves it on this phase only', () => {
    const id = board.state.balls[0].id
    board.addFrame()
    board.moveBall(id, { x: 20, y: 20 })
    expect(board.state.frames[1].balls[0].pos).toEqual({ x: 20, y: 20 })
    expect(board.state.frames[0].balls[0].pos).not.toEqual({ x: 20, y: 20 })
  })
})

describe('possession', () => {
  function playerAt(x: number, y: number): string {
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x, y })
    return counter.id
  }

  it('a ball dropped on a player is carried by them', () => {
    const p = playerAt(30, 30)
    const ball = board.state.balls[0]
    board.dropBall(ball.id, { x: 30, y: 30 })
    expect(board.state.balls[0].attachedTo).toBe(p)
  })

  it('a second ball dropped on the same player stays free where it landed', () => {
    const p = playerAt(30, 30)
    const first = board.state.balls[0].id
    board.dropBall(first, { x: 30, y: 30 })
    const second = board.addBall()!.id

    board.dropBall(second, { x: 30, y: 30 })

    expect(board.ballById(first)!.attachedTo).toBe(p)
    expect(board.ballById(second)!.attachedTo).toBeNull()
    expect(board.ballById(second)!.pos).toEqual({ x: 30, y: 30 })
  })

  it('but it will find a free player standing nearby', () => {
    playerAt(30, 30)
    const other = playerAt(30 + SNAP_RADIUS - 0.5, 30)
    const first = board.state.balls[0].id
    board.dropBall(first, { x: 30, y: 30 })
    const second = board.addBall()!.id

    board.dropBall(second, { x: 30 + SNAP_RADIUS - 0.5, y: 30 })
    expect(board.ballById(second)!.attachedTo).toBe(other)
  })

  it('taking a player off sets down every ball they were carrying', () => {
    const p = playerAt(30, 30)
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    board.deleteCounter(p)
    expect(board.state.balls[0].attachedTo).toBeNull()
    expect(board.state.balls).toHaveLength(1)
  })
})

describe('showing and hiding', () => {
  it('is one setting for the whole drill, not one per phase', () => {
    board.addFrame()
    board.toggleBallsVisible()
    expect(board.state.ballsVisible).toBe(false)
    board.goToFrame(0)
    // The bug this replaced: visibility rode on the ball, which put it on the
    // phase, so hiding on one phase left it showing on the next.
    expect(board.state.ballsVisible).toBe(false)
  })

  it('keeps who was carrying what', () => {
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 30, y: 30 })
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    board.toggleBallsVisible()
    board.toggleBallsVisible()
    expect(board.state.balls[0].attachedTo).toBe(counter.id)
  })
})
