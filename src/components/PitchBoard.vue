<script lang="ts">
/**
 * How close together two presses on the same counter must be to count as a
 * double press. Roughly a platform double-click interval.
 */
export const DOUBLE_PRESS_MS = 400

/**
 * How near the first press a second one must land to read as a double press,
 * in pitch units. A press further away than this is a fresh grab, not the
 * second half of a gesture.
 */
export const DOUBLE_PRESS_RADIUS = 3

/**
 * Pointer travel past which a press counts as a drag rather than a tap, in
 * pitch units. Small enough that a deliberate nudge registers, large enough
 * to absorb the wobble of a finger holding still.
 */
export const TAP_TOLERANCE = 0.5

/**
 * How long a drag may sit with no pointer events before a new press is
 * allowed to take it over, when the browser cannot say whether the pointer
 * still holds capture. Only a fallback: `hasPointerCapture` answers instantly
 * everywhere that implements it.
 */
export const STALE_DRAG_MS = 10_000
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ArrowDrawing, SegmentDrawing, SelectionRef, ToolMode, Vec } from '../types'
import { bendFor, clampToPitch, clientToPitch, distance } from '../geometry'
import { useBoard } from '../composables/useBoard'
import { setPlacementDropTarget, type PlacementKind } from '../composables/usePlacement'
import BoardView from './BoardView.vue'
import BendHandle from './BendHandle.vue'
import EndHandle from './EndHandle.vue'

const props = defineProps<{ tool: ToolMode; drawColor: string }>()
const emit = defineEmits<{
  rename: [id: string]
  addLabel: [at: Vec]
  editLabel: [id: string]
  /**
   * How many things the coach is holding. The toolbar needs this to offer
   * Copy and Delete buttons, which are the only way to reach either on a
   * tablet — there is no Cmd key and no Delete key under a finger.
   */
  selectionSize: [count: number]
  /**
   * What is held, not merely how much of it. The inspector shows the thing
   * itself — its colour, its label — so a count is no longer enough.
   */
  selectionChanged: [held: SelectionRef[]]
}>()

const board = useBoard()
const boardView = ref<InstanceType<typeof BoardView> | null>(null)

/**
 * The svg belongs to BoardView now. Everything here that needs it — pointer
 * capture, and turning a client point into a pitch point — reads it through
 * the child, and so does the PNG export, which App reaches by way of the
 * `svgEl` this still exposes.
 */
const svgEl = computed<SVGSVGElement | null>(() => boardView.value?.svgEl ?? null)

defineExpose({ svgEl, deleteSelected, duplicateSelected, clearSelection })

/**
 * Where a thing dragged out of the palette lands.
 *
 * The palette knows what is being dragged; only the pitch can say where on
 * the grass a point on the screen is, so the pitch is what receives the
 * drop. A release anywhere else places nothing — a player dropped on the
 * toolbar is a player the coach did not mean to add.
 */
function dropFromPalette(what: PlacementKind, clientX: number, clientY: number): boolean {
  const svg = svgEl.value
  if (!svg || board.isDerived.value) return false

  const rect = svg.getBoundingClientRect()
  const missed =
    clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom
  if (missed) return false

  const at = clientToPitch(rect, clientX, clientY, board.state.pitch)
  if (what.kind === 'player') board.addCounter(what.color, at)
  else if (what.kind === 'ball') board.addBall(at)
  else if (what.kind === 'cone') board.addMarker(at)
  // A label with no text is nothing to look at, so the app asks for it and
  // places the label itself — the same way a press on the pitch with the
  // Text tool already does.
  else emit('addLabel', at)
  return true
}

onMounted(() => setPlacementDropTarget(dropFromPalette))
onBeforeUnmount(() => setPlacementDropTarget(null))

type DragTarget =
  | { kind: 'counter'; id: string }
  | { kind: 'marker'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'ball'; id: string }
  | { kind: 'pen'; id: string }
  | { kind: 'segment'; id: string }
  | { kind: 'bend'; id: string }
  | { kind: 'end'; id: string; end: 'from' | 'to' }
  | { kind: 'body'; id: string }
  | { kind: 'group' }
  | { kind: 'marquee'; to: Vec }

/**
 * There is one drag at a time, and it belongs to one pointer.
 *
 * Without the pointerId, a second pointer going down mid-drag (a resting
 * palm beside a stylus, a second finger) overwrites this value, leaks the
 * first pointer's capture and misattributes its moves to the new target.
 */
type Drag = DragTarget & {
  pointerId: number
  /** Where the press landed, so travel can be measured against it. */
  origin: Vec
  /**
   * From the press to the centre of the thing grabbed. Added back on every
   * move so a press picks an object up where it is rather than snapping it
   * under the pointer — which meant a plain click nudged whatever it hit.
   */
  grabOffset: Vec
  /** True once the pointer has travelled far enough to mean a drag, not a tap. */
  moved: boolean
  startedAt: number
}

