import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests, SNAP_RADIUS } from '../src/composables/useBoard'
import { PITCH_H, PITCH_W } from '../src/geometry'

beforeEach(() => __resetBoardForTests())

describe('addMarker', () => {
  it('places a cone exactly where it was tapped', () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 24, y: 18 })
    expect(marker.pos).toEqual({ x: 24, y: 18 })
    expect(board.state.markers).toHaveLength(1)
  })

  it('clamps a tap outside the pitch back onto it', () => {
    const board = useBoard()
    const marker = board.addMarker({ x: -30, y: 9999 })
    expect(marker.pos).toEqual({ x: 0, y: PITCH_H })
  })

  it('places each cone independently, without shuffling them apart', () => {
    const board = useBoard()
    board.addMarker({ x: 20, y: 20 })
    board.addMarker({ x: 20.5, y: 20 })
    expect(board.state.markers.map((m) => m.pos)).toEqual([
      { x: 20, y: 20 },
      { x: 20.5, y: 20 },
    ])
  })

  it('gives every cone an id that cannot collide with a counter', () => {
    const board = useBoard()
    const counter = board.addCounter('red')
    const marker = board.addMarker({ x: 10, y: 10 })
    expect(marker.id).not.toBe(counter.id)
  })

  it('is undoable, one entry per cone', () => {
    const board = useBoard()
    board.addMarker({ x: 10, y: 10 })
    board.addMarker({ x: 30, y: 10 })
    board.undo()
    expect(board.state.markers).toHaveLength(1)
    board.undo()
    expect(board.state.markers).toHaveLength(0)
  })
})

describe('moveMarker', () => {
  it('moves the cone', () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 10, y: 10 })
    board.moveMarker(marker.id, { x: 40, y: 25 })
    expect(board.markerById(marker.id)!.pos).toEqual({ x: 40, y: 25 })
  })

  it('clamps to the pitch', () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 10, y: 10 })
    board.moveMarker(marker.id, { x: 9999, y: -5 })
    expect(board.markerById(marker.id)!.pos).toEqual({ x: PITCH_W, y: 0 })
  })

  it('does NOT commit, because a drag calls it repeatedly', () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 10, y: 10 })
    board.moveMarker(marker.id, { x: 20, y: 20 })
    board.moveMarker(marker.id, { x: 30, y: 30 })
    board.undo()
    expect(board.state.markers).toHaveLength(0)
  })

  it('ignores an unknown id', () => {
    const board = useBoard()
    expect(() => board.moveMarker('nope', { x: 1, y: 1 })).not.toThrow()
  })
})

describe('deleteMarker', () => {
  it('removes the cone and is undoable', () => {
    const board = useBoard()
    const marker = board.addMarker({ x: 10, y: 10 })
    board.deleteMarker(marker.id)
    expect(board.state.markers).toHaveLength(0)
    board.undo()
    expect(board.state.markers).toHaveLength(1)
  })
})

describe('cones and the ball', () => {
  it('never takes possession, however close the ball lands', () => {
    const board = useBoard()
    board.addMarker({ x: 30, y: 30 })
    board.dropBall(board.state.balls[0].id, { x: 30, y: 30 })
    expect(board.state.balls[0].attachedTo).toBeNull()
  })

  it('does not steal the ball from a player standing beside it', () => {
    const board = useBoard()
    const player = board.addCounter('red')
    board.moveCounter(player.id, { x: 30, y: 30 })
    board.addMarker({ x: 30 + SNAP_RADIUS * 0.2, y: 30 })
    board.dropBall(board.state.balls[0].id, { x: 30 + SNAP_RADIUS * 0.3, y: 30 })
    expect(board.state.balls[0].attachedTo).toBe(player.id)
  })
})

describe('clearing', () => {
  it('leaves the cones standing when the players are cleared', () => {
    const board = useBoard()
    board.addCounter('red')
    board.addMarker({ x: 10, y: 10 })
    board.clearCounters()
    expect(board.state.counters).toEqual([])
    expect(board.state.markers).toHaveLength(1)
  })

  it('takes the cones away on a reset', () => {
    const board = useBoard()
    board.addMarker({ x: 10, y: 10 })
    board.resetBoard()
    expect(board.state.markers).toEqual([])
  })

  it('counts cones when deciding whether the board is worth resetting', () => {
    const board = useBoard()
    board.addMarker({ x: 10, y: 10 })
    expect(board.state.markers).toHaveLength(1)
  })
})
