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

/**
 * The furthest step the coach has reached, which is how the tour tells a
 * Back from a first arrival.
 *
 * Held rather than derived, because nothing else records it: `stepIndex`
 * alone cannot tell "on this step for the first time" from "on it having
 * stepped back off a later one", and those two want opposite behaviour from
 * the goals.
 */
const furthest = ref(0)

/** On a step the coach has already been past. */
const reviewing = computed(() => stepIndex.value < furthest.value)

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

/** Whether the park landed. See `start` for why the caller has to care. */
function writePark(park: TutorialPark): boolean {
  try {
    localStorage.setItem(TUTORIAL_PARK_KEY, JSON.stringify(park))
    return true
  } catch {
    return false
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
 * Both writes are checked, not just fired, and the board is not touched
 * until both have landed. Neither one throws: `saveDraft` swallows a quota
 * failure and leaves `lastError` as the only sign of it, and the park write
 * swallows its own. Between them they are everything needed to put the board
 * back, so dismantling it before they are both stored risks the two halves
 * of the same promise — the drill itself, which this app keeps no other copy
 * of, and which saved drill it was, without which it comes back nameless and
 * unfiled and the coach has to go looking for it in the library. A failed
 * draft is already on screen, since App renders `storage.lastError` as a
 * dismissible banner; a failed park is not, and shows only as a Take the
 * tour that declines to start.
 *
 * `resetBoard` keeps the pitch type and rotation, so a tour taken on a phone
 * runs on the pitch the coach was already looking at.
 *
 * Returns whether it actually started, so a caller that infers "did nothing"
 * from `active` — which reads `true` for a tour already running as readily
 * as for one this call just opened — cannot mistake the one for the other.
 * `App`'s `startTour` used to make exactly that mistake: reachable through
 * the `more` step's own Help button, which lets a coach reach "Take the
 * tour" a second time while the first tour is still up.
 */
function start(park: TutorialPark): boolean {
  if (active.value) return false
  // The tour needs a board it can safely empty; `isDerived` covers playback,
  // scrubbing and a GIF export mid-sample — none of which `resetBoard` can
  // meaningfully act on. `App`'s `startTour` already checks this before
  // calling in, but the invariant belongs beside the code that depends on
  // it, not only in one caller of it.
  if (board.isDerived.value) return false
  storage.saveDraft(board.snapshot())
  if (storage.lastError.value) return false
  if (!writePark(park)) return false
  board.resetBoard()
  board.clearHistory()
  stepIndex.value = 0
  furthest.value = 0
  active.value = true
  return true
}

/**
 * Close the tour and hand back the drill it parked.
 *
 * Restoring is `restoreSnapshot`, not `loadSnapshot`: putting the drill back
 * is not something the coach did, so it must not be undoable — and the
 * history goes with it, or Ctrl+Z would walk from the restored drill into a
 * half-finished tour board.
 *
 * A missing draft — a second tab's own autosave landing on the shared draft
 * key while this one parked it, or storage cleared mid-tour — leaves the
 * empty tour board on screen with nothing restored onto it. Handing back the
 * parked patternId regardless would tell App that empty board IS the coach's
 * saved drill, and the next edit would autosave it over that drill under its
 * own id. So the id only comes back when the drill it names actually did;
 * the name is kept either way, since it costs nothing to show on an empty
 * board and the id is what does the damage.
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
  furthest.value = 0
  return draft ? park : { patternId: null, name: park.name }
}

function next(): void {
  if (!active.value) return
  if (stepIndex.value >= STEPS.length - 1) return
  stepIndex.value += 1
  furthest.value = Math.max(furthest.value, stepIndex.value)
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
 *
 * Not while the coach is looking back, though. Every step behind them is one
 * they have already satisfied, so a watcher left running there would undo
 * their Back in the same tick it happened and the button would look broken.
 * The goals pick up again the moment they walk forward to where they got to.
 */
watch(
  [() => board.state, () => board.playback, step],
  () => {
    if (reviewing.value) return
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
    reviewing,
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
  furthest.value = 0
}
