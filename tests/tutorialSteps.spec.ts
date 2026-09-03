import { describe, it, expect, beforeEach } from 'vitest'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { STEPS, type TutorialStep } from '../src/tutorial/steps'

beforeEach(() => __resetBoardForTests())

const board = useBoard()

function step(id: string): TutorialStep {
  const found = STEPS.find((s) => s.id === id)
  if (!found) throw new Error(`no step ${id}`)
  return found
}

/** Three players and a second phase: the shape the later goals need. */
function twoPhaseDrill(): string {
  board.addCounter('red')
  board.addCounter('red')
  board.addCounter('blue')
  const id = board.state.counters[0].id
  board.addFrame()
  return id
}

describe('the step list', () => {
  it('runs in the order the tour teaches', () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      'welcome', 'place', 'label', 'phase', 'move', 'pass', 'play', 'more',
    ])
  })

  it('gives every step words to say', () => {
    for (const s of STEPS) {
      expect(s.title.length, s.id).toBeGreaterThan(0)
      expect(s.body.length, s.id).toBeGreaterThan(0)
    }
  })

  /*
   * The opening card and the closing signpost are the only steps a coach
   * advances by pressing Next. Every other step is something they do.
   */
  it('asks for an action everywhere but the ends', () => {
    expect(step('welcome').goal).toBeUndefined()
    expect(step('more').goal).toBeUndefined()
    for (const s of STEPS.slice(1, -1)) expect(s.goal, s.id).toBeTypeOf('function')
  })
})

describe('the place goal', () => {
  it('is false on an empty board', () => {
    expect(step('place').goal!(board)).toBe(false)
  })

  it('is false with two players out', () => {
    board.addCounter('red')
    board.addCounter('red')
    expect(step('place').goal!(board)).toBe(false)
  })

  it('is true with three', () => {
    board.addCounter('red')
    board.addCounter('red')
    board.addCounter('blue')
    expect(step('place').goal!(board)).toBe(true)
  })
})

describe('the label goal', () => {
  it('is false while everyone is unlabelled', () => {
    board.addCounter('red')
    expect(step('label').goal!(board)).toBe(false)
  })

  it('is true once anyone has a label', () => {
    const c = board.addCounter('red')
    board.setCounterLabel(c.id, '9')
    expect(step('label').goal!(board)).toBe(true)
  })
})

describe('the phase goal', () => {
  it('is false on a one-phase drill', () => {
    expect(step('phase').goal!(board)).toBe(false)
  })

  it('is true once there is a second phase', () => {
    board.addFrame()
    expect(step('phase').goal!(board)).toBe(true)
  })
})

describe('the move goal', () => {
  it('is false on a single phase, where nobody can have moved', () => {
    board.addCounter('red')
    expect(step('move').goal!(board)).toBe(false)
  })

  it('is false on a fresh second phase, which is a copy of the first', () => {
    twoPhaseDrill()
    expect(step('move').goal!(board)).toBe(false)
  })

  it('is true once somebody stands somewhere new', () => {
    const id = twoPhaseDrill()
    board.moveCounter(id, { x: 60, y: 20 })
    expect(step('move').goal!(board)).toBe(true)
  })

  /*
   * A coach who steps back to look at the first phase has not undone the run
   * they just drew, so the step must not un-complete under them.
   */
  it('stays true after stepping back to the first phase', () => {
    const id = twoPhaseDrill()
    board.moveCounter(id, { x: 60, y: 20 })
    board.goToFrame(0)
    expect(step('move').goal!(board)).toBe(true)
  })
})

describe('the play goal', () => {
  it('is false on a board that has never been played', () => {
    expect(step('play').goal!(board)).toBe(false)
  })

  it('is true while the drill is playing', () => {
    twoPhaseDrill()
    board.play()
    expect(step('play').goal!(board)).toBe(true)
    board.pause()
  })

  it('stays true once the playhead has left the start', () => {
    twoPhaseDrill()
    board.scrubTo(200)
    expect(step('play').goal!(board)).toBe(true)
  })
})

describe('the pass goal', () => {
  it('is false with nothing drawn', () => {
    expect(step('pass').goal!(board)).toBe(false)
  })

  it('is false for a run arrow, which is the other tool', () => {
    board.startArrow({ x: 10, y: 10 }, '#ffffff', 'run')
    expect(step('pass').goal!(board)).toBe(false)
  })

  it('is true for a pass arrow', () => {
    board.startArrow({ x: 10, y: 10 }, '#ffffff', 'pass')
    expect(step('pass').goal!(board)).toBe(true)
  })

  /*
   * Drawn on the phase the coach was on, which need not be the one they are
   * looking at by the time the watcher runs.
   */
  it('finds a pass drawn on another phase', () => {
    board.startArrow({ x: 10, y: 10 }, '#ffffff', 'pass')
    board.addFrame()
    board.goToFrame(1)
    expect(step('pass').goal!(board)).toBe(true)
  })
})

describe('anchors', () => {
  it('name controls, and only the steps that point at one have them', () => {
    expect(step('welcome').anchor).toBeUndefined()
    expect(step('place').anchor).toBe('[data-add-counter="red"]')
    expect(step('phase').anchor).toBe('[data-add-frame]')
    expect(step('play').anchor).toBe('[data-play]')
    expect(step('pass').anchor).toBe('[data-tool="arrow-pass"]')
    expect(step('more').anchor).toBe('[data-help]')
    /*
     * Both steps about a player point at one. Pressing a colour drops
     * players at the middle of the pitch, which is exactly where a card
     * with no anchor sits — so an anchor-less `label` step covered the very
     * players it was asking the coach to double-press.
     */
    expect(step('label').anchor).toBe('[data-counter]')
    expect(step('move').anchor).toBe('[data-counter]')
    // Spelled out, not left to fall out of omission: the opening card is
    // the one step that deliberately has nothing to point at, and an anchor
    // added to it by mistake would otherwise slip straight past this test.
    expect(step('welcome').anchor).toBeUndefined()
  })
})
