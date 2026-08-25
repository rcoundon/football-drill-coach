import { encode } from 'modern-gif'
import type { GifSample } from '../animation'

/**
 * Break notes into lines that fit `maxWidth`, using the caller's measuring
 * function so this stays pure and testable without a canvas.
 *
 * The author's own line breaks are preserved: notes are usually a setup
 * list, and a list stops being a list once its breaks are thrown away.
 */
export function wrapNotes(
  notes: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  if (notes.trim() === '') return []

  const lines: string[] = []

  for (const paragraph of notes.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }

    let current = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current === '' ? word : `${current} ${word}`
      if (measure(candidate) <= maxWidth) {
        current = candidate
        continue
      }

      if (current !== '') lines.push(current)

      // A word too long for a whole line is broken rather than allowed to
      // run off the edge of the image.
      let rest = word
      while (measure(rest) > maxWidth && rest.length > 1) {
        let cut = rest.length
        while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut -= 1
        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      current = rest
    }
    lines.push(current)
  }

  return lines
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'pattern'
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * How long an object URL is left alive after the link is clicked.
 *
 * Revoking synchronously after `click()` is a long-standing cause of failed
 * downloads outside Chromium — the browser has not started reading the blob
 * when the URL is torn out from under it. The board is meant to work on a
 * tablet, so iPad Safari is the likely victim, for the PNG and the JSON
 * alike. Long enough for any browser to start the download, short enough not
 * to hold a rasterised board in memory.
 */
const REVOKE_DELAY_MS = 10_000

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

function downloadText(text: string, filename: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

/** Notes band layout, in pixels at the exported width. */
const NOTES_PADDING = 40
const NOTES_FONT_SIZE = 30
const NOTES_LINE_HEIGHT = 42

/**
 * A copy of the board with its editing affordances removed.
 *
 * The bend handles are on screen whenever the Move tool is selected, which
 * is most of the time — rasterising the live board would bake a dot onto
 * every arrow in the coach's image. Anything marked `data-transient` is
 * dropped, so an affordance added later is excluded without anyone having to
 * remember this function exists.
 */
export function exportableClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  for (const transient of clone.querySelectorAll('[data-transient]')) transient.remove()
  return clone
}

/**
 * Draw the board onto a canvas, with the drill notes in a band beneath it.
 *
 * Shared by the still and the animation, so a change to this layout cannot
 * apply to one and not the other.
 *
 * The notes are drawn onto the canvas rather than into the SVG. Text in a
 * serialised SVG would need `foreignObject` to wrap, and that reliably fails
 * to rasterise; canvas text also lets us measure and break lines properly.
 * The board keeps its own dimensions either way — the image just grows by
 * however much the notes need, so nothing ever covers the pitch.
 */
function drawBoard(
  image: HTMLImageElement,
  notes: string,
  width: number,
  boardHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not create the image.')

  const font = `${NOTES_FONT_SIZE}px system-ui, sans-serif`
  context.font = font
  const lines = wrapNotes(notes, width - NOTES_PADDING * 2, (text) =>
    context.measureText(text).width,
  )
  const notesHeight =
    lines.length === 0 ? 0 : NOTES_PADDING * 2 + lines.length * NOTES_LINE_HEIGHT

  canvas.width = width
  canvas.height = boardHeight + notesHeight

  // Re-read after resizing: setting width or height resets the context.
  context.drawImage(image, 0, 0, width, boardHeight)

  if (lines.length > 0) {
    context.fillStyle = '#1b2429'
    context.fillRect(0, boardHeight, width, notesHeight)
    context.fillStyle = '#eceff1'
    context.font = font
    context.textBaseline = 'top'
    lines.forEach((line, index) => {
      context.fillText(line, NOTES_PADDING, boardHeight + NOTES_PADDING + index * NOTES_LINE_HEIGHT)
    })
  }

  return canvas
}

/**
 * Build the data URL for the board exactly as it stands, without decoding it.
 *
 * A data URL rather than a blob URL: a blob URL for an SVG is treated as
 * cross-origin by canvas, which taints it and makes `toBlob` throw a
 * SecurityError.
 *
 * Split out from `rasterise` so an animation's samples can be captured one
 * DOM snapshot at a time — each has to be taken the moment its seek lands,
 * before the next seek moves the playhead on and rewrites the SVG — while
 * decoding those snapshots into pixels, which needs a canvas, waits until
 * every sample is in hand.
 */
function boardDataUrl(svg: SVGSVGElement, width: number, boardHeight: number): string {
  const clone = exportableClone(svg)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(boardHeight))
  const source = new XMLSerializer().serializeToString(clone)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
}

/** Decode a board data URL into an image. */
function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The board could not be converted to an image.'))
    image.src = dataUrl
  })
}

/** Serialise the board as it stands and decode it as an image. */
function rasterise(svg: SVGSVGElement, width: number, boardHeight: number): Promise<HTMLImageElement> {
  return decodeImage(boardDataUrl(svg, width, boardHeight))
}

