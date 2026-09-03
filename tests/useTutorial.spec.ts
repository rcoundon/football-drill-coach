import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useBoard, __resetBoardForTests } from '../src/composables/useBoard'
import { useStorage, DRAFT_KEY } from '../src/composables/useStorage'
import {
  useTutorial,
  __resetTutorialForTests,
  TUTORIAL_KEY,
  TUTORIAL_PARK_KEY,
} from '../src/composables/useTutorial'

const board = useBoard()
const tutorial = useTutorial()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  __resetTutorialForTests()
  useStorage().lastError.value = null
})

/** A drill worth parking: two players and a name on the board. */
function aDrill(): void {
  board.addCounter('red')
  board.addCounter('blue')
}

describe('starting', () => {
  it('empties the board', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(board.state.counters).toHaveLength(0)
  })

  it('writes the drill to the draft, so nothing is lost', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(useStorage().loadDraft()!.frames[0].counters).toHaveLength(2)
  })

  it('parks which drill it was', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(JSON.parse(localStorage.getItem(TUTORIAL_PARK_KEY)!)).toEqual({
      patternId: 'p1',
      name: 'Rondo',
    })
  })

  it('opens on the first step', () => {
    tutorial.start({ patternId: null, name: '' })
    expect(tutorial.active.value).toBe(true)
    expect(tutorial.step.value!.id).toBe('welcome')
  })

  it('leaves nothing to undo, so the coach cannot walk into the parked board', () => {
    aDrill()
    tutorial.start({ patternId: null, name: '' })
    expect(board.canUndo.value).toBe(false)
  })

  it('keeps the pitch the coach was looking at', () => {
    board.setRotated(true)
    tutorial.start({ patternId: null, name: '' })
    expect(board.state.pitch.rotated).toBe(true)
  })

  it('does nothing if a tour is already running', () => {
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    tutorial.next()
    tutorial.start({ patternId: 'p2', name: 'Other' })
    expect(tutorial.stepIndex.value).toBe(1)
  })

  /*
   * `saveDraft` swallows a `QuotaExceededError` rather than throwing — it
   * sets `lastError` and returns nothing useful to check. A `start` that
   * presses on regardless empties the board and wipes the undo stack for a
   * drill that never reached storage: the worst outcome this app has, since
   * it keeps no copy anywhere else.
   */
  describe('when the draft cannot be written', () => {
    beforeEach(() => {
      // jsdom's Storage is a legacy platform object: assigning
      // `localStorage.setItem = fn` directly is silently dropped, so the
      // override has to go through the prototype, same as collection.spec.ts.
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const error = new Error('full')
        error.name = 'QuotaExceededError'
        throw error
      })
    })

    it('does not touch the board', () => {
      aDrill()
      tutorial.start({ patternId: 'p1', name: 'Rondo' })
      vi.restoreAllMocks()
      expect(board.state.counters).toHaveLength(2)
    })

    it('does not start the tour', () => {
      tutorial.start({ patternId: 'p1', name: 'Rondo' })
      vi.restoreAllMocks()
      expect(tutorial.active.value).toBe(false)
    })

    it('does not park the drill', () => {
      tutorial.start({ patternId: 'p1', name: 'Rondo' })
      vi.restoreAllMocks()
      expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
    })

    it('leaves the undo stack alone', () => {
      aDrill()
      tutorial.start({ patternId: 'p1', name: 'Rondo' })
      vi.restoreAllMocks()
      expect(board.canUndo.value).toBe(true)
    })
  })
})

describe('ending', () => {
  it('puts the drill back', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    tutorial.end()
    expect(board.state.counters).toHaveLength(2)
  })

  it('hands back which drill it was', () => {
    aDrill()
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    expect(tutorial.end()).toEqual({ patternId: 'p1', name: 'Rondo' })
  })

  it('closes the tour', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.end()
    expect(tutorial.active.value).toBe(false)
    expect(tutorial.step.value).toBeNull()
  })

  it('records that the coach has seen it', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.end()
    expect(tutorial.hasSeen()).toBe(true)
  })

  it('clears the park, so the next startup does not think a tour was cut short', () => {
    tutorial.start({ patternId: 'p1', name: 'Rondo' })
    tutorial.end()
    expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
  })

  it('leaves nothing to undo from the restored drill', () => {
    aDrill()
    tutorial.start({ patternId: null, name: '' })
    board.addCounter('red')
    tutorial.end()
    expect(board.canUndo.value).toBe(false)
  })
})

describe('what the coach has seen', () => {
  it('is false on a first visit', () => {
    expect(tutorial.hasSeen()).toBe(false)
  })

  it('survives a malformed value rather than throwing', () => {
    localStorage.setItem(TUTORIAL_KEY, 'not json')
    expect(tutorial.hasSeen()).toBe(false)
  })
})

describe('taking the park', () => {
  it('returns nothing when no tour was interrupted', () => {
    expect(tutorial.takePark()).toBeNull()
  })

  it('returns the parked drill and clears it', () => {
    localStorage.setItem(TUTORIAL_PARK_KEY, JSON.stringify({ patternId: 'p1', name: 'Rondo' }))
    expect(tutorial.takePark()).toEqual({ patternId: 'p1', name: 'Rondo' })
    expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
  })

  it('treats a malformed park as absent, and clears it', () => {
    localStorage.setItem(TUTORIAL_PARK_KEY, '{{')
    expect(tutorial.takePark()).toBeNull()
    expect(localStorage.getItem(TUTORIAL_PARK_KEY)).toBeNull()
  })
})

describe('moving through the steps', () => {
  it('advances when the coach does the thing', async () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.next() // onto `place`
    board.addCounter('red')
    board.addCounter('red')
    board.addCounter('blue')
    await nextTick()
    expect(tutorial.step.value!.id).toBe('label')
  })

  it('advances straight past a step that is already satisfied', async () => {
    board.addCounter('red')
    tutorial.start({ patternId: null, name: '' })
    // The tour emptied the board, so put three back and step onto `place`.
    board.addCounter('red')
    board.addCounter('red')
    board.addCounter('blue')
    await nextTick()
    tutorial.next()
    await nextTick()
    expect(tutorial.step.value!.id).toBe('label')
  })

  it('goes back without touching the board', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.next()
    board.addCounter('red')
    tutorial.back()
    expect(tutorial.step.value!.id).toBe('welcome')
    expect(board.state.counters).toHaveLength(1)
  })

  it('does not go back past the first step', () => {
    tutorial.start({ patternId: null, name: '' })
    tutorial.back()
    expect(tutorial.stepIndex.value).toBe(0)
  })

  it('does not run off the end', () => {
    tutorial.start({ patternId: null, name: '' })
    for (let i = 0; i < 20; i++) tutorial.next()
    expect(tutorial.step.value!.id).toBe('more')
  })

  it('ignores next and back while no tour is running', () => {
    tutorial.next()
    expect(tutorial.active.value).toBe(false)
    expect(tutorial.stepIndex.value).toBe(0)
  })
})

describe('the draft the tour writes', () => {
  it("is the coach's board, not the empty one the tour runs on", () => {
    aDrill()
    tutorial.start({ patternId: null, name: '' })
    board.addCounter('red')
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).frames[0].counters).toHaveLength(2)
  })
})
