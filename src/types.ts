export type PitchType = 'blank' | 'full' | 'half'

export type CounterColor = 'red' | 'blue' | 'yellow' | 'green' | 'black'

export type ToolMode = 'select' | 'pen' | 'arrow-run' | 'arrow-pass' | 'line' | 'erase'

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
}

/**
 * One moment of the drill. v1 always has exactly one frame; record and
 * playback will append frames without any schema change.
 */
export type Frame = {
  counters: Counter[]
  ball: Ball
}

export type Pattern = {
  id: string
  name: string
  version: 1
  pitch: { type: PitchType; rotated: boolean }
  drawings: Drawing[]
  frames: Frame[]
  createdAt: string
  updatedAt: string
}