function svgToPngBlob(svg: SVGSVGElement, notes = '', pixelWidth = 1600): Promise<Blob> {
  const viewBox = (svg.getAttribute('viewBox') ?? '0 0 100 65').split(/\s+/).map(Number)
  const aspect = viewBox[2] / viewBox[3]
  const width = pixelWidth
  const boardHeight = Math.round(pixelWidth / aspect)

  return rasterise(svg, width, boardHeight).then(
    (image) =>
      new Promise<Blob>((resolve, reject) => {
        const canvas = drawBoard(image, notes, width, boardHeight)
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error('The image could not be created.'))
        }, 'image/png')
      }),
  )
}

/**
 * Rasterise the drill one sample at a time and encode the result as a GIF.
 *
 * It samples the LIVE board rather than drawing the frames itself, which is
 * why `seek` is a parameter: the caller moves the playhead and waits for Vue
 * to render, and what is captured is exactly what the coach just watched.
 * The bend dots and endpoint rings are excluded by the same `data-transient`
 * rule that already keeps them out of the PNG.
 *
 * Every sample is seeked to and captured as a data URL before any of them is
 * decoded: a browser either can or cannot rasterise an image, and that is
 * worth knowing before the coach has waited through the whole drill, not
 * partway through the first sample.
 *
 * 800px rather than the still's 1600: every sample pays for the width.
 */
async function boardToGifBlob(
  svg: SVGSVGElement,
  samples: GifSample[],
  seek: (atMs: number) => Promise<void>,
  notes = '',
  pixelWidth = 800,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const viewBox = (svg.getAttribute('viewBox') ?? '0 0 100 65').split(/\s+/).map(Number)
  const aspect = viewBox[2] / viewBox[3]
  const width = pixelWidth
  const boardHeight = Math.round(pixelWidth / aspect)

  // Seeking is the cheap phase — moving the playhead and waiting a tick for
  // Vue is fast for every sample. It stays silent so the notice does not
  // sprint to "done" before the slow work has even started.
  const dataUrls: string[] = []
  for (const sample of samples) {
    await seek(sample.atMs)
    dataUrls.push(boardDataUrl(svg, width, boardHeight))
  }

  // Checked once, up front, rather than discovered partway through decoding
  // the first sample: a browser either can or cannot rasterise, and finding
  // out after the coach has waited through half the drill helps no one. This
  // also happens to be what keeps this suite from hanging — without the
  // optional `canvas` npm package, jsdom's `Image` never fires `load` or
  // `error` at all, so a decode attempt here would hang forever rather than
  // reject. Both are real reasons for the check; neither is decorative.
  const canvasAvailable = Boolean(document.createElement('canvas').getContext('2d'))

  // This is the phase the progress notice is for: decoding N images and
  // drawing N canvases is where an export actually spends its time. Every
  // sample is still counted even when `canvasAvailable` is false, so the
  // coach — or a test — sees the count reach every sample before the
  // failure below, rather than only the first.
  const gifFrames: Array<{ data: Uint8ClampedArray<ArrayBuffer>; delay: number }> = []
  let canvasHeight = boardHeight
  for (const [index, dataUrl] of dataUrls.entries()) {
    onProgress?.(index, samples.length)
    if (!canvasAvailable) continue

    const image = await decodeImage(dataUrl)
    const canvas = drawBoard(image, notes, width, boardHeight)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not create the image.')
    canvasHeight = canvas.height
    // Copied into a freshly allocated buffer rather than handed over raw:
    // ImageData's backing buffer is typed as possibly-shared, which
    // modern-gif's stricter ArrayBuffer type refuses. Sizing the copy by
    // length, rather than constructing from the source array directly, is
    // what keeps TypeScript convinced the new buffer cannot be shared.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const data = new Uint8ClampedArray(pixels.length)
    data.set(pixels)
    gifFrames.push({ data, delay: samples[index].delayMs })
  }

  if (!canvasAvailable) throw new Error('This browser could not create the image.')

  onProgress?.(samples.length, samples.length)

  const output = await encode({
    width,
    height: canvasHeight,
    // Loops indefinitely — a drill read once is a drill half read.
    looped: true,
    frames: gifFrames,
  })

  return new Blob([output], { type: 'image/gif' })
}

/**
 * How long to wait after the window regains focus before deciding the picker
 * was dismissed. `change` can arrive slightly after `focus`, so it needs a
 * grace period to win.
 */
const PICKER_CANCEL_GRACE_MS = 800

/**
 * Open a file picker and resolve with the chosen file's text.
 *
 * Cancellation has to settle the promise. A picker the coach dismisses fires
 * no `change`, so without this the promise stayed pending forever: one leak
 * per cancelled import, and the caller's `await` never returned, so the coach
 * got no feedback at all. `cancel` covers browsers that report it; the focus
 * fallback covers the ones that do not.
 */
function pickJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'

    let settled = false
    const claim = (): boolean => {
      if (settled) return false
      settled = true
      window.removeEventListener('focus', onFocus)
      return true
    }
    const cancel = () => {
      if (claim()) reject(new Error('No file was chosen.'))
    }
    function onFocus() {
      setTimeout(cancel, PICKER_CANCEL_GRACE_MS)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        cancel()
        return
      }
      if (!claim()) return
      file.text().then(resolve, () => reject(new Error('That file could not be read.')))
    })
    input.addEventListener('cancel', cancel)
    window.addEventListener('focus', onFocus)

    input.click()
  })
}

const api = { slugify, downloadBlob, downloadText, svgToPngBlob, boardToGifBlob, pickJsonFile }

export function useExport() {
  return api
}
