import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('a note jotted mid-blend still gets its own undo entry, not a silent write', () => {
    twoFrameDrill()
    board.scrubTo(500)
    board.setNotes('two touch')
    expect(board.state.notes).toBe('two touch')
    board.endScrub()

    // Undoing must reverse exactly the note, not swallow an earlier entry
    // from setting up the drill — the frame duration the setup committed
    // must survive a single undo of the note.
    board.undo()
    expect(board.state.notes).toBe('')
    expect(board.state.frames[1].duration).toBe(1000)

    board.redo()
    expect(board.state.notes).toBe('two touch')
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

/**
 * `tick`, `play` and `pause` drive the transport off `requestAnimationFrame`.
 * The rest of this file deliberately drives `scrubTo` instead, because rAF
 * is awkward to test — but that leaves the clock itself, and the delta
 * timing inside `tick`, untouched by anything. A real browser cannot help
 * here either: Chrome throttles rAF to a standstill in a background tab, so
 * the callback is stubbed and fired by hand, with timestamps this file
 * chooses, instead.
 */
describe('the playback clock', () => {
  let pending: FrameRequestCallback | null = null
  let rafCalls = 0

  beforeEach(() => {
    pending = null
    rafCalls = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending = cb
      rafCalls += 1
      return rafCalls
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Fire whatever frame is currently queued, as a browser would on the next paint. */
  function fireTick(now: number): void {
    const cb = pending
    pending = null
    cb?.(now)
  }

  /**
   * Three frames 500ms apart. Unlike `twoFrameDrill`, the boundary between
   * the first two (500ms) falls short of the timeline's total (1000ms), so
   * crossing it is a genuine mid-drill event rather than the end-of-playback
   * case `tick` also has to handle.
   */
  function threeFrameDrill(): void {
    board.addCounter('red')
    const id = board.state.counters[0].id
    board.moveCounter(id, { x: 10, y: 30 })
    board.addFrame()
    board.moveCounter(id, { x: 30, y: 30 })
    board.setFrameDuration(1, 500)
    board.addFrame()
    board.moveCounter(id, { x: 50, y: 30 })
    board.setFrameDuration(2, 500)
    board.goToFrame(0)
  }

  it('advances the playhead by the elapsed delta between ticks, not a fixed step', () => {
    twoFrameDrill()
    board.play()

    fireTick(1000) // the first tick only establishes the clock; nothing has elapsed yet
    expect(board.playback.at).toBe(0)

    fireTick(1030) // a 30ms gap
    expect(board.playback.at).toBe(30)

    fireTick(1110) // an 80ms gap, deliberately different from the last
    expect(board.playback.at).toBe(110)
  })

  it('carries state.currentFrame across a frame boundary while playing', () => {
    threeFrameDrill()
    board.play()

    fireTick(1000) // establishes the clock; a timestamp of 0 here would collide
    // with tick's own sentinel for "not yet started" and be treated as one
    expect(board.state.currentFrame).toBe(0)

    fireTick(1400) // 400ms elapsed: short of the 500ms boundary
    expect(board.state.currentFrame).toBe(0)

    fireTick(1600) // 600ms elapsed: past it
    expect(board.state.currentFrame).toBe(1)
  })

  it('stops at the end of the timeline and requests nothing further', () => {
    twoFrameDrill()
    board.play()
    fireTick(1000) // establishes the clock

    const callsBeforeTheEnd = rafCalls
    fireTick(2000) // 1000ms elapsed — exactly the timeline's total

    expect(board.playback.playing).toBe(false)
    expect(board.playback.at).toBe(board.timeline.value.total)
    expect(rafCalls).toBe(callsBeforeTheEnd) // no successor was scheduled
    expect(pending).toBeNull()
  })

  it('pause() mid-play stops the loop and leaves the playhead where it was', () => {
    twoFrameDrill()
    board.play()
    fireTick(1000)
    fireTick(1200) // 200ms in

    const atBeforePause = board.playback.at
    board.pause()

    expect(board.playback.playing).toBe(false)
    expect(board.playback.at).toBe(atBeforePause)
  })

  it('a tick that arrives after pause() does nothing', () => {
    twoFrameDrill()
    board.play()
    fireTick(1000)
    fireTick(1200) // queues the next frame, captured below before it is discarded

    const late = pending
    board.pause()
    const atAfterPause = board.playback.at

    late?.(9999) // as if the browser had already queued this before pause() ran

    expect(board.playback.at).toBe(atAfterPause)
    expect(board.playback.playing).toBe(false)
  })

  it('play() while already playing does not start a second loop', () => {
    twoFrameDrill()
    board.play()
    fireTick(1000)

    const callsBefore = rafCalls
    board.play() // a double-tapped play button, or a held key repeating

    expect(rafCalls).toBe(callsBefore)

    // Two loops would each advance the playhead on every frame, so the drill
    // would play at double speed — visible to a coach, and hard to explain.
    fireTick(1100)
    expect(board.playback.at).toBe(100)
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
