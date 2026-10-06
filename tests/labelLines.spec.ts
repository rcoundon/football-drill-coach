import { describe, it, expect } from 'vitest'
import { labelLines } from '../src/components/labelLines'

describe('labelLines', () => {
  it('leaves a short cue on one line', () => {
    expect(labelLines('Press trigger')).toEqual(['Press trigger'])
  })

  it('wraps at a space once a line is full', () => {
    expect(labelLines('Winger holds width until the full back overlaps', 24)).toEqual([
      'Winger holds width until',
      'the full back overlaps',
    ])
  })

  it("keeps the coach's own line breaks, blank lines included", () => {
    expect(labelLines('Phase 2\n\nSwitch play')).toEqual(['Phase 2', '', 'Switch play'])
  })

  it('cuts a word too long for any line', () => {
    expect(labelLines('a ' + 'x'.repeat(10), 4)).toEqual(['a', 'xxxx', 'xxxx', 'xx'])
  })
})
