export type PitchType = 'blank' | 'full' | 'half'

export type CounterColor = 'red' | 'blue' | 'yellow' | 'purple' | 'black'

export type ToolMode = 'select' | 'pen' | 'arrow-run' | 'arrow-pass' | 'line' | 'cone' | 'text' | 'erase'

/** A position in pitch units: x in 0..PITCH_W, y in 0..PITCH_H. Never pixels. */
export type Vec = { x: number; y: number }

/** A screen-space rectangle, as returned by getBoundingClientRect. */
export type Rect = { left: number; top: number; width: number; height: number }

export type Counter = {
  id: string
  color: CounterColor
  label: string
  pos: Vec
  /**
   * How far this player's run bows off the straight line into this frame, in
   * pitch units, signed by which side it bows towards. Absent or zero is a
   * straight run.
   *
   * The chord is where this player stood on the PREVIOUS frame to `pos` on
   * this one, so the value describes the move into the frame it sits on. The
   * first frame's is ignored: nothing moves into the start of a drill, the
   * same rule `Frame.duration` follows.
   *
   * Held as a chord-relative offset rather than a control point, exactly as
   * `ArrowDrawing.bend` is, so a curve keeps its shape through a board
   * rotation, a group move and a duplicate — and so a pattern saved before
   * curves existed loads as the straight one it was.
   */
  bend?: number
  /**
   * Where along the run the bow peaks, as a signed fraction of the chord
   * either side of its midpoint. Absent or zero is an even arc; positive
   * leans towards the arrival.
   */
  bendAlong?: number
}

/**
 * A cone on the ground. Equipment, not a player: it has no colour, no
 * label, and the ball can never belong to it.
 */
export type Marker = {
  id: string
  pos: Vec
}

/**
 * Short text dropped on the pitch — "press trigger", "2 touch max". Held in
 * pitch units like everything else, so it rotates and exports with the board.
 */
export type Label = {
  id: string
  pos: Vec
  text: string
}

export type PenDrawing = {
  id: string
  kind: 'pen'
  color: string
  points: Vec[]
}

export type ArrowDrawing = {
  id: string
  kind: 'arrow'
  color: string
  style: 'run' | 'pass'
  from: Vec
  to: Vec
  /**
   * How far the arrow bows off the straight line between its ends, in pitch
   * units, signed by which side it bows towards. Absent or zero is straight.
   *
   * Held as an offset rather than a control point so it survives the board
   * being rotated, and so an arrow saved before curves existed loads as the
   * straight one it was.
   */
  bend?: number
  /**
   * Where along the arrow the bow peaks, as a signed fraction of the
   * straight-line length either side of the midpoint. Absent or zero is an
   * even arc; positive leans towards the arrowhead.
   *
   * A fraction rather than a distance, so a curve keeps its shape if the
   * arrow's length ever changes, and relative to the chord like `bend` so it
   * survives the board being rotated.
   */
  bendAlong?: number
}

/**
 * A plain straight segment with no arrowhead: a zone edge, a channel, a
 * thirds or offside line. Distinct from an arrow rather than a style of
 * one, because it marks out ground rather than describing a movement.
 */
export type LineDrawing = {
  id: string
  kind: 'line'
  color: string
  from: Vec
  to: Vec
}

export type Drawing = PenDrawing | ArrowDrawing | LineDrawing

/** Any drawing dragged out as a straight segment between two points. */
export type SegmentDrawing = ArrowDrawing | LineDrawing

/**
 * The things a coach can gather into a group and move together.
 *
 * Only a FREE ball is one of them. A carried ball is not a group member in
 * its own right: it follows its carrier, automatically, because it is drawn
 * relative to them. That sidesteps deciding what possession means during a
 * group move, and it matches the pitch — you cannot lasso a ball out of
 * someone's feet.
 */
export type SelectableKind = 'counter' | 'marker' | 'label' | 'drawing' | 'ball'

/** One member of a selection, named by what it is and which one it is. */
export type SelectionRef = { kind: SelectableKind; id: string }

export type Ball = {
  /**
   * Not decoration: playback matches a ball in one phase to the same ball in
   * the next, exactly as it does for players. Without an id there is no way
   * to say which ball travelled where.
   */
  id: string
  pos: Vec
  /** Counter id when a player has this ball, null when it is free on the grass. */
  attachedTo: string | null
}

/**
 * One moment of the drill: where everything stands, and what is drawn over
 * it. A frame is the whole board at an instant, which is why drawings live
 * here rather than on the pattern — the arrow describing a pass belongs to
 * the moment the pass happens, not to the whole drill.
 */
export type Frame = {
  counters: Counter[]
  markers: Marker[]
  labels: Label[]
  balls: Ball[]
  drawings: Drawing[]
  /**
   * What this phase alone is about — the coaching point that applies here
   * and not to the drill as a whole. Optional: most phases have none, and a
   * pattern saved before per-phase notes existed has none either.
   */
  note?: string
  /**
   * How long the move INTO this frame takes, in milliseconds. Absent means
   * DEFAULT_FRAME_MS. The first frame's value is ignored: nothing moves into
   * the start of a drill.
   *
   * Optional so a pattern saved before playback existed needs no rewriting.
   */
  duration?: number
}

export type Pattern = {
  id: string
  name: string
  version: 3
  pitch: { type: PitchType; rotated: boolean }
  /**
   * Where drawings lived before they belonged to a moment. Read into the
   * first frame when a v1 pattern is opened, and never written again.
   */
  drawings?: Drawing[]
  labelsVisible?: boolean
  counterLabelsVisible?: boolean
  /**
   * Whether the balls are on the pitch at all. A shape or pressing drill has
   * none out; a passing drill does. Hiding them keeps every ball's position
   * and carrier, so showing them again hands each one back.
   *
   * Drill-wide, beside the other two visibility settings. It used to ride on
   * the ball itself, which put it on the frame — so hiding the ball on one
   * phase left it showing on the next.
   */
  ballsVisible?: boolean
  /**
   * Free text describing the whole drill — setup, coaching points,
   * progressions. Held at the pattern level rather than in a frame,
   * because it describes the drill rather than a moment in it.
   */
  notes?: string
  notesVisible?: boolean
  /**
   * How the coach files this drill: "rondo", "pressing", "u12". Optional
   * because most drills have none, and absent reads as empty.
   *
   * Held lowercase and deduplicated by `normaliseTags` on the way in. A tag
   * is a label rather than free text, and `Rondo` and `rondo` sitting in the
   * filter row as two chips is a bug whose cause is invisible to the person
   * looking at it.
   */
  tags?: string[]
  frames: Frame[]
  createdAt: string
  updatedAt: string
}

/**
 * One drill in a session, and how long it runs.
 *
 * The id is the entry's own, not the drill's: a drill can appear twice in a
 * session — the warm-up rondo run again at the end is an ordinary session —
 * and keying a list render or a reorder on `patternId` breaks the moment it
 * does.
 */
export type SessionEntry = {
  id: string
  patternId: string
  /** Minutes. Validated like a frame's duration: finite and above zero. */
  minutes: number
}

/**
 * A training session: several drills, in order, with minutes against each.
 *
 * It references drills rather than containing them, so a drill fixed after
 * the session was built is fixed in the session too. The cost is an entry
 * that can point at a drill that is gone, which the interface renders as a
 * missing row rather than hiding.
 *
 * Its version is a separate line from `Pattern.version`. Sessions do not
 * contain patterns, so a change to the pattern format never changes this one.
 */
export type Session = {
  id: string
  name: string
  version: 1
  entries: SessionEntry[]
  createdAt: string
  updatedAt: string
}
