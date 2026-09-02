import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Pattern, Session } from '../src/types'

const calls = {
  text: [] as string[],
  images: 0,
  imageArgs: [] as { x: number; y: number; width: number; height: number }[],
  pages: 0,
}

vi.mock('jspdf', () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }
    setFontSize() { return this }
    setTextColor() { return this }
    text(value: string | string[]) {
      calls.text.push(...(Array.isArray(value) ? value : [value]))
      return this
    }
    addImage(_image: string, _format: string, x: number, y: number, width: number, height: number) {
      calls.images += 1
      calls.imageArgs.push({ x, y, width, height })
      return this
    }
    addPage() { calls.pages += 1; return this }
    splitTextToSize(text: string) { return [text] }
    output() { return new Blob(['pdf'], { type: 'application/pdf' }) }
  }
  return { jsPDF: FakeDoc, default: FakeDoc }
})

vi.mock('../src/composables/renderFrame', () => ({
  renderFrameToDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'),
  SESSION_BOARD_WIDTH: 800,
}))

import { buildSessionPdf } from '../src/sessionPdf'
import { renderFrameToDataUrl } from '../src/composables/renderFrame'

function pattern(over: Partial<Pattern> = {}): Pattern {
  return {
    id: 'p1',
    name: 'Rondo 4v2',
    version: 3,
    pitch: { type: 'blank', rotated: false },
    frames: [{ counters: [], markers: [], labels: [], balls: [], drawings: [] }],
    notes: '',
    notesVisible: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function session(entries: Session['entries']): Session {
  return {
    id: 's1',
    name: 'Tuesday U12',
    version: 1,
    entries,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  calls.text = []
  calls.images = 0
  calls.imageArgs = []
  calls.pages = 0
  vi.clearAllMocks()
})

describe('buildSessionPdf', () => {
  it('opens with the session name and its totals', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'p1', minutes: 12 },
        { id: 'e2', patternId: 'p2', minutes: 20 },
      ]),
      patterns: [pattern(), pattern({ id: 'p2', name: 'Pressing trap' })],
    })

    const joined = calls.text.join(' | ')
    expect(joined).toContain('Tuesday U12')
    expect(joined).toContain('2 drills')
    expect(joined).toContain('32 min')
  })

  it('gives each drill its own page', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'p1', minutes: 12 },
        { id: 'e2', patternId: 'p2', minutes: 20 },
      ]),
      patterns: [pattern(), pattern({ id: 'p2', name: 'Pressing trap' })],
    })

    // The cover, then one page per drill.
    expect(calls.pages).toBe(2)
  })

  it('draws up to four boards for a drill, and says which of how many', async () => {
    const frames = Array.from({ length: 7 }, () => ({
      counters: [], markers: [], labels: [], balls: [], drawings: [],
    }))

    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern({ frames })],
    })

    expect(calls.images).toBe(4)
    expect(calls.text.join(' | ')).toContain('Phase 3 of 7')
  })

  it('skips a drill that is no longer in the library, and does not count its minutes', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'p1', minutes: 12 },
        { id: 'e2', patternId: 'gone', minutes: 20 },
      ]),
      patterns: [pattern()],
    })

    const joined = calls.text.join(' | ')
    expect(joined).toContain('12 min')
    expect(joined).not.toContain('32 min')
    expect(calls.pages).toBe(1)
  })

  it('prints no notes for a drill whose notes are hidden', async () => {
    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern({ notes: 'secret coaching point', notesVisible: false })],
    })

    expect(calls.text.join(' | ')).not.toContain('secret coaching point')
  })

  it('reports progress as it goes', async () => {
    const onProgress = vi.fn()

    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern()],
      onProgress,
    })

    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it('rasterises through renderFrameToDataUrl rather than the live board', async () => {
    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
      patterns: [pattern()],
    })

    expect(renderFrameToDataUrl).toHaveBeenCalled()
  })

  it('letterboxes a rotated board into the same box a straight one gets, instead of stretching it', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'straight', minutes: 10 },
        { id: 'e2', patternId: 'rotated', minutes: 10 },
      ]),
      patterns: [
        pattern({ id: 'straight', pitch: { type: 'blank', rotated: false } }),
        pattern({ id: 'rotated', pitch: { type: 'blank', rotated: true } }),
      ],
    })

    expect(calls.imageArgs).toHaveLength(2)
    const [straight, rotated] = calls.imageArgs

    // Both drills get a single-frame board at the full content width, so
    // they share the same box — only what is drawn inside it differs.
    expect(rotated.height).toBeCloseTo(straight.height, 1)

    // The straight board fills its box; the portrait one is narrower than
    // the box and centred in it rather than stretched to fill it.
    expect(rotated.width).toBeLessThan(straight.width)
    expect(rotated.x).toBeGreaterThan(straight.x)
  })
})
