import { computed, ref, watch } from 'vue'
import { useBoard } from './useBoard'
import { useStorage } from './useStorage'
import { STEPS, type TutorialStep } from '../tutorial/steps'

/** Whether the coach has been through the tour. A flag, not a resume point. */
export const TUTORIAL_KEY = 'fct.tutorial.v1'
/** Which saved drill the board was showing when the tour started. */
export const TUTORIAL_PARK_KEY = 'fct.tutorial-park.v1'

export type TutorialPark = { patternId: string | null; name: string }

const board = useBoard()
const storage = useStorage()

const active = ref(false)
const stepIndex = ref(0)
const step = computed<TutorialStep | null>(() =>
  active.value ? (STEPS[stepIndex.value] ?? null) : null,
)

/*
 * Every read is guarded and every write is swallowed. A coach in a private
 * window, or with a full store, gets a tour that works and forgets it
 * afterwards — which is a great deal better than an app that will not open.
 */
function hasSeen(): boolean {
  try {
    const text = localStorage.getItem(TUTORIAL_KEY)
    if (text === null) return false
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && (value as { seen?: unknown }).seen === true
  } catch {
    return false
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ seen: true }))
  } catch {
    // Nothing to do about it, and nothing worth stopping the tour for.
  }
}

function clearPark(): void {
  try {
    localStorage.removeItem(TUTORIAL_PARK_KEY)
  } catch {
    // As above.
  }
}

function readPark(): TutorialPark | null {
  try {
    const text = localStorage.getItem(TUTORIAL_PARK_KEY)
    if (text === null) return null
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return null
    const park = value as { patternId?: unknown; name?: unknown }
    const patternId = typeof park.patternId === 'string' ? park.patternId : null
    const name = typeof park.name === 'string' ? park.name : ''
    return { patternId, name }
  } catch {
    return null
  }
}

/**
 * Read the park left behind by an interrupted tour, and clear it.
 *
 * A refresh mid-tour restores the coach's drill through the draft, which is
 * the ordinary startup path; this is only how the drill's identity gets back
 * to the header. A park that will not parse is still cleared, or it would
 * be read and rejected on every startup from now on.
 */
function takePark(): TutorialPark | null {
  const park = readPark()
  clearPark()
  return park
}

function writePark(park: TutorialPark): void {
  try {
    localStorage.setItem(TUTORIAL_PARK_KEY, JSON.stringify(park))
  } catch {
    // The tour still runs; the drill's name just will not survive a refresh.
  }
}

/**
 * Park the coach's drill and open the tour on an empty board.
 *
 * The board is parked in the draft, which is where the working board already
 * lives — so this needs no snapshot store of its own, and a refresh mid-tour
 * restores the drill through the startup path that exists. The draft write
 * is direct rather than through App's debounce, because the board is about
 * to be emptied and there is no second chance.
 *
 * Reusing the one shared draft key rather than a key of its own means a
 * second tab open on the same drill can still autosave its own draft into it
 * while this tab's tour runs, overwriting the parked one underneath. Nothing
 * here can see that tab or stop it — a single shared key has exactly one
 * writer's worth of safety, and the tour spends it. Accepted, not fixed: a
 * coach running the tour in two tabs on the same drill at once is not a case
 * worth a second key over.
 *
 * The save is checked, not just fired: `saveDraft` swallows a quota failure
 * rather than throwing, so `lastError` is the only sign one happened. A
 * coach's drill that never reached storage must not then be erased from
 * memory too — this app keeps no other copy of it — so a failed save aborts
 * the whole start before either the park key or the board is touched. The
 * error is already on screen: App renders `storage.lastError` as a
 * dismissible banner.
 *
 * `resetBoard` keeps the pitch type and rotation, so a tour taken on a phone
 * runs on the pitch the coach was already looking at.
 */
function start(park: TutorialPark): void {
  if (active.value) return
  storage.saveDraft(board.snapshot())
  if (storage.lastError.value) return
  writePark(park)
  board.resetBoard()
  board.clearHistory()
  stepIndex.value = 0
  active.value = true
}

/**
 * Close the tour and hand back the drill it parked.
 *
 * Restoring is `restoreSnapshot`, not `loadSnapshot`: putting the drill back
 * is not something the coach did, so it must not be undoable — and the
 * history goes with it, or Ctrl+Z would walk from the restored drill into a
 * half-finished tour board.
 */
function end(): TutorialPark {
  const park = readPark() ?? { patternId: null, name: '' }
  const draft = storage.loadDraft()
  if (draft) board.restoreSnapshot(draft)
  board.clearHistory()
  clearPark()
  markSeen()
  active.value = false
  stepIndex.value = 0
  return park
}

function next(): void {
  if (!active.value) return
  if (stepIndex.value >= STEPS.length - 1) return
  stepIndex.value += 1
}

function back(): void {
  if (!active.value) return
  stepIndex.value = Math.max(0, stepIndex.value - 1)
}

/*
 * A step completes when its goal reads true, whether the coach reached it by
 * doing the thing now or had already done it before arriving. `playback` is
 * watched beside `state` because it is a separate reactive object, and the
 * one thing the play goal reads.
 */
watch(
  [() => board.state, () => board.playback, step],
  () => {
    const current = step.value
    if (!current?.goal) return
    if (current.goal(board)) next()
  },
  { deep: true },
)

export function useTutorial() {
  return {
    active,
    stepIndex,
    step,
    steps: STEPS,
    start,
    end,
    next,
    back,
    hasSeen,
    takePark,
  }
}

/** Test-only: put the singleton back to its just-loaded condition. */
export function __resetTutorialForTests(): void {
  active.value = false
  stepIndex.value = 0
}
