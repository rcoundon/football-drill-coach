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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
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

/** Open a file picker and resolve with the chosen file's text. */
function pickJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('No file was chosen.'))
        return
      }
      file.text().then(resolve, () => reject(new Error('That file could not be read.')))
    }
    input.click()
  })
}

const api = { slugify, downloadBlob, downloadText, svgToPngBlob, pickJsonFile }

export function useExport() {
  return api
}
