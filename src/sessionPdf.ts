import { jsPDF } from 'jspdf'
import type { Pattern, Session } from './types'
import { renderFrameToDataUrl } from './composables/renderFrame'
import { viewBoundsOf } from './geometry'

/** How many moments of a drill a PDF page shows. */
export const FRAMES_PER_DRILL = 4

/**
 * Which frames of a drill the PDF prints: the first, the last, and two
 * evenly spaced between them.
 *
 * A page is still and a drill is not, so something has to be dropped. The
 * ends are what a coach reads a drill by — where it starts and where it
 * finishes — and two in between are enough to show which way the movement
 * went. The captions name the true total, so a page that skipped frames says
 * so rather than implying the drill has four.
 */
export function sampleFrameIndices(count: number): number[] {
  if (count <= 0) return []
  if (count <= FRAMES_PER_DRILL) return Array.from({ length: count }, (_, i) => i)
  const last = count - 1
  return Array.from({ length: FRAMES_PER_DRILL }, (_, i) =>
    Math.round((i * last) / (FRAMES_PER_DRILL - 1)),
  )
}

const MARGIN = 15
const GUTTER = 6
/** Pitch aspect: 100 by 64.76 units. */
const BOARD_ASPECT = 100 / 64.76

export type SessionPdfInput = {
  session: Session
  patterns: Pattern[]
  onProgress?: (done: number, total: number) => void
}

/**
 * The board images for one drill, laid out to fill the width they are given.
 *
 * A single-frame drill gets the whole width: a shape or a set piece is the
 * ordinary case for one frame, and it deserves the large picture rather than
 * a quarter page beside three holes.
 *
 * The box is always sized to the same landscape pitch aspect regardless of
 * this drill's own pitch, so a mixed-orientation session still prints on a
 * straight grid — every cell in the grid is the same shape no matter which
 * drill's boards are going in it. What varies per drill is how the image is
 * placed inside its box; see `fitInBox`.
 */
function gridFor(count: number, width: number) {
  const columns = count === 1 ? 1 : 2
  const cellWidth = (width - GUTTER * (columns - 1)) / columns
  return { columns, cellWidth, cellHeight: cellWidth / BOARD_ASPECT }
}

/**
 * Fit a rectangle of the given aspect inside a box, preserving that aspect
 * and centring the result — the same "letterbox" a video player uses for a
 * mismatched frame.
 *
 * A rotated board's rasterised image is portrait where the grid's boxes are
 * landscape (see `gridFor`). Stretching it to fill the box anyway would
 * distort the pitch; scaling it down to fit and centring it keeps every
 * board true to itself and leaves the grid's rows and columns lined up.
 */
function fitInBox(boxWidth: number, boxHeight: number, aspect: number) {
  const widthIfHeightBound = boxHeight * aspect
  const width = Math.min(boxWidth, widthIfHeightBound)
  const height = width / aspect
  return {
    width,
    height,
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
  }
}

export async function buildSessionPdf({
  session,
  patterns,
  onProgress,
}: SessionPdfInput): Promise<Blob> {
  const byId = new Map(patterns.map((p) => [p.id, p]))
  const live = session.entries.filter((entry) => byId.has(entry.patternId))
  const missing = session.entries.length - live.length
  const minutes = live.reduce((sum, entry) => sum + entry.minutes, 0)

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - MARGIN * 2

  // Cover.
  doc.setFontSize(22)
  doc.text(session.name, MARGIN, MARGIN + 8)
  doc.setFontSize(11)
  // The session's own last-edited date rather than today's: two coaches
  // printing the same plan a week apart should get the same document, and
  // what dates a plan is when it was last changed.
  doc.text(
    `${new Date(session.updatedAt).toLocaleDateString()} · ${live.length} drill${live.length === 1 ? '' : 's'} · ${minutes} min`,
    MARGIN,
    MARGIN + 18,
  )
  if (missing > 0) {
    doc.text(
      `${missing} drill${missing === 1 ? '' : 's'} no longer in your library, not included.`,
      MARGIN,
      MARGIN + 25,
    )
  }

  let y = MARGIN + 38
  doc.setFontSize(12)
  live.forEach((entry, index) => {
    const pattern = byId.get(entry.patternId)!
    doc.text(`${index + 1}. ${pattern.name} — ${entry.minutes} min`, MARGIN, y)
    y += 7
  })

  for (const [index, entry] of live.entries()) {
    const pattern = byId.get(entry.patternId)!
    doc.addPage()

    doc.setFontSize(16)
    doc.text(`${index + 1}. ${pattern.name} — ${entry.minutes} min`, MARGIN, MARGIN + 6)

    const tags = pattern.tags ?? []
    let top = MARGIN + 12
    if (tags.length > 0) {
      doc.setFontSize(9)
      doc.text(tags.join(' · '), MARGIN, top)
      top += 6
    }

    const picked = sampleFrameIndices(pattern.frames.length)
    const { columns, cellWidth, cellHeight } = gridFor(picked.length, contentWidth)
    // The rasterised image's own aspect, which swaps for a rotated board —
    // see `fitInBox`.
    const bounds = viewBoundsOf(pattern.pitch)
    const boardAspect = bounds.width / bounds.height

    for (const [slot, frameIndex] of picked.entries()) {
      const image = await renderFrameToDataUrl(pattern, frameIndex)
      const column = slot % columns
      const row = Math.floor(slot / columns)
      const boxX = MARGIN + column * (cellWidth + GUTTER)
      const boxTop = top + row * (cellHeight + GUTTER + 5)
      const fitted = fitInBox(cellWidth, cellHeight, boardAspect)

      doc.addImage(
        image,
        'PNG',
        boxX + fitted.x,
        boxTop + fitted.y,
        fitted.width,
        fitted.height,
      )
      doc.setFontSize(9)
      doc.text(
        `Phase ${frameIndex + 1} of ${pattern.frames.length}`,
        boxX,
        boxTop + cellHeight + 4,
      )
    }

    const rows = Math.ceil(picked.length / columns)
    const notesTop = top + rows * (cellHeight + GUTTER + 5) + 4

    // Notes the coach has turned off are off everywhere. A session that
    // reinstated them would export something they had explicitly hidden,
    // and it frees the height notes would have used for the board grid
    // above — nothing here reserves space for text that will not print.
    const notes = pattern.notesVisible === false ? '' : (pattern.notes ?? '')
    if (notes.trim()) {
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(notes, contentWidth) as string[]
      const room = Math.max(0, Math.floor((doc.internal.pageSize.getHeight() - MARGIN - notesTop) / 5))
      doc.text(lines.slice(0, room), MARGIN, notesTop)
      if (lines.length > room) {
        doc.text('Notes continue in the app.', MARGIN, notesTop + room * 5)
      }
    }

    onProgress?.(index + 1, live.length)
  }

  return doc.output('blob') as Blob
}
