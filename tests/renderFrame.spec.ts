import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderFrameToDataUrl } from '../src/composables/renderFrame'
import { useStorage } from '../src/composables/useStorage'
import { __resetBoardForTests, useBoard } from '../src/composables/useBoard'

const storage = useStorage()

beforeEach(() => {
  localStorage.clear()
  __resetBoardForTests()
  capturedSvg = null
  rasterise.mockReset()
  rasterise.mockImplementation(async (svg: SVGSVGElement) => {
    capturedSvg = svg
    return new Blob(['png'], { type: 'image/png' })
  })
})

// jsdom cannot rasterise: canvas has no 2d context here. The point of these
// tests is the mounting and unmounting around it, so the rasteriser is stood
// in for and inspected.
//
// ONE shared mock, hoisted, because `vi.mock` is hoisted above the imports and
// `useExport()` is called afresh on every render. Building the mock inside the
// factory would hand each call its own `vi.fn`, so a rejection armed on one
// would never reach the next — and the unmount-on-failure test below would
// pass while exercising nothing.
const { rasterise } = vi.hoisted(() => ({ rasterise: vi.fn() }))

vi.mock('../src/composables/useExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composables/useExport')>()
  return {
    ...actual,
    useExport: () => ({ ...actual.useExport(), svgToPngBlob: rasterise }),
  }
})

let capturedSvg: SVGSVGElement | null = null

describe('renderFrameToDataUrl', () => {
  it('rasterises the frame asked for, not the one on screen', async () => {
    const board = useBoard()
    // The cast is drill-wide — every counter exists on every frame by
    // design (see useBoard's addCounter) — so a phase can only be told
    // apart from another by where things stand, not by who is out there.
    const counter = board.addCounter('red', { x: 10, y: 10 })
    board.addFrame()
    board.moveCounter(counter.id, { x: 80, y: 50 })
    const pattern = storage.savePattern('Two phases', board.snapshot())

    await renderFrameToDataUrl(pattern, 0)

    expect(capturedSvg!.querySelector('[data-counter]')!.getAttribute('transform')).toBe(
      'translate(10 10)',
    )

    await renderFrameToDataUrl(pattern, 1)

    expect(capturedSvg!.querySelector('[data-counter]')!.getAttribute('transform')).toBe(
      'translate(80 50)',
    )
  })

  it('carries no furniture: no handles, no marquee, no selection rings', async () => {
    const board = useBoard()
    board.addCounter('red')
    const pattern = storage.savePattern('One', board.snapshot())

    await renderFrameToDataUrl(pattern, 0)

    expect(capturedSvg!.querySelector('[data-bend-handle]')).toBeNull()
    expect(capturedSvg!.querySelector('[data-marquee]')).toBeNull()
    expect(capturedSvg!.querySelector('[data-selected-token]')).toBeNull()
  })

  it('hides player numbers when the drill was saved with them off', async () => {
    const board = useBoard()
    board.addCounter('red')
    board.toggleCounterLabelsVisible()
    const pattern = storage.savePattern('Numbers off', board.snapshot())

    await renderFrameToDataUrl(pattern, 0)

    expect(capturedSvg!.querySelector('[data-counter-label]')).toBeNull()
  })

  it('leaves nothing mounted in the document behind it', async () => {
    const board = useBoard()
    const pattern = storage.savePattern('One', board.snapshot())
    const before = document.body.childElementCount

    await renderFrameToDataUrl(pattern, 0)

    expect(document.body.childElementCount).toBe(before)
  })

  it('unmounts even when the rasteriser throws', async () => {
    const board = useBoard()
    const pattern = storage.savePattern('One', board.snapshot())
    const before = document.body.childElementCount

    rasterise.mockRejectedValueOnce(new Error('no canvas'))

    await expect(renderFrameToDataUrl(pattern, 0)).rejects.toThrow('no canvas')
    expect(document.body.childElementCount).toBe(before)
  })
})
