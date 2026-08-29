import type { CounterColor, PitchType, ToolMode } from '../types'

/**
 * The control definitions the rail is built from, and the palette the board
 * draws with. Kept in one place so a colour or a tool cannot mean one thing
 * where it is chosen and another where it is drawn.
 */

/**
 * The five team colours, and the only definition of them: the swatch that
 * adds a player and the player on the pitch are the same colour by
 * construction rather than by two files agreeing.
 *
 * Red and blue are deeper than they look like they need to be. A player's
 * label is white on every colour but yellow, and the brighter red and blue
 * they replaced carried it at 4.2:1 and 3.7:1 — under the 4.5:1 a number
 * that small needs to be legible at arm's length on a pitch-side tablet.
 */
export const SWATCHES: Record<CounterColor, string> = {
  red: '#d32f2f',
  blue: '#1976d2',
  yellow: '#fdd835',
  purple: '#8e24aa',
  black: '#212121',
}

/**
 * The casing drawn around a player and a cone.
 *
 * Near-black rather than the design handoff's `rgba(0,0,0,.22)`, which is
 * decoration: at 22% over grass it reaches 1.44:1, which changes nothing a
 * coach can see. Solid, it clears 3:1 against both the pitch and the white
 * markings, so a token has a defined edge wherever it stands — and red,
 * blue and purple discs sit within 1.4:1 of the grass by luminance, telling
 * themselves apart from it by hue alone, which is what colour blindness,
 * sunlight and a cheap screen each take away.
 */
export const TOKEN_CASING = '#000000'

/**
 * What a label is written in, on each. Yellow is the one colour light
 * enough that white on it is unreadable — 1.4:1, which is no contrast at
 * all — so it takes the board's own near-black instead.
 */
export const LABEL_INK: Record<CounterColor, string> = {
  red: '#ffffff',
  blue: '#ffffff',
  yellow: '#212121',
  purple: '#ffffff',
  black: '#ffffff',
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
