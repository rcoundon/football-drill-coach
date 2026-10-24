import type { z } from 'zod'
import type { Vec } from './types'
import { boundsOf, distance, GOAL_MAX_WIDTH, GOAL_MIN_WIDTH, MAX_BEND_ALONG } from './geometry'
import { MAX_BALLS, MAX_LABEL_LENGTH, MAX_NOTES_LENGTH } from './composables/useBoard'
import { normaliseTags } from './composables/useStorage'
import { issuePath, PatternSchema, SessionSchema } from './schema'

/**
 * Checks a drill file written outside the app — by hand, or by an AI agent
 * following AGENTS.md — before a coach imports it.
 *
 * The schemas in schema.ts are the import's own gate, and they are run
 * first, reporting every issue with its path rather than the first one as a
 * sentence, so an agent can fix the whole file in one pass. But a schema
 * checks each thing on its own. The mistakes a file written from scratch
 * makes are often between things — a ball handed to a player id that does
 * not exist, a counter that changes id between phases and so vanishes
 * instead of running, a player stood off the edge of a half pitch. The app
 * opens all of those without complaint and shows something the author did
 * not mean.
 *
 * Errors are things the import refuses, or that open as a broken drill.
 * Warnings are things that open, but probably not as intended.
 */

export type Issue = { where: string; message: string }
/**
 * `refused` is whether the app's own import would turn the file away — set
 * by the import's checks alone, never by the stricter ones here. In the app,
 * only a refusal blocks an import: a coach's own backup can legitimately
 * hold a session naming a drill they have since deleted, or a drill saved
 * before version 3, and those must still restore.
 */
export type LintResult = { errors: Issue[]; warnings: Issue[]; refused: boolean }

/** The app trims a counter's label to this when a coach types one. */
const MAX_COUNTER_LABEL = 4

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const id of ids) (seen.has(id) ? twice : seen).add(id)
  return [...twice]
}

export function lintBundle(raw: unknown): LintResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  let refused = false
  const refuse = (where: string, message: string) => {
    refused = true
    errors.push({ where, message })
  }
  const error = (where: string, message: string) => errors.push({ where, message })
  const warn = (where: string, message: string) => warnings.push({ where, message })

  // The import requires both lists, even when one is empty.
  if (!isObject(raw) || !Array.isArray(raw.patterns) || !Array.isArray(raw.sessions)) {
    refuse('file', 'Must be an object with a "patterns" array and a "sessions" array (either may be empty).')
    return { errors, warnings, refused }
  }

  const patternIds: string[] = []
  raw.patterns.forEach((entry, index) => {
    const name = isObject(entry) && typeof entry.name === 'string' ? entry.name : '?'
    const where = `patterns[${index}] "${name}"`
    const parsed = PatternSchema.safeParse(entry)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refuse(`${where} ${issuePath(issue)}`, issue.message)
      return
    }
    patternIds.push(parsed.data.id)
    lintPattern(parsed.data, where, error, warn)
  })

  for (const id of duplicates(patternIds)) {
    // The import would keep both, renaming the second "(imported)" and
    // pointing every session entry at whichever came first.
    error('patterns', `Two patterns share the id "${id}".`)
  }

  const known = new Set(patternIds)
  const sessionIds: string[] = []
  raw.sessions.forEach((entry, index) => {
    const name = isObject(entry) && typeof entry.name === 'string' ? entry.name : '?'
    const where = `sessions[${index}] "${name}"`
    const parsed = SessionSchema.safeParse(entry)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refuse(`${where} ${issuePath(issue)}`, issue.message)
      return
    }
    {
      const session = parsed.data
      sessionIds.push(session.id)
      session.entries.forEach((e, i) => {
        // A shared file has to carry its own drills: the person importing
        // it does not have the author's library.
        if (!known.has(e.patternId)) {
          error(`${where} entries[${i}]`, `Names pattern "${e.patternId}", which is not in this file.`)
        }
      })
      for (const id of duplicates(session.entries.map((e) => e.id))) {
        error(where, `Two entries share the id "${id}".`)
      }
    }
  })
  for (const id of duplicates(sessionIds)) error('sessions', `Two sessions share the id "${id}".`)

  return { errors, warnings, refused }
}

