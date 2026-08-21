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

export type Ball = {
  pos: Vec
  /** Counter id when a player has the ball, null when it is free on the grass. */
  attachedTo: string | null
  /**
   * Whether the ball is on the pitch at all. A shape or pressing drill has
   * no ball; a passing drill does. Hiding it keeps `attachedTo`, so showing
   * it again returns it to whoever was carrying it.
   */
  visible: boolean
}

/**
 * One moment of the drill. v1 always has exactly one frame; record and
 * playback will append frames without any schema change.
 */
export type Frame = {
  counters: Counter[]
  markers: Marker[]
  labels: Label[]
  ball: Ball
}

export type Pattern = {
  id: string
  name: string
  version: 1
  pitch: { type: PitchType; rotated: boolean }
  drawings: Drawing[]
  labelsVisible?: boolean
  /**
   * Free text describing the whole drill — setup, coaching points,
   * progressions. Held at the pattern level rather than in a frame,
   * because it describes the drill rather than a moment in it.
   */
  notes?: string
  notesVisible?: boolean
  frames: Frame[]
  createdAt: string
  updatedAt: string
}
