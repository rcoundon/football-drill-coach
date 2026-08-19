import { describe, it, expect } from 'vitest'
import { wrapNotes } from '../src/composables/useExport'

/**
 * Wrapping is pure so it can be tested without a canvas: it takes a
 * measuring function rather than reaching for one. A monospace stand-in of
 * 10 units per character makes the expected breaks obvious.
 */
const measure = (text: string) => text.length * 10

describe('wrapNotes', () => {
  it('returns nothing for empty notes', () => {
    expect(wrapNotes('', 200, measure)).toEqual([])
    expect(wrapNotes('   ', 200, measure)).toEqual([])
  })

  it('leaves a short line alone', () => {
    expect(wrapNotes('Two touch', 200, measure)).toEqual(['Two touch'])
  })

  it('breaks a long line at a space rather than mid-word', () => {
    const lines = wrapNotes('one two three four', 100, measure)
    expect(lines.every((line) => measure(line) <= 100)).toBe(true)
    expect(lines.join(' ')).toBe('one two three four')
  })

  /** A list stops being a list if its line breaks are thrown away. */
  it('keeps the author\'s own line breaks', () => {
    expect(wrapNotes('Setup:\n- 20x20 grid', 400, measure)).toEqual(['Setup:', '- 20x20 grid'])
  })

  it('keeps a deliberate blank line between paragraphs', () => {
    expect(wrapNotes('First\n\nSecond', 400, measure)).toEqual(['First', '', 'Second'])
  })

  it('breaks a single word that cannot fit, rather than overflowing', () => {
    const lines = wrapNotes('supercalifragilistic', 50, measure)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => measure(line) <= 50)).toBe(true)
    expect(lines.join('')).toBe('supercalifragilistic')
  })
})