function lintPattern(
  pattern: z.output<typeof PatternSchema>,
  where: string,
  error: (where: string, message: string) => void,
  warn: (where: string, message: string) => void,
): void {
  if (pattern.notes !== undefined && pattern.notes.length > MAX_NOTES_LENGTH) {
    warn(where, `notes is longer than the ${MAX_NOTES_LENGTH} characters the app lets a coach type.`)
  }
  if (pattern.tags !== undefined) {
    const clean = normaliseTags(pattern.tags)
    if (clean.join('\n') !== pattern.tags.join('\n')) {
      warn(where, `Tags should be lowercase, trimmed and unique; the import will store ${JSON.stringify(clean)}.`)
    }
  }

  const bounds = boundsOf(pattern.pitch.type)
  const right = bounds.x + bounds.width
  const bottom = bounds.y + bounds.height
  const offPitch = (p: Vec) => p.x < bounds.x || p.x > right || p.y < bounds.y || p.y > bottom
  const area = `x ${bounds.x}–${right}, y ${bounds.y}–${bottom}`
  const checkPos = (at: string, p: Vec) => {
    if (offPitch(p)) warn(at, `(${p.x}, ${p.y}) is outside the visible ${pattern.pitch.type} pitch (${area}).`)
  }

  pattern.goals.forEach((goal, i) => {
    const width = distance(goal.a, goal.b)
    if (width < GOAL_MIN_WIDTH - 1e-6 || width > GOAL_MAX_WIDTH + 1e-6) {
      warn(`${where} goals[${i}]`, `Posts are ${width.toFixed(2)} units apart; a goal is ${GOAL_MIN_WIDTH.toFixed(2)}–${GOAL_MAX_WIDTH.toFixed(2)} (1m–7.32m).`)
    }
    checkPos(`${where} goals[${i}].a`, goal.a)
    checkPos(`${where} goals[${i}].b`, goal.b)
  })

  let previousCounters: Set<string> | null = null
  pattern.frames.forEach((frame, f) => {
    const at = `${where} frames[${f}]`

    if (f === 0 && frame.duration !== undefined) {
      warn(at, 'The first phase\'s "duration" is ignored: nothing moves into the start of a drill. Use "hold" to pause on it.')
    }
    if (frame.note !== undefined && frame.note.length > MAX_NOTES_LENGTH) {
      warn(at, `note is longer than the ${MAX_NOTES_LENGTH} characters the app lets a coach type.`)
    }
    if (frame.balls.length > MAX_BALLS) {
      warn(at, `${frame.balls.length} balls; the app lets a coach place at most ${MAX_BALLS}.`)
    }

    const counterIds = new Set(frame.counters.map((c) => c.id))
    frame.counters.forEach((c, i) => {
      const cAt = `${at} counters[${i}] "${c.id}"`
      if (c.label.length > MAX_COUNTER_LABEL) {
        warn(cAt, `label "${c.label}" is longer than the ${MAX_COUNTER_LABEL} characters a counter shows.`)
      }
      if (c.bendAlong !== undefined && Math.abs(c.bendAlong) > MAX_BEND_ALONG) {
        warn(cAt, `bendAlong is outside ±${MAX_BEND_ALONG}; the curve doubles back on itself.`)
      }
      checkPos(cAt, c.pos)
    })

    // Playback matches players between phases by id, so a renamed id reads
    // as one player vanishing and another appearing rather than a run.
    if (previousCounters) {
      const gone = [...previousCounters].filter((id) => !counterIds.has(id))
      const fresh = [...counterIds].filter((id) => !previousCounters!.has(id))
      const changes = [
        ...(gone.length ? [`[${gone.join(', ')}] disappear`] : []),
        ...(fresh.length ? [`[${fresh.join(', ')}] appear`] : []),
      ]
      if (changes.length) {
        warn(
          at,
          `Players ${changes.join(' and ')} since the phase before. Keep a player's id the same in every phase so it runs rather than vanishing.`,
        )
      }
    }
    previousCounters = counterIds

    frame.balls.forEach((ball, i) => {
      const bAt = `${at} balls[${i}] "${ball.id}"`
      if (ball.attachedTo !== null && !counterIds.has(ball.attachedTo)) {
        error(bAt, `attachedTo names "${ball.attachedTo}", which is not a counter in this phase.`)
      }
      if (ball.attachedTo === null) checkPos(bAt, ball.pos)
    })
    frame.markers.forEach((m, i) => checkPos(`${at} markers[${i}]`, m.pos))
    frame.labels.forEach((l, i) => {
      const lAt = `${at} labels[${i}]`
      if (l.text.length > MAX_LABEL_LENGTH) {
        warn(lAt, `text is longer than the ${MAX_LABEL_LENGTH} characters the app lets a coach type.`)
      }
      checkPos(lAt, l.pos)
    })
    frame.drawings.forEach((d, i) => {
      const dAt = `${at} drawings[${i}]`
      if (d.kind === 'pen') {
        d.points.forEach((p) => checkPos(dAt, p))
        return
      }
      if (d.kind === 'arrow' && d.bendAlong !== undefined && Math.abs(d.bendAlong) > MAX_BEND_ALONG) {
        warn(dAt, `bendAlong is outside ±${MAX_BEND_ALONG}; the curve doubles back on itself.`)
      }
      checkPos(`${dAt}.from`, d.from)
      checkPos(`${dAt}.to`, d.to)
    })
  })
}
