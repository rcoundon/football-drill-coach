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
function svgToPngBlob(svg: SVGSVGElement, pixelWidth = 1600): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const viewBox = (clone.getAttribute('viewBox') ?? '0 0 100 65').split(/\s+/).map(Number)
  const aspect = viewBox[2] / viewBox[3]
  const width = pixelWidth
  const height = Math.round(pixelWidth / aspect)

  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const source = new XMLSerializer().serializeToString(clone)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('This browser could not create the image.'))
        return
      }
      context.drawImage(image, 0, 0, width, height)
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