const drag = ref<Drag | null>(null)

/** The last press on a counter that ended without moving, for detecting a double press. */
let lastCounterPress: { id: string; at: number; pos: Vec } | null = null
let lastLabelPress: { id: string; at: number; pos: Vec } | null = null

/**
 * A gesture that finishes on release rather than on the press: placing a
 * label, or the second half of a double press to rename.
 *
 * The pointer id belongs to the gesture so a second finger's release cannot
 * finish someone else's, and the origin is recorded so travel is measured
 * from where the press actually landed rather than from the target's
 * centre — a counter's hit target is nearly twice its drawn radius, so a
 * press lands off centre routinely.
 */
type PendingTap =
  | { kind: 'rename'; id: string; pointerId: number; origin: Vec }
  | { kind: 'label'; pointerId: number; origin: Vec }

let pendingTap: PendingTap | null = null

/**
 * True while a pending tap's own pointer is still down. A gesture belongs
 * to the pointer that started it until that pointer releases, so another
 * press must not quietly take its place — doing so lost the first gesture
 * and leaked its capture.
 */
function pendingTapIsLive(): boolean {
  if (!pendingTap) return false
  const svg = svgEl.value
  if (!svg || typeof svg.hasPointerCapture !== 'function') return true
  try {
    if (svg.hasPointerCapture(pendingTap.pointerId)) return true
  } catch {
    // Treat an unanswerable capture question as a pointer that is gone.
  }
  releaseCapture(pendingTap.pointerId)
  pendingTap = null
  return false
}

/** True for a pointermove/up belonging to some pointer other than the dragging one. */
function isOtherPointer(event: PointerEvent): boolean {
  return drag.value !== null && drag.value.pointerId !== event.pointerId
}

/** Give up capture of one pointer, tolerating a pointer that is already gone. */
function releaseCapture(pointerId: number): void {
  try {
    svgEl.value?.releasePointerCapture(pointerId)
  } catch {
    // The pointer is already gone; there was nothing left to release.
  }
}

function clearDrag(): void {
  const active = drag.value
  drag.value = null
  if (active) releaseCapture(active.pointerId)
}

/**
 * True when a drag is still owned by a pointer that exists.
 *
 * A pointerup can go missing — a browser quirk, a pointercancel that never
 * arrives, a pointer leaving under a system gesture. Refusing every new press
 * while `drag` is set would then brick the board for the rest of the session,
 * so a drag whose pointer no longer holds capture is abandoned and the new
 * press takes over. That is the self-healing the old code got for free by
 * overwriting `drag` blindly, kept without the misattribution that caused.
 */
function dragIsLive(): boolean {
  const active = drag.value
  if (!active) return false

  const svg = svgEl.value
  let stale: boolean
  if (svg && typeof svg.hasPointerCapture === 'function') {
    try {
      stale = !svg.hasPointerCapture(active.pointerId)
    } catch {
      stale = true
    }
  } else {
    stale = Date.now() - active.startedAt > STALE_DRAG_MS
  }

  if (!stale) return true
  clearDrag()
  return false
}

/** Record travel away from the press point, once, for the whole drag. */
/** Where the grabbed object's centre belongs for a pointer now at `at`. */
function withGrabOffset(active: Drag, at: Vec): Vec {
  return { x: at.x + active.grabOffset.x, y: at.y + active.grabOffset.y }
}

function noteTravel(active: Drag, at: Vec): void {
  if (active.moved) return
  if (Math.hypot(at.x - active.origin.x, at.y - active.origin.y) > TAP_TOLERANCE) {
    active.moved = true
  }
}

/*
 * Rendering reads `board.view`; editing reads and writes `board.state`.
 *
 * Parked on a frame the two are the same arrays, so nothing changes. Between
 * two frames the view is a blend and the state is the moment the coach was
 * last on — which is exactly what hit-testing should still be about, except
 * that presses are refused while the view is a blend anyway.
 */
const view = computed(() => board.view.value)

function toPitch(event: PointerEvent) {
  const rect = svgEl.value!.getBoundingClientRect()
  return clientToPitch(rect, event.clientX, event.clientY, board.state.pitch)
}

function capture(event: PointerEvent) {
  try {
    svgEl.value?.setPointerCapture(event.pointerId)
  } catch {
    // Capture is a nicety — it keeps events coming when the pointer leaves the
    // svg. A browser that refuses must not cost the coach the drag itself.
  }
}

