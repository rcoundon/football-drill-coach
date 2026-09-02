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
 *
 * `maxHeight` is how a hidden `notesVisible` reaches this function: when a
 * drill's notes will not print, the caller passes the full height down to
 * the page's bottom margin instead of leaving it as dead space below the
 * grid, and the grid's rows grow to use it. When notes will print, the
 * caller omits it and the grid keeps the plain width-derived height so
 * there is room left underneath for the notes block.
 *
 * `boardAspect` is this drill's own rasterised aspect (see `fitInBox`), not
 * the fixed `BOARD_ASPECT` the box shape itself is built from. It caps how
 * far a freed-height cell can grow: `fitInBox` never draws an ordinary
 * landscape board any taller than `cellWidth / boardAspect`, so height
 * claimed past that cap would sit as whitespace under a caption that no
 * longer sits under the board it names. Only a portrait (rotated) board,
 * whose own aspect is well below the box's, has real height to reclaim.
 */
function gridFor(count: number, width: number, boardAspect: number, maxHeight?: number) {
  const columns = count === 1 ? 1 : 2
  const rows = Math.ceil(count / columns)
  const cellWidth = (width - GUTTER * (columns - 1)) / columns
  const cellHeightByWidth = cellWidth / BOARD_ASPECT
  if (maxHeight === undefined) {
    return { columns, cellWidth, cellHeight: cellHeightByWidth }
  }
  // Each row costs its own cell height plus a caption line, and every gap
  // between rows costs a gutter — the same accounting the caller uses to
  // place each row (see `boxTop` below). Never shrink below the plain
  // width-derived height: a tight `maxHeight` should leave a scrap of
  // unused space, not squash the boards.
  const cellHeightByHeight = (maxHeight - rows * 5 - (rows - 1) * GUTTER) / rows
  const cellHeightCap = cellWidth / boardAspect
  return {
    columns,
    cellWidth,
    cellHeight: Math.min(Math.max(cellHeightByWidth, cellHeightByHeight), cellHeightCap),
  }
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
  const coverPageHeight = doc.internal.pageSize.getHeight()
  live.forEach((entry, index) => {
    // A long running order runs off the bottom of the cover page rather
    // than stopping — around 34 drills at 7mm a line on an A4 page. Rather
    // than truncate the plan or shrink it illegibly, it continues onto a
    // fresh page, the same way each drill's own page does further down.
    if (y > coverPageHeight - MARGIN) {
      doc.addPage()
      y = MARGIN + 8
    }
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

    // A drill with its notes turned off has nothing printed below the grid
    // (see the `notes` block further down), so the grid is handed the whole
    // remaining page rather than the plain width-derived height that would
    // otherwise leave that reclaimed space blank.
    const notesHidden = pattern.notesVisible === false
    const pageHeight = doc.internal.pageSize.getHeight()
    const availableHeight = pageHeight - MARGIN - top

    // The rasterised image's own aspect, which swaps for a rotated board —
    // see `fitInBox`. Computed before `gridFor` so it can cap how far a
    // freed-height cell is allowed to grow.
    const bounds = viewBoundsOf(pattern.pitch)
    const boardAspect = bounds.width / bounds.height

    const picked = sampleFrameIndices(pattern.frames.length)
    const { columns, cellWidth, cellHeight } = gridFor(
      picked.length,
      contentWidth,
      boardAspect,
      notesHidden ? availableHeight : undefined,
    )

    for (const [slot, frameIndex] of picked.entries()) {
      // A rasterise failure aborts the whole export rather than shipping a
      // PDF with a gap in it — but a bare canvas/SVG error names neither
      // the drill nor the phase, so it is rethrown with both stitched on
      // for whatever shows the failure notice.
      let image: string
      try {
        image = await renderFrameToDataUrl(pattern, frameIndex)
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause)
        throw new Error(
          `Could not render "${pattern.name}" (phase ${frameIndex + 1} of ${pattern.frames.length}): ${reason}`,
          { cause },
        )
      }
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
        // Under the image as actually drawn, not the cell it was drawn in —
        // a width-bound board leaves the cell's freed height below it as
        // whitespace (see `gridFor`), and a caption anchored to the cell
        // would print orphaned below that gap instead of under the board.
        boxTop + fitted.y + fitted.height + 4,
      )
    }

    const rows = Math.ceil(picked.length / columns)
    const notesTop = top + rows * (cellHeight + GUTTER + 5) + 4

    // Notes the coach has turned off are off everywhere. A session that
    // reinstated them would export something they had explicitly hidden;
    // the height they would have used already went to the grid above via
    // `notesHidden` in `gridFor`, rather than sitting here unused.
    const notes = notesHidden ? '' : (pattern.notes ?? '')
    if (notes.trim()) {
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(notes, contentWidth) as string[]
      const room = Math.max(0, Math.floor((pageHeight - MARGIN - notesTop) / 5))
      doc.text(lines.slice(0, room), MARGIN, notesTop)
      if (lines.length > room) {
        doc.text('Notes continue in the app.', MARGIN, notesTop + room * 5)
      }
    }

    onProgress?.(index + 1, live.length)
  }

  return doc.output('blob') as Blob
}
