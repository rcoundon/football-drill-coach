import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { exportableClone, useExport } from '../src/composables/useExport'

beforeEach(() => {
  document.body.innerHTML = ''
  // The object URL is revoked on a timer, so every test drives that clock.
  vi.useFakeTimers()
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true })
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

/**
 * Revoking synchronously after link.click() is a long-standing cause of
 * failed downloads outside Chromium: the browser has not started reading the
 * blob yet when the URL is torn out from under it. The spec's target devices
 * include tablets, so iPad Safari is the likely victim — for the PNG and the
 * JSON alike.
 */
describe('object URL lifetime', () => {
  it('does not revoke the object URL before the download can start', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')

    useExport().downloadText('{}', 'patterns.json')
    expect(revoke).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('revokes the same URL it handed the link', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:the-one')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')

    useExport().downloadBlob(new Blob(['x']), 'board.png')
    vi.runAllTimers()

    expect(revoke).toHaveBeenCalledWith('blob:the-one')
  })
})

/**
 * A cancelled file picker used to leave the promise pending forever, leaking
 * one per cancelled import — and leaving the caller's await hanging, so the
 * coach got no feedback at all.
 */
describe('pickJsonFile when the coach cancels', () => {
  function captureInput() {
    const create = document.createElement.bind(document)
    let input: HTMLInputElement | undefined
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = create(tag)
      if (tag === 'input') {
        input = el as HTMLInputElement
        el.click = () => {}
      }
      return el
    })
    return () => input!
  }

  it('rejects when the picker reports a cancel', async () => {
    const input = captureInput()
    // The assertion is attached before the rejection is triggered, so the
    // rejection is never momentarily unhandled.
    const settled = expect(useExport().pickJsonFile()).rejects.toThrow(/no file/i)

    input().dispatchEvent(new Event('cancel'))

    await settled
  })

  it('rejects when the picker closes without reporting anything', async () => {
    captureInput()
    const settled = expect(useExport().pickJsonFile()).rejects.toThrow(/no file/i)

    // Every browser gives the window its focus back; not all fire `cancel`.
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(2000)

    await settled
  })

  it('still resolves with the file when one is chosen', async () => {
    const input = captureInput()
    const pending = useExport().pickJsonFile()

    const file = new File(['[]'], 'patterns.json', { type: 'application/json' })
    Object.defineProperty(input(), 'files', { value: [file], configurable: true })
    // A chosen file also returns focus to the window; the change must win.
    window.dispatchEvent(new Event('focus'))
    input().dispatchEvent(new Event('change'))
    await vi.advanceTimersByTimeAsync(2000)

    await expect(pending).resolves.toBe('[]')
  })
})

/**
 * The board carries editing affordances the coach never wants in an image —
 * the bend handle on every arrow. They are marked transient rather than
 * listed here, so a future affordance is excluded the day it is added.
 */
describe('exportableClone', () => {
  function boardSvg(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 100 65')
    svg.innerHTML =
      '<path data-drawing d="M 20 30 Q 40 40 60 30"></path>' +
      '<g data-bend-handle data-transient><circle data-bend r="0.9"></circle></g>'
    return svg
  }

  it('leaves the drill itself alone', () => {
    expect(exportableClone(boardSvg()).querySelectorAll('[data-drawing]')).toHaveLength(1)
  })

  it('drops the editing affordances', () => {
    expect(exportableClone(boardSvg()).querySelectorAll('[data-transient]')).toHaveLength(0)
  })

  it('drops what a transient element contains, not only the element', () => {
    expect(exportableClone(boardSvg()).querySelectorAll('[data-bend]')).toHaveLength(0)
  })

  it('does not disturb the board it copied', () => {
    const svg = boardSvg()
    exportableClone(svg)
    expect(svg.querySelectorAll('[data-transient]')).toHaveLength(1)
  })
})

/** A minimal board SVG, just enough to carry a viewBox for the aspect ratio maths. */
function svgStub(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 100 64.76')
  return svg
}

/**
 * jsdom has no canvas, so `boardToGifBlob` cannot actually rasterise or
 * encode anything here — every call in this suite is expected to reject.
 * What is tested is the orchestration around that: the order samples are
 * seeked to, and the progress reported along the way. That is exactly why
 * `seek` is injected rather than reached for on a real board.
 */
describe('boardToGifBlob', () => {
  it('seeks to every sample, in order', async () => {
    const seen: number[] = []
    const seek = async (atMs: number) => {
      seen.push(atMs)
    }
    const { boardToGifBlob } = useExport()

    await boardToGifBlob(svgStub(), [
      { atMs: 0, delayMs: 80 },
      { atMs: 80, delayMs: 80 },
      { atMs: 160, delayMs: 500 },
    ], seek).catch(() => {
      // jsdom cannot rasterise, so this rejects. What is being asserted is
      // that it seeked first, in order.
    })

    expect(seen).toEqual([0, 80, 160])
  })

  it('reports progress as it goes', async () => {
    const progress: Array<[number, number]> = []
    const { boardToGifBlob } = useExport()

    await boardToGifBlob(
      svgStub(),
      [{ atMs: 0, delayMs: 80 }, { atMs: 80, delayMs: 500 }],
      async () => {},
      '',
      800,
      (done, total) => progress.push([done, total]),
    ).catch(() => {})

    expect(progress[0]).toEqual([0, 2])
  })
})
