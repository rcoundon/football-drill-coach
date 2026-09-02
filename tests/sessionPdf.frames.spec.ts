import { describe, it, expect } from 'vitest'
import { sampleFrameIndices } from '../src/sessionPdf'

describe('sampleFrameIndices', () => {
  it('takes every frame when there are four or fewer', () => {
    expect(sampleFrameIndices(1)).toEqual([0])
    expect(sampleFrameIndices(2)).toEqual([0, 1])
    expect(sampleFrameIndices(3)).toEqual([0, 1, 2])
    expect(sampleFrameIndices(4)).toEqual([0, 1, 2, 3])
  })

  it('takes the start, the end and two evenly between', () => {
    expect(sampleFrameIndices(7)).toEqual([0, 2, 4, 6])
    expect(sampleFrameIndices(10)).toEqual([0, 3, 6, 9])
  })

  it('always includes the first and the last', () => {
    for (const n of [5, 6, 8, 9, 13, 20]) {
      const picked = sampleFrameIndices(n)
      expect(picked[0]).toBe(0)
      expect(picked[picked.length - 1]).toBe(n - 1)
      expect(picked).toHaveLength(4)
    }
  })

  it('never repeats an index', () => {
    for (const n of [5, 6, 7, 8]) {
      const picked = sampleFrameIndices(n)
      expect(new Set(picked).size).toBe(picked.length)
    }
  })

  it('treats an empty drill as nothing to draw', () => {
    expect(sampleFrameIndices(0)).toEqual([])
  })
})
