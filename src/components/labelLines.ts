/** A label's text size, in pitch units. Readable on a tablet without swamping the players. */
export const LABEL_FONT_SIZE = 2.6

/** Distance between one line's middle and the next, in pitch units. */
export const LABEL_LINE_HEIGHT = LABEL_FONT_SIZE * 1.25

/**
 * An average glyph's width, as a share of the text size. An estimate, since
 * SVG text cannot be measured before it is drawn, but the plate behind a
 * label and the field it is typed into both size from it, so they agree.
 */
export const LABEL_GLYPH_EM = 0.56

/**
 * How many characters a pitch label runs to before it wraps. Wide enough
 * for a short cue to stay on one line, narrow enough that a sentence of
 * explanation reads as a block beside the players rather than a banner
 * across the pitch.
 */
export const LABEL_LINE_CHARS = 24

/**
 * The lines a label is drawn as. The coach's own line breaks are kept, and
 * anything longer than `width` wraps at a space. SVG text does not wrap by
 * itself, and the plate behind it has to know how big the block is, so the
 * wrapping is done here rather than left to the renderer.
 */
export function labelLines(text: string, width = LABEL_LINE_CHARS): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter((w) => w !== '')) {
      // A word too long for any line is cut, rather than left to run off
      // the plate.
      let rest = word
      while (rest.length > width) {
        if (line !== '') lines.push(line)
        lines.push(rest.slice(0, width))
        rest = rest.slice(width)
        line = ''
      }
      if (rest === '') continue
      if (line === '') line = rest
      else if (line.length + 1 + rest.length <= width) line += ` ${rest}`
      else {
        lines.push(line)
        line = rest
      }
    }
    lines.push(line)
  }
  return lines
}
