import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Pattern, Session } from '../src/types'

const calls = {
  text: [] as string[],
  textArgs: [] as { value: string; x: number; y: number }[],
  images: 0,
  imageArgs: [] as { x: number; y: number; width: number; height: number }[],
  pages: 0,
}

vi.mock('jspdf', () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }
    setFontSize() { return this }
    setTextColor() { return this }
    text(value: string | string[], x: number, y: number) {
      const values = Array.isArray(value) ? value : [value]
      calls.text.push(...values)
      for (const v of values) calls.textArgs.push({ value: v, x, y })
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
  calls.textArgs = []
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

  it('continues the cover page running order onto a second page rather than running off the bottom', async () => {
    const count = 40
    const entries = Array.from({ length: count }, (_, i) => ({
      id: `e${i}`,
      patternId: `p${i}`,
      minutes: 5,
    }))
    const patterns = Array.from({ length: count }, (_, i) => pattern({ id: `p${i}`, name: `Drill ${i}` }))

    await buildSessionPdf({ session: session(entries), patterns })

    // One page break for the running order overflowing the cover, plus one
    // page per drill.
    expect(calls.pages).toBe(count + 1)

    // Every running-order line still made it into the document, including
    // the ones pushed onto the continuation page.
    const joined = calls.text.join(' | ')
    expect(joined).toContain('1. Drill 0 — 5 min')
    expect(joined).toContain(`${count}. Drill ${count - 1} — 5 min`)
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

  it('gives a hidden-notes drill the freed height back to its board grid', async () => {
    await buildSessionPdf({
      session: session([
        { id: 'e1', patternId: 'shown', minutes: 10 },
        { id: 'e2', patternId: 'hidden', minutes: 10 },
      ]),
      patterns: [
        pattern({ id: 'shown', pitch: { type: 'blank', rotated: true }, notesVisible: true }),
        pattern({ id: 'hidden', pitch: { type: 'blank', rotated: true }, notesVisible: false }),
      ],
    })

    expect(calls.imageArgs).toHaveLength(2)
    const [shown, hidden] = calls.imageArgs

    // Both are the same rotated (portrait) board sampled to a single frame
    // at the same content width, so the only thing that can make one taller
    // than the other is the notes block's height being freed to the grid.
    expect(hidden.height).toBeGreaterThan(shown.height)
  })

  it('keeps the caption under a straight (landscape) board when its notes are hidden, rather than leaving it stranded below freed whitespace', async () => {
    await buildSessionPdf({
      session: session([{ id: 'e1', patternId: 'p1', minutes: 10 }]),
      patterns: [
        pattern({ id: 'p1', pitch: { type: 'blank', rotated: false }, notesVisible: false }),
      ],
    })

    expect(calls.imageArgs).toHaveLength(1)
    const [image] = calls.imageArgs
    const caption = calls.textArgs.find((t) => t.value === 'Phase 1 of 1')
    expect(caption).toBeDefined()

    // A straight pitch is width-bound (see `fitInBox`), so notes-hidden's
    // freed height cannot be used by the board image and must not be handed
    // to the grid cell — the caption should sit just under the board, not
    // tens of millimetres below it in reclaimed whitespace.
    const gap = caption!.y - (image.y + image.height)
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThan(10)
  })

  it('names the drill and phase when a rasterise fails, on top of the underlying reason', async () => {
    vi.mocked(renderFrameToDataUrl).mockRejectedValueOnce(new Error('canvas is tainted'))

    await expect(
      buildSessionPdf({
        session: session([{ id: 'e1', patternId: 'p1', minutes: 12 }]),
        patterns: [pattern({ name: 'Rondo 4v2' })],
      }),
    ).rejects.toThrow('Could not render "Rondo 4v2" (phase 1 of 1): canvas is tainted')
  })
})