function onCounterGrab(id: string, event: PointerEvent) {
  if (board.isDerived.value) return
  const counter = board.counterById(id)
  if (!counter) return
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.deleteCounter(id)
    return
  }
  if (props.tool !== 'select') return
  if (dragIsLive()) return // another pointer is mid-drag; ignore this one
  event.stopPropagation()

  /*
   * A player in a gathered group carries the whole group. That takes
   * precedence over the double-press rename below: a coach who has just
   * boxed a shape is moving it, and renaming one of its players is a press
   * on bare grass away.
   */
  if (grabsGroup('counter', id, event)) return

  /*
   * Rename is detected here rather than from a `dblclick` handler on the
   * counter. `setPointerCapture` below retargets the compatibility mouse
   * events at the capturing <svg>, so `click` and `dblclick` never reach the
   * counter in a real browser and a handler there can never fire. Counting
   * presses ourselves survives capture and matches double-tap on a tablet.
   */
  const now = Date.now()
  const at = toPitch(event)
  const isSecondPress =
    lastCounterPress !== null &&
    lastCounterPress.id === id &&
    now - lastCounterPress.at <= DOUBLE_PRESS_MS &&
    Math.hypot(at.x - lastCounterPress.pos.x, at.y - lastCounterPress.pos.y) <= DOUBLE_PRESS_RADIUS
  lastCounterPress = isSecondPress ? null : { id, at: now, pos: at }

  if (isSecondPress) {
    /*
     * Held until the release. Opening the dialog on the press means the
     * pointerup that follows lands on the <svg> and pulls focus straight
     * back out of the field, so the coach double-presses, types, and
     * nothing lands. A drag before the release cancels it.
     */
    if (pendingTapIsLive()) return
    capture(event)
    pendingTap = { kind: 'rename', id, pointerId: event.pointerId, origin: at }
    return
  }

  capture(event)
  board.commit() // one entry for the whole drag
  drag.value = {
    kind: 'counter',
    id,
    pointerId: event.pointerId,
    origin: at,
    grabOffset: { x: counter.pos.x - at.x, y: counter.pos.y - at.y },
    moved: false,
    startedAt: now,
  }
}

/**
 * The ball is deliberately NOT moved here. It is drawn at BALL_OFFSET from
 * its holder, so a press anywhere on it is off the holder's centre and may be
 * nearer a neighbour's; snapping it to the finger and re-resolving possession
 * on release would hand a tapped ball to the wrong player. A tap that never
 * travels is not a re-placement at all, so it leaves possession untouched —
 * the ball only moves once the pointer does.
 */
function onLabelGrab(id: string, event: PointerEvent) {
  if (board.isDerived.value) return
  const label = board.labelById(id)
  if (!label) return
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.deleteLabel(id)
    return
  }
  /*
   * The text tool adjusts labels as well as placing them. Placing one leaves
   * that tool selected, so the next thing a coach does is usually nudge the
   * label they just made; making them switch to Move for that makes the
   * label feel stuck to the pitch.
   */
  if ((props.tool !== 'select' && props.tool !== 'text') || dragIsLive()) return

  // Stop the board treating this as a tap on empty grass and queueing a
  // second label on top of the one being dragged.
  event.stopPropagation()

  if (props.tool === 'select' && grabsGroup('label', id, event)) return

  // Same double-press detection as a counter, and for the same reason:
  // pointer capture stops dblclick ever reaching this element.
  const now = Date.now()
  const at = toPitch(event)
  const isSecondPress =
    lastLabelPress !== null &&
    lastLabelPress.id === id &&
    now - lastLabelPress.at <= DOUBLE_PRESS_MS &&
    Math.hypot(at.x - lastLabelPress.pos.x, at.y - lastLabelPress.pos.y) <= DOUBLE_PRESS_RADIUS
  lastLabelPress = isSecondPress ? null : { id, at: now, pos: at }

  if (isSecondPress) {
    emit('editLabel', id)
    return
  }

  capture(event)
  board.commit() // one entry for the whole drag
  drag.value = {
    kind: 'label',
    id,
    pointerId: event.pointerId,
    origin: at,
    grabOffset: { x: label.pos.x - at.x, y: label.pos.y - at.y },
    moved: false,
    startedAt: now,
  }
}

function onMarkerGrab(id: string, event: PointerEvent) {
  if (board.isDerived.value) return
  const marker = board.markerById(id)
  if (!marker) return
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.deleteMarker(id)
    return
  }
  /*
   * The cone tool moves cones as well as placing them. Placing one leaves
   * that tool selected, so the next thing a coach does is usually nudge the
   * cone they just put down; without this it dropped a second cone on top.
   */
  if ((props.tool !== 'select' && props.tool !== 'cone') || dragIsLive()) return
  event.stopPropagation()
  if (props.tool === 'select' && grabsGroup('marker', id, event)) return
  capture(event)
  board.commit() // one entry for the whole drag
  const at = toPitch(event)
  drag.value = {
    kind: 'marker',
    id,
    pointerId: event.pointerId,
    origin: at,
    grabOffset: { x: marker.pos.x - at.x, y: marker.pos.y - at.y },
    moved: false,
    startedAt: Date.now(),
  }
}

