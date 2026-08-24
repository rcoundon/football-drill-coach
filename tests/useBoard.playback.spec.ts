import { beforeEach, describe, expect, it } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'

const board = useBoard()

/** Two frames, a player at each end, 1000ms between them. */
function twoFrameDrill(): string {
  board.addCounter('red')
  const id = board.state.counters[0].id
  board.moveCounter(id, { x: 10, y: 30 })
  board.addFrame()
  board.moveCounter(id, { x: 50, y: 30 })
  board.setFrameDuration(1, 1000)
  board.goToFrame(0)
  return id
}

beforeEach(() => {
  __resetBoardForTests()
})

describe('parked on a frame', () => {
  it('the view is the frame’s own arrays, not a copy', () => {
    board.addCounter('red')
    expect(board.view.value.counters).toBe(board.state.frames[0].counters)
  })

  it('nothing is derived, so editing is allowed', () => {
    expect(board.isDerived.value).toBe(false)
  })

  it('a one-frame drill can never be anywhere else', () => {
    board.scrubTo(5000)
    expect(board.isDerived.value).toBe(false)
    expect(board.view.value.counters).toBe(board.state.frames[0].counters)
  })
})

describe('between two frames', () => {
  it('the view is a blend', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    const shown = board.view.value.counters.find((c) => c.id === id)!
    expect(shown.pos.x).toBeCloseTo(30, 6)
    expect(board.isDerived.value).toBe(true)
  })

  it('the frame under the playhead is the current one', () => {
    twoFrameDrill()
    board.scrubTo(500)
    expect(board.state.currentFrame).toBe(0)
    board.scrubTo(1000)
    expect(board.state.currentFrame).toBe(1)
  })

  it('the board itself has not moved — only the view has', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    expect(board.state.frames[0].counters.find((c) => c.id === id)!.pos.x).toBe(10)
  })
})

describe('editing while the view is derived', () => {
  it('is refused', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    board.moveCounter(id, { x: 99, y: 1 })
    expect(board.state.frames[0].counters.find((c) => c.id === id)!.pos.x).toBe(10)
  })

  it('is refused for anything that would commit, too', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    board.deleteCounter(id)
    expect(board.state.frames[0].counters).toHaveLength(1)
    expect(board.canUndo.value).toBe(true) // the setup's entries, not a new one
  })

  it('leaves the drill-wide settings alone — a coach can still rotate or jot a note', () => {
    twoFrameDrill()
    board.scrubTo(500)
    board.setNotes('two touch')
    board.toggleRotated()
    expect(board.state.notes).toBe('two touch')
    expect(board.state.pitch.rotated).toBe(true)
  })

  it('is allowed again once the scrub ends', () => {
    const id = twoFrameDrill()
    board.scrubTo(500)
    board.endScrub()
    board.moveCounter(id, { x: 40, y: 20 })
    expect(board.state.counters.find((c) => c.id === id)!.pos).toEqual({ x: 40, y: 20 })
  })
})

describe('ending a scrub', () => {
  it('snaps to the nearer frame rather than leaving the board mid-move', () => {
    twoFrameDrill()
    board.scrubTo(400)
    board.endScrub()
    expect(board.state.currentFrame).toBe(0)
    expect(board.isDerived.value).toBe(false)

    board.scrubTo(700)
    board.endScrub()
    expect(board.state.currentFrame).toBe(1)
    expect(board.isDerived.value).toBe(false)
  })
})

describe('the transport', () => {
  it('play sets it going', () => {
    twoFrameDrill()
    board.play()
    expect(board.playback.playing).toBe(true)
    board.pause()
    expect(board.playback.playing).toBe(false)
  })

  it('play at the very end starts again from the beginning', () => {
    twoFrameDrill()
    board.scrubTo(1000)
    board.endScrub()
    board.play()
    expect(board.playback.at).toBe(0)
  })

  it('a one-frame drill has nothing to play', () => {
    board.play()
    expect(board.playback.playing).toBe(false)
  })

  it('rewind goes back to the start and stops', () => {
    twoFrameDrill()
    board.scrubTo(600)
    board.play()
    board.rewind()
    expect(board.playback.at).toBe(0)
    expect(board.playback.playing).toBe(false)
    expect(board.state.currentFrame).toBe(0)
  })
})

describe('the playhead follows the board', () => {
  it('going to a frame moves it to that frame’s start', () => {
    twoFrameDrill()
    board.goToFrame(1)
    expect(board.playback.at).toBe(1000)
    expect(board.isDerived.value).toBe(false)
  })

  it('undo puts it back somewhere real', () => {
    twoFrameDrill()
    board.goToFrame(1)
    board.undo()
    expect(board.playback.at).toBe(board.timeline.value.startOf(board.state.currentFrame))
  })
})

describe('the ball in the view', () => {
  it('is drawn where the view says, not where the board says', () => {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.moveCounter(id, { x: 10, y: 30 })
    board.dropBall({ x: 10, y: 30 })
    board.addFrame()
    board.moveCounter(id, { x: 50, y: 30 })
    board.setFrameDuration(1, 1000)
    board.goToFrame(0)

    board.scrubTo(500)
    expect(board.view.value.ball.attachedTo).toBeNull()
    expect(board.viewBallPosition.value.x).toBeGreaterThan(10)
    expect(board.viewBallPosition.value.x).toBeLessThan(50)
  })
})
