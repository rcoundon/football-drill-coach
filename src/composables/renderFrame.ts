import { createApp } from 'vue'
import type { Pattern } from '../types'
import BoardView from '../components/BoardView.vue'
import { useExport } from './useExport'
import { useStorage } from './useStorage'

/**
 * How wide a rasterised board is, in pixels.
 *
 * Half what the PNG export uses. Each board occupies roughly a quarter of a
 * PDF page, and four frames across several drills is a great deal of canvas
 * work to do at twice the necessary resolution.
 */
export const SESSION_BOARD_WIDTH = 800

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The board could not be converted to an image.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Draw one frame of a saved drill and return it as a PNG data URL.
 *
 * The drill need not be open. A BoardView is mounted into a detached element,
 * rasterised and thrown away, so the board the coach is working on is never
 * touched — which is why a session export needs no lock, and why a failure
 * halfway through cannot strand them mid-drill.
 *
 * A detached node rasterises identically to a live one: the serialiser reads
 * the markup and the viewBox attribute, and never asks the browser for layout.
 *
 * Notes are deliberately not passed to `svgToPngBlob`. It bakes them into
 * pixels beneath the board because a still image has nowhere else to put
 * them; a PDF does, and text drawn by the PDF stays selectable and sharp.
 */
export async function renderFrameToDataUrl(
  pattern: Pattern,
  frameIndex: number,
  pixelWidth = SESSION_BOARD_WIDTH,
): Promise<string> {
  const snapshot = useStorage().patternToSnapshot(pattern)
  const frame = snapshot.frames[frameIndex]
  if (!frame) throw new Error('That drill has no such phase.')

  const host = document.createElement('div')
  const app = createApp(BoardView, {
    frame,
    pitch: snapshot.pitch,
    labelsVisible: snapshot.labelsVisible,
    counterLabelsVisible: snapshot.counterLabelsVisible,
    ballsVisible: snapshot.ballsVisible,
  })

  try {
    const instance = app.mount(host) as unknown as { svgEl: SVGSVGElement }
    const blob = await useExport().svgToPngBlob(instance.svgEl, '', pixelWidth)
    return await blobToDataUrl(blob)
  } finally {
    app.unmount()
  }
}