function onBallGrab(id: string, event: PointerEvent) {
  if (board.isDerived.value) return
  if (props.tool === 'erase') {
    event.stopPropagation()
    board.removeBall(id)
    return
  }
  if (props.tool !== 'select') return
  if (dragIsLive()) return
  event.stopPropagation()

  // A ball in a gathered group carries the whole group, like every other
  // member. Only a free ball can be in one, so there is no carried ball to
  // drag a player around by.
  if (grabsGroup('ball', id, event)) return

  capture(event)
  board.commit()
  drag.value = {
    kind: 'ball',
    id,
    pointerId: event.pointerId,
    origin: toPitch(event),
    // No offset: the ball is drawn away from its holder's centre, so
    // carrying the grab offset would fight the possession maths on drop.
    grabOffset: { x: 0, y: 0 },
    moved: false,
    startedAt: Date.now(),
  }
}

/**
 * A press on a drawing. Under Erase it rubs it out; under Move it chooses
 * that drawing and begins a drag of the whole thing.
 *
 * The press is swallowed so it cannot also reach the board underneath, where
 * `onPointerDown` would read it as a press on bare grass and immediately let
 * go of what was just chosen.
 */
function onDrawingHit(id: string, event: PointerEvent) {
  if (board.isDerived.value) return
  if (props.tool === 'erase') {
    board.deleteDrawing(id)
    return
  }
  if (props.tool !== 'select') return
  if (dragIsLive()) return
  event.stopPropagation()

  // A member of a gathered group carries the whole group with it.
  if (hasGroup.value && isSelected('drawing', id)) {
    startGroupDrag(event)
    return
  }

  selection.value = [{ kind: 'drawing', id }]
  capture(event)
  drag.value = {
    kind: 'body',
    id,
    pointerId: event.pointerId,
    origin: toPitch(event),
    // The drawing is slid by how far the pointer travels, not carried at a
    // fixed offset, so there is nothing to hold here.
    grabOffset: { x: 0, y: 0 },
    moved: false,
    startedAt: Date.now(),
  }
}

/**
 * Where the pointer was on the previous move of a body drag.
 *
 * The drawing is slid by the step between moves rather than from the press
 * point, so that a drawing stopped against a touchline keeps sliding along
 * it instead of springing back once the pointer comes away from the edge.
 */
let bodyDragFrom: Vec | null = null

/**
 * True once a body drag has committed. Choosing a drawing must not touch the
 * history — a coach pressing five arrows to look at them would otherwise
 * bury their real work under five entries that changed nothing — so unlike
 * every other grab on this board, the commit waits for the first movement.
 */
let bodyDragCommitted = false

function dragBody(active: Drag & { kind: 'body' }, at: Vec): void {
  if (!active.moved) return
  if (!bodyDragCommitted) {
    board.commit()
    bodyDragCommitted = true
  }
  const previous = bodyDragFrom ?? active.origin
  board.translateDrawing(active.id, { x: at.x - previous.x, y: at.y - previous.y })
  bodyDragFrom = at
}

/**
 * Begin sliding a gathered group. Shares the body drag's bookkeeping — the
 * step-by-step delta and the commit that waits for real movement — because
 * it is the same gesture with more things on the end of it.
 */
function startGroupDrag(event: PointerEvent): void {
  capture(event)
  drag.value = {
    kind: 'group',
    pointerId: event.pointerId,
    origin: toPitch(event),
    grabOffset: { x: 0, y: 0 },
    moved: false,
    startedAt: Date.now(),
  }
}

/**
 * True when a press on this token should carry the group. A token outside
 * the group is dragged on its own, and picking it up puts the group down —
 * the coach has plainly moved on to something else.
 */
function grabsGroup(kind: SelectionRef['kind'], id: string, event: PointerEvent): boolean {
  if (hasGroup.value && isSelected(kind, id)) {
    startGroupDrag(event)
    return true
  }
  selection.value = []
  return false
}

/** Slide every member of the group, on the same terms as a single body. */
function dragGroup(active: Drag & { kind: 'group' }, at: Vec): void {
  if (!active.moved) return
  if (!bodyDragCommitted) {
    board.commit()
    bodyDragCommitted = true
  }
  const previous = bodyDragFrom ?? active.origin
  board.translateGroup(selection.value, { x: at.x - previous.x, y: at.y - previous.y })
  bodyDragFrom = at
}

/** Put down whatever is being held. */
function clearSelection(): void {
  selection.value = []
}

/**
 * How far a copy lands from what it was copied from, in pitch units. Enough
 * to read as a separate shape at a glance, little enough that it is plainly
 * the same shape rather than something new.
 */
const DUPLICATE_OFFSET: Vec = { x: 4, y: 4 }

/**
 * Copy everything being held, and hold the copy instead. The next thing
 * anyone does after duplicating a shape is drag it where they want it.
 */
