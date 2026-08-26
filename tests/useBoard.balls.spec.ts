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

describe('balls in a group', () => {
  it('copies a free ball, on every phase', () => {
    board.addFrame()
    const id = board.state.balls[0].id
    const copies = board.duplicateGroup([{ kind: 'ball', id }], { x: 4, y: 4 })

    expect(copies).toHaveLength(1)
    expect(board.state.frames[0].balls).toHaveLength(2)
    expect(board.state.frames[1].balls).toHaveLength(2)
    expect(board.state.frames[0].balls[1].id).toBe(copies[0].id)
  })

  it('never copies past the cap', () => {
    while (board.state.balls.length < MAX_BALLS) board.addBall()
    const id = board.state.balls[0].id
    board.duplicateGroup([{ kind: 'ball', id }], { x: 4, y: 4 })
    expect(board.state.balls).toHaveLength(MAX_BALLS)
  })

  it('a copy is free, never carried — a drill does not grow a carrier', () => {
    const counter = board.addCounter('red')
    board.moveCounter(counter.id, { x: 30, y: 30 })
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    // A carried ball is not gathered, so this is the copy of a free one that
    // happens to sit near a player.
    const free = board.addBall()!
    const copies = board.duplicateGroup([{ kind: 'ball', id: free.id }], { x: 1, y: 1 })
    expect(board.ballById(copies[0].id)!.attachedTo).toBeNull()
  })

  it('deleting a group takes its balls off every phase', () => {
    board.addFrame()
    const id = board.state.balls[0].id
    board.deleteGroup([{ kind: 'ball', id }])
    expect(board.state.frames[0].balls).toHaveLength(0)
    expect(board.state.frames[1].balls).toHaveLength(0)
  })

  it('moves with the rest of the group', () => {
    const id = board.state.balls[0].id
    board.moveBall(id, { x: 20, y: 20 })
    board.translateGroup([{ kind: 'ball', id }], { x: 5, y: 0 })
    expect(board.ballById(id)!.pos).toEqual({ x: 25, y: 20 })
  })
})

describe('rough edges found by walking the board', () => {
  it('a copy refused at the cap leaves no undo entry behind', () => {
    while (board.state.balls.length < MAX_BALLS) board.addBall()

    const copies = board.duplicateGroup([{ kind: 'ball', id: board.state.balls[0].id }], { x: 4, y: 4 })
    expect(copies).toEqual([])

    // The refused copy must not have spent a step. One undo therefore takes
    // back the last ball ADDED, not a no-op that changed nothing.
    board.undo()
    expect(board.state.balls).toHaveLength(MAX_BALLS - 1)
  })

  it('does not stack balls on top of each other at the touchline', () => {
    const first = board.state.balls[0]
    board.moveBall(first.id, { x: 1000, y: 30 }) // clamps to the right edge
    const a = board.addBall()!
    const b = board.addBall()!
    expect(a.pos).not.toEqual(first.pos)
    expect(b.pos).not.toEqual(a.pos)
  })
})

describe('where a new ball lands', () => {
  /** One step forward from the last ball, which is where it tries first. */
  const STEP = 4

  it('never lands on a ball that is already there', () => {
    // Stepping only from the LAST ball is not enough: with balls scattered,
    // one step forward can land exactly on a different one.
    const first = board.state.balls[0]
    board.moveBall(first.id, { x: 50, y: 30 })
    const second = board.addBall()!
    board.moveBall(second.id, { x: 50 - STEP, y: 30 }) // one step behind the first

    // The last ball is now at 46, so a step forward lands exactly on 50.
    const third = board.addBall()!
    const others = board.state.balls.filter((b) => b.id !== third.id).map((b) => b.pos)
    expect(others).not.toContainEqual(third.pos)
  })

  it('finds a spot even when the step either way is taken', () => {
    const first = board.state.balls[0]
    board.moveBall(first.id, { x: 50, y: 30 })
    const ahead = board.addBall()!
    board.moveBall(ahead.id, { x: 50 + STEP, y: 30 })
    const behind = board.addBall()!
    board.moveBall(behind.id, { x: 50 - STEP, y: 30 })
    const last = board.addBall()!
    board.moveBall(last.id, { x: 50, y: 30 + STEP })

    // Whatever it tries first, it must end up somewhere nothing else is.
    const next = board.addBall()!
    const taken = board.state.balls.filter((b) => b.id !== next.id).map((b) => b.pos)
    expect(taken).not.toContainEqual(next.pos)
  })

  it('still puts the first ball back in the middle', () => {
    board.removeBall(board.state.balls[0].id)
    expect(board.state.balls).toHaveLength(0)
    const only = board.addBall()!
    expect(only.pos.x).toBeCloseTo(50, 5)
  })
})
