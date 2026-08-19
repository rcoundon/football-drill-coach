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

/**
 * Rasterise the live board SVG.
 *
 * The SVG is serialised to a data URL rather than a blob URL: a blob URL for
 * an SVG is treated as cross-origin by canvas, which taints it and makes
 * toBlob throw a SecurityError.
 */
/** Notes band layout, in pixels at the exported width. */
const NOTES_PADDING = 40
const NOTES_FONT_SIZE = 30
const NOTES_LINE_HEIGHT = 42

/**
 * Rasterise the board, with the drill notes in a band beneath it.
 *
 * The notes are drawn onto the canvas rather than into the SVG. Text in a
 * serialised SVG would need `foreignObject` to wrap, and that reliably
 * fails to rasterise; canvas text also lets us measure and break lines
 * properly. The board keeps its own dimensions either way — the image just
 * grows by however much the notes need, so nothing ever covers the pitch.
 */
function svgToPngBlob(svg: SVGSVGElement, notes = '', pixelWidth = 1600): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const viewBox = (clone.getAttribute('viewBox') ?? '0 0 100 65').split(/\s+/).map(Number)
  const aspect = viewBox[2] / viewBox[3]
  const width = pixelWidth
  const boardHeight = Math.round(pixelWidth / aspect)

  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(boardHeight))

  const source = new XMLSerializer().serializeToString(clone)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('This browser could not create the image.'))
        return
      }

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
          context.fillText(
            line,
            NOTES_PADDING,
            boardHeight + NOTES_PADDING + index * NOTES_LINE_HEIGHT,
          )
        })
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The image could not be created.'))
      }, 'image/png')
    }
    image.onerror = () => reject(new Error('The board could not be converted to an image.'))
    image.src = dataUrl
  })
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

const api = { slugify, downloadBlob, downloadText, svgToPngBlob, pickJsonFile }

export function useExport() {
  return api
}