function duplicateSelected(): void {
  if (selection.value.length === 0) return
  selection.value = board.duplicateGroup(selection.value, DUPLICATE_OFFSET)
}

/** Rub out everything being held, in one undo entry. */
function deleteSelected(): void {
  if (selection.value.length === 0) return
  const refs = selection.value
  selection.value = []
  board.deleteGroup(refs)
}

/** The box as a rectangle, whichever corner the coach started from. */
const marqueeRect = computed(() => {
  const active = drag.value
  if (!active || active.kind !== 'marquee' || !active.moved) return null
  return {
    x: Math.min(active.origin.x, active.to.x),
    y: Math.min(active.origin.y, active.to.y),
    width: Math.abs(active.to.x - active.origin.x),
    height: Math.abs(active.to.y - active.origin.y),
  }
})

function isInside(box: { x: number; y: number; width: number; height: number }, p: Vec): boolean {
  return (
    p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height
  )
}

/**
 * Gather everything the box covers.
 *
 * A drawing joins if any of the points it is made of falls inside — one end
 * of an arrow is enough. That is a stricter rule than testing its bounding
 * box, and a more predictable one: an arrow whose bounding box overlaps the
 * corner of the selection but which passes nowhere near it is left alone,
 * which is what a coach boxing a shape means.
 */
function gatherInto(box: { x: number; y: number; width: number; height: number }): void {
  const found: SelectionRef[] = []
  for (const counter of board.state.counters) {
    if (isInside(box, counter.pos)) found.push({ kind: 'counter', id: counter.id })
  }
  for (const marker of board.state.markers) {
    if (isInside(box, marker.pos)) found.push({ kind: 'marker', id: marker.id })
  }
  if (board.state.labelsVisible) {
    for (const label of board.state.labels) {
      if (isInside(box, label.pos)) found.push({ kind: 'label', id: label.id })
    }
  }
  /*
   * Only a FREE ball joins a box. A carried one is not a group member in its
   * own right — it follows its carrier, automatically, because it is drawn
   * relative to them. That sidesteps deciding what possession means during a
   * group move, and it matches the pitch: you cannot lasso a ball out of
   * someone's feet. Hidden balls are not gathered either, for the same reason
   * hidden labels are not: a coach cannot box what they cannot see.
   */
  if (board.state.ballsVisible) {
    for (const ball of board.state.balls) {
      if (ball.attachedTo === null && isInside(box, ball.pos)) {
        found.push({ kind: 'ball', id: ball.id })
      }
    }
  }
  for (const drawing of board.state.drawings) {
    const points = drawing.kind === 'pen' ? drawing.points : [drawing.from, drawing.to]
    if (points.some((p) => isInside(box, p))) found.push({ kind: 'drawing', id: drawing.id })
  }
  selection.value = found
}

/**
 * What the coach has hold of under Move: nothing, one thing, or a group
 * gathered with a box.
 *
 * Never board state. Picking things up changes nothing about the drill, so
 * it has no business in undo, in the autosaved draft, or in a saved pattern.
 */
const selection = ref<SelectionRef[]>([])

/**
 * The segment drawn most recently under a drawing tool, so it can be adjusted
 * without a trip through Move first. Separate from the selection because it
 * is a different idea in a different mode — the coach has not chosen it, they
 * have only just finished drawing it.
 */
const liveDrawingId = ref<string | null>(null)

function isSelected(kind: SelectionRef['kind'], id: string): boolean {
  return selection.value.some((ref) => ref.kind === kind && ref.id === id)
}

/** True when a drag on any member should carry the whole group with it. */
const hasGroup = computed(() => selection.value.length > 1)

watch(
  () => selection.value.length,
  (count) => emit('selectionSize', count),
  { immediate: true },
)

watch(
  selection,
  (held) => emit('selectionChanged', held.map((ref) => ({ ...ref }))),
  { immediate: true, deep: true },
)

// Playing is for watching. Handles and halos belong to editing, and a
// selection surviving into playback would put them over the animation.
watch(
  () => board.playback.playing,
  (playing) => {
    if (playing) clearSelection()
  },
)

/** The tools that draw a segment, and so keep one live afterwards. */
function isSegmentTool(tool: ToolMode): boolean {
  return tool === 'arrow-run' || tool === 'arrow-pass' || tool === 'line'
}

/** Arrows are the only drawings that bend; a line marks out ground. */
function isArrowTool(tool: ToolMode): boolean {
  return tool === 'arrow-run' || tool === 'arrow-pass'
}

/** Changing tool puts everything down; nothing carries across. */
watch(
  () => props.tool,
  () => {
    selection.value = []
    liveDrawingId.value = null
  },
)

/**
 * The one drawing the handles belong to, if there is one.
 *
 * Under Move that means a selection of exactly one drawing: a group has no
 * single bend to offer, and five arrows cannot share an end. Under a drawing
 * tool it is the segment just drawn.
 */
