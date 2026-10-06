import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { GOAL_DEFAULT_WIDTH, GOAL_MAX_WIDTH, GOAL_MIN_WIDTH, PITCH_W, distance } from '../src/geometry'

beforeEach(() => __resetBoardForTests())

describe('addGoal', () => {
  it('puts an upright mini goal where it was dropped, as one undo entry', () => {
    const board = useBoard()
    const goal = board.addGoal({ x: 30, y: 30 })!
    expect(distance(goal.a, goal.b)).toBeCloseTo(GOAL_DEFAULT_WIDTH)
    expect(goal.a.x).toBe(30)
    expect(goal.b.x).toBe(30)
    expect((goal.a.y + goal.b.y) / 2).toBeCloseTo(30)
    board.undo()
    expect(board.state.goals).toHaveLength(0)
  })

  it('belongs to the drill, so every phase has it and moving it moves it everywhere', () => {
    const board = useBoard()
    board.addFrame()
    const goal = board.addGoal({ x: 30, y: 30 })!
    board.translateGroup([{ kind: 'goal', id: goal.id }], { x: 5, y: 0 })
    board.goToFrame(0)
    expect(board.state.goals).toHaveLength(1)
    expect(board.state.goals[0].a.x).toBe(35)
    expect(board.snapshot().goals).toHaveLength(1)
    expect(board.state.frames.every((f) => !('goals' in f))).toBe(true)
  })

  it('is cleared by Reset', () => {
    const board = useBoard()
    board.addGoal({ x: 30, y: 30 })
    board.resetBoard()
    expect(board.state.goals).toEqual([])
  })
})

describe('moveGoalPost', () => {
  it('widens and turns the goal about the other post', () => {
    const board = useBoard()
    const goal = board.addGoal({ x: 30, y: 30 })!
    const fixed = { ...goal.a }
    board.moveGoalPost(goal.id, 'b', { x: fixed.x + 4, y: fixed.y })
    expect(board.goalById(goal.id)!.a).toEqual(fixed)
    expect(board.goalById(goal.id)!.b.x).toBeCloseTo(fixed.x + 4)
    expect(board.goalById(goal.id)!.b.y).toBeCloseTo(fixed.y)
  })

  it('stops at the narrowest and widest a goal can be', () => {
    const board = useBoard()
    const goal = board.addGoal({ x: 50, y: 30 })!
    board.moveGoalPost(goal.id, 'b', { x: goal.a.x, y: goal.a.y + 0.1 })
    expect(distance(board.goalById(goal.id)!.a, board.goalById(goal.id)!.b)).toBeCloseTo(GOAL_MIN_WIDTH)
    board.moveGoalPost(goal.id, 'b', { x: goal.a.x + 40, y: goal.a.y })
    expect(distance(board.goalById(goal.id)!.a, board.goalById(goal.id)!.b)).toBeCloseTo(GOAL_MAX_WIDTH)
  })
})

describe('flipGoal and deleteGoal', () => {
  it('turns the net round, undoably', () => {
    const board = useBoard()
    const goal = board.addGoal({ x: 30, y: 30 })!
    board.flipGoal(goal.id)
    expect(board.goalById(goal.id)!.flipped).toBe(true)
    board.undo()
    expect(board.goalById(goal.id)!.flipped).toBeFalsy()
  })

  it('takes the goal off the drill', () => {
    const board = useBoard()
    const goal = board.addGoal({ x: 30, y: 30 })!
    board.deleteGoal(goal.id)
    expect(board.state.goals).toHaveLength(0)
  })
})

describe('goals in a group', () => {
  it('come off with the group', () => {
    const board = useBoard()
    const goal = board.addGoal({ x: 30, y: 30 })!
    board.deleteGroup([{ kind: 'goal', id: goal.id }])
    expect(board.state.goals).toHaveLength(0)
  })

  it('are copied once, offset, and handed back as the new selection', () => {
    const board = useBoard()
    board.addFrame()
    const goal = board.addGoal({ x: 30, y: 30 })!
    const [copy] = board.duplicateGroup([{ kind: 'goal', id: goal.id }], { x: 4, y: 4 })
    expect(copy.kind).toBe('goal')
    expect(board.state.goals).toHaveLength(2)
    const made = board.goalById(copy.id)!
    expect(made.a.x).toBeCloseTo(goal.a.x + 4)
    expect(made.b.y).toBeCloseTo(goal.b.y + 4)
  })

  it('a goal on the far side faces the other way', () => {
    const board = useBoard()
    const left = board.addGoal({ x: 10, y: 30 })!
    const right = board.addGoal({ x: PITCH_W - 10, y: 30 })!
    expect(left.a.y).toBeLessThan(left.b.y)
    expect(right.a.y).toBeGreaterThan(right.b.y)
  })
})
