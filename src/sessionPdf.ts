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