const activeDrawingId = computed<string | null>(() => {
  if (props.tool === 'select') {
    const [only] = selection.value
    return selection.value.length === 1 && only.kind === 'drawing' ? only.id : null
  }
  return liveDrawingId.value
})

/** The drawing the handles belong to, or undefined once it is gone. */
const activeDrawing = computed(() =>
  board.state.drawings.find((d) => d.id === activeDrawingId.value),
)

/**
 * The bend handle, when the drawing being worked on is an arrow.
 *
 * Looked up in the drawings rather than remembered as an object, so an arrow
 * that is undone, erased, or discarded as a stray tap takes its handle with
 * it without anyone having to remember to clear it.
 */
const bendHandles = computed<ArrowDrawing[]>(() => {
  const drawing = activeDrawing.value
  if (!drawing || drawing.kind !== 'arrow') return []
  if (props.tool !== 'select' && !isArrowTool(props.tool)) return []
  return [drawing]
})

/**
 * The two end handles, when the drawing being worked on is a segment.
 *
 * Lines are in as well as arrows. A line cannot bend, but it is drawn to the
 * wrong spot exactly as often, and leaving it out would be a gap with no
 * reason behind it. A pen stroke has no two ends to speak of, so it gets
 * neither handle — it can still be chosen, dragged and deleted.
 */
const endHandles = computed<SegmentDrawing[]>(() => {
  const drawing = activeDrawing.value
  if (!drawing || drawing.kind === 'pen') return []
  if (props.tool !== 'select' && !isSegmentTool(props.tool)) return []
  return [drawing]
})

/** Every drawing to draw a halo behind. Only under Move, where picking up happens. */
const selectedDrawingIds = computed(() =>
  props.tool === 'select'
    ? selection.value.filter((ref) => ref.kind === 'drawing').map((ref) => ref.id)
    : [],
)

/**
 * How wide a ring to draw round each kind of token, in pitch units. Each is
 * a little more than the thing it surrounds, so the ring reads as a halo
 * rather than as part of the piece.
 */
const RING_RADIUS: Record<'counter' | 'marker' | 'label' | 'ball', number> = {
  counter: 3.2,
  marker: 2.6,
  label: 2.6,
  ball: 2.2,
}

/** Where to draw a ring, for every selected thing that is not a drawing. */
const selectedTokens = computed(() => {
  if (props.tool !== 'select') return []
  return selection.value.flatMap((ref) => {
    if (ref.kind === 'drawing') return []
    /*
     * A ball that is not on screen gets no halo. A selection outlives the
     * Ball toggle and a phase change, so a ball can be selected and then
     * hidden, or become carried — and a carried ball is drawn at its
     * carrier's feet rather than at its own stored position. Either way the
     * halo would float over empty grass with nothing under it.
     */
    if (ref.kind === 'ball') {
      const ball = board.ballById(ref.id)
      if (!ball || !board.state.ballsVisible || ball.attachedTo !== null) return []
    }
    const token =
      ref.kind === 'counter'
        ? board.counterById(ref.id)
        : ref.kind === 'marker'
          ? board.markerById(ref.id)
          : ref.kind === 'ball'
            ? board.ballById(ref.id)
            : board.labelById(ref.id)
    return token ? [{ key: `${ref.kind}-${ref.id}`, pos: token.pos, r: RING_RADIUS[ref.kind] }] : []
  })
})

function onEndGrab(id: string, end: 'from' | 'to', event: PointerEvent) {
  if (board.isDerived.value) return
  if (dragIsLive()) return
  const segment = board.drawingById(id)
  if (!segment || segment.kind === 'pen') return
  event.stopPropagation()
  capture(event)
  // The whole drag is one change, so the grab commits and the moves do not.
  board.commit()
  const at = toPitch(event)
  const anchor = segment[end]
  drag.value = {
    kind: 'end',
    id,
    end,
    pointerId: event.pointerId,
    origin: at,
    // The hit circle is nearly three times the drawn ring, so a press lands
    // off the end routinely. Carrying the offset picks the end up where it
    // is instead of snapping it under the pointer.
    grabOffset: { x: anchor.x - at.x, y: anchor.y - at.y },
    moved: false,
    startedAt: Date.now(),
  }
}

function onBendGrab(id: string, event: PointerEvent) {
  if (board.isDerived.value) return
  if (dragIsLive()) return
  event.stopPropagation()
  capture(event)
  // The whole drag is one change, so the grab commits and the moves do not.
  board.commit()
  drag.value = {
    kind: 'bend',
    id,
    pointerId: event.pointerId,
    origin: toPitch(event),
    // The bend is read off the chord, not carried from the grab point, so an
    // offset would only fight the projection.
    grabOffset: { x: 0, y: 0 },
    moved: false,
    startedAt: Date.now(),
  }
}

