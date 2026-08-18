import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useExport } from '../src/composables/useExport'

beforeEach(() => {
  document.body.innerHTML = ''
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true })
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  }
})

afterEach(() => vi.restoreAllMocks())

describe('slugify', () => {
  it('makes a filename-safe name', () => {
    expect(useExport().slugify('Press trigger — 4-4-2!')).toBe('press-trigger-4-4-2')
  })

  it('falls back when the name has nothing usable', () => {
    expect(useExport().slugify('!!!')).toBe('pattern')
  })
})

describe('downloadText', () => {
  it('clicks a link carrying the right filename', () => {
    const clicks: string[] = []
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = create(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = () => clicks.push(el.download)
      return el
    })

    useExport().downloadText('{}', 'patterns.json')
    expect(clicks).toEqual(['patterns.json'])
  })

  it('does not leave the link in the document', () => {
    useExport().downloadText('{}', 'patterns.json')
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })
})
