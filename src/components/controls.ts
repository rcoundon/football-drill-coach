import type { CounterColor, PitchType, ToolMode } from '../types'

/**
 * The control definitions shared by the horizontal toolbar and the vertical
 * rail. Kept in one place so adding a tool cannot land in one layout and
 * quietly miss the other.
 */

export const SWATCHES: Record<CounterColor, string> = {
  red: '#e53935',
  blue: '#1e88e5',
  yellow: '#fdd835',
  purple: '#8e24aa',
  black: '#212121',
}

export const TOOLS: { id: ToolMode; label: string }[] = [
  { id: 'select', label: 'Move' },
  { id: 'pen', label: 'Draw' },
  { id: 'arrow-run', label: 'Run' },
  { id: 'arrow-pass', label: 'Pass' },
  { id: 'line', label: 'Line' },
  { id: 'cone', label: 'Cone' },
  { id: 'text', label: 'Text' },
  { id: 'erase', label: 'Erase' },
]

export const PITCHES: { id: PitchType; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'full', label: 'Full' },
  { id: 'half', label: 'Half' },
]

export const DRAW_COLORS = ['#ffffff', '#ffeb3b', '#212121', '#e53935']

export const DRAW_COLOR_NAMES: Record<string, string> = {
  '#ffffff': 'white',
  '#ffeb3b': 'yellow',
  '#212121': 'black',
  '#e53935': 'red',
}