/**
 * Bow the arrow this drag holds to wherever its handle now sits.
 *
 * The handle is clamped to the pitch like every other position on the
 * board. Without it a drag off the edge keeps deepening the bow, and the
 * curve — which passes through the handle — arcs out over the touchline and
 * into the exported image.
 */
function bendTo(id: string, at: Vec): void {
  const arrow = board.drawingById(id)
  if (!arrow || arrow.kind !== 'arrow') return
  const { bend, along } = bendFor(arrow.from, arrow.to, clampToPitch(at, board.state.pitch.type))
  board.setArrowBend(id, bend, along)
}

function onPointerDown(event: PointerEvent) {
  if (board.isDerived.value) return
  if (dragIsLive()) return
  const at = toPitch(event)
  // A stroke is drawn straight from the pointer, so there is nothing to
  // carry an offset from.
  const shared = {
    pointerId: event.pointerId,
    origin: at,
    grabOffset: { x: 0, y: 0 },
    moved: false,
    startedAt: Date.now(),
  }
  if (props.tool === 'pen') {
    capture(event)
    drag.value = { kind: 'pen', id: board.startPen(at, props.drawColor), ...shared }
  } else if (props.tool === 'arrow-run' || props.tool === 'arrow-pass') {
    capture(event)
    const style = props.tool === 'arrow-run' ? 'run' : 'pass'
    drag.value = { kind: 'segment', id: board.startArrow(at, props.drawColor, style), ...shared }
  } else if (props.tool === 'text') {
    /*
     * Remembered here, emitted on release. Opening the dialog on the press
     * means the pointerup that follows lands on the <svg> and pulls focus
     * straight back out of the dialog's field. A tap is finished on release
     * anyway, and waiting also lets a drag cancel the placement.
     */
    if (pendingTapIsLive()) return
    capture(event)
    pendingTap = { kind: 'label', pointerId: event.pointerId, origin: at }
  } else if (props.tool === 'cone') {
    // Placed on press rather than as a drag: laying out a grid is a
    // sequence of taps, and a cone has no size to drag out.
    board.addMarker(at)
  } else if (props.tool === 'line') {
    capture(event)
    drag.value = { kind: 'segment', id: board.startLine(at, props.drawColor), ...shared }
  } else if (props.tool === 'select') {
    /*
     * Bare grass: a press on a drawing, a handle or a token stops before it
     * reaches here, so getting this far means the coach pressed nothing.
     *
     * The selection is NOT cleared yet. A press that travels is a box being
     * drawn, and clearing here would make the group flicker away and back on
     * every gather. The release decides: a box that travelled gathers, a
     * press that did not puts everything down.
     */
    capture(event)
    drag.value = { kind: 'marquee', to: at, ...shared }
  }
}

function onPointerMove(event: PointerEvent) {
  const active = drag.value
  if (!active || isOtherPointer(event)) return
  const at = toPitch(event)
  noteTravel(active, at)
  const carried = withGrabOffset(active, at)
  if (active.kind === 'counter') board.moveCounter(active.id, carried)
  else if (active.kind === 'marker') board.moveMarker(active.id, carried)
  else if (active.kind === 'label') board.moveLabel(active.id, carried)
  else if (active.kind === 'ball') {
    if (active.moved) board.moveBall(active.id, at)
  } else if (active.kind === 'pen') board.extendPen(active.id, at)
  else if (active.kind === 'bend') bendTo(active.id, at)
  else if (active.kind === 'end') board.moveSegmentEnd(active.id, active.end, carried)
  else if (active.kind === 'body') dragBody(active, at)
  else if (active.kind === 'group') dragGroup(active, at)
  else if (active.kind === 'marquee') active.to = at
  else board.updateSegment(active.id, at)
}

/**
 * Finish a pending tap, if this release is the one that owns it. A press
 * that travelled was a drag, not a tap, so it completes nothing.
 */
function settlePendingTap(event: PointerEvent): void {
  const tap = pendingTap
  if (!tap || tap.pointerId !== event.pointerId) return
  pendingTap = null
  releaseCapture(event.pointerId)
  if (distance(tap.origin, toPitch(event)) > TAP_TOLERANCE) return
  if (tap.kind === 'rename') emit('rename', tap.id)
  else emit('addLabel', tap.origin)
}

/**
 * An interrupted gesture completes nothing. Without this a pointercancel
 * would run the release path and open a dialog for a gesture the browser
 * had already taken away.
 */
function onPointerCancel(event: PointerEvent): void {
  if (pendingTap && pendingTap.pointerId === event.pointerId) {
    pendingTap = null
    releaseCapture(event.pointerId)
  }

  /*
   * A press the browser took away never happened, so it cannot be the
   * opening half of a double press either — leaving these set would let the
   * next press open a rename or an editor the coach never asked for.
   */
  lastCounterPress = null
  lastLabelPress = null

  // Only this pointer's drag ends. A cancel from some other pointer - a
  // rejected palm beside a stylus - must not abandon the drag in progress.
  if (drag.value?.pointerId === event.pointerId) {
    bodyDragFrom = null
    bodyDragCommitted = false
    clearDrag()
  }
}

function onPointerUp(event: PointerEvent) {
  settlePendingTap(event)

  const active = drag.value
  if (!active || isOtherPointer(event)) return
  const at = toPitch(event)
  noteTravel(active, at)

  if (active.kind === 'counter') {
    board.moveCounter(active.id, withGrabOffset(active, at))
    // A press that travelled was a drag, not the first half of a double
    // press. Leaving it armed turns an ordinary nudge-release-regrab rhythm
    // into a rename prompt with no drag.
    if (active.moved && lastCounterPress?.id === active.id) lastCounterPress = null
  } else if (active.kind === 'marker') {
    board.moveMarker(active.id, withGrabOffset(active, at))
  } else if (active.kind === 'label') {
    board.moveLabel(active.id, withGrabOffset(active, at))
  } else if (active.kind === 'ball') {
    if (active.moved) board.dropBall(active.id, at)
  } else if (active.kind === 'pen') {
    board.extendPen(active.id, at)
    board.finishDrawing(active.id)
  } else if (active.kind === 'bend') {
    bendTo(active.id, at)
  } else if (active.kind === 'end') {
    board.moveSegmentEnd(active.id, active.end, withGrabOffset(active, at))
  } else if (active.kind === 'body') {
    dragBody(active, at)
    bodyDragFrom = null
    bodyDragCommitted = false
  } else if (active.kind === 'group') {
    dragGroup(active, at)
    bodyDragFrom = null
    bodyDragCommitted = false
  } else if (active.kind === 'marquee') {
    active.to = at
    const box = marqueeRect.value
    // A press that never travelled is not a box; it means "put it all down".
    if (box) gatherInto(box)
    else clearSelection()
  } else {
    board.updateSegment(active.id, at)
    board.finishDrawing(active.id)
    // Only a segment that survived gets handles: `finishDrawing` discards a
    // stray tap, and handles on nothing would leave hit targets sitting
    // exactly where the coach is about to press again.
    if (isSegmentTool(props.tool)) {
      liveDrawingId.value = board.drawingById(active.id) ? active.id : null
    }
  }
  clearDrag()
}
</script>

<template>
  <BoardView
    ref="boardView"
    :frame="view"
    :pitch="board.state.pitch"
    :labels-visible="board.state.labelsVisible"
    :balls-visible="board.state.ballsVisible"
    :selected-drawing-ids="selectedDrawingIds"
    @grab-counter="onCounterGrab"
    @grab-marker="onMarkerGrab"
    @grab-label="onLabelGrab"
    @grab-ball="onBallGrab"
    @hit-drawing="onDrawingHit"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <template #under-tokens>
      <!--
        Rings for everything held that is not a drawing, painted under the
        pieces themselves so a ring reads as a halo rather than as part of
        the player. Drawings get their halo inside the drawing layer.
      -->
      <circle
        v-for="token in selectedTokens"
        :key="token.key"
        data-selected-token
        :cx="token.pos.x"
        :cy="token.pos.y"
        :r="token.r"
        fill="#ffffff"
        fill-opacity="0.28"
      />
    </template>

    <template #over-tokens>
      <!--
        Handles go in a slot, above the tokens, rather than beside their
        drawings: an arrow nearly always ends ON a player, so handle and
        counter cover the same spot, and whichever is painted later takes the
        press there. A handle only exists for a drawing the coach deliberately
        picked up, so at that moment it is what they are reaching for — a
        press on bare grass still falls through to the player underneath.
      -->
      <BendHandle
        v-for="arrow in bendHandles"
        :key="`bend-${arrow.id}`"
        :arrow="arrow"
        @grab="onBendGrab(arrow.id, $event)"
      />
      <template v-for="segment in endHandles" :key="`ends-${segment.id}`">
        <EndHandle
          v-for="end in (['from', 'to'] as const)"
          :key="end"
          :at="segment[end]"
          :color="segment.color"
          @grab="onEndGrab(segment.id, end, $event)"
        />
      </template>
      <!--
        The box, drawn last so it is never hidden by what it is gathering.
        Dashed and unfilled: it is a gesture in progress, not a thing on the
        pitch, and it disappears the moment the pointer comes up.
      -->
      <rect
        v-if="marqueeRect"
        data-marquee
        :x="marqueeRect.x"
        :y="marqueeRect.y"
        :width="marqueeRect.width"
        :height="marqueeRect.height"
        fill="#ffffff"
        fill-opacity="0.12"
        stroke="#ffffff"
        stroke-width="0.3"
        stroke-dasharray="1.5 1.2"
      />
    </template>
  </BoardView>
</template>
