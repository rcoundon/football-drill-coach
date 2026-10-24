import { z } from 'zod'
import type { Ball, Counter, Drawing, Frame, Goal, Label, Marker, Pattern, Session, Vec } from './types'

/**
 * The drill file format, defined once.
 *
 * Every way a drill enters the app goes through these: the library read back
 * from localStorage, the autosaved draft, a file import and an import link.
 * The build also turns `BundleSchema` into the JSON Schema published at
 * /drill.schema.json, so agents writing drills read the same definition the
 * app checks them against. The `describe` text is written for them.
 *
 * Only the current format is accepted. There are no older saved drills to
 * migrate, so there is no migration.
 *
 * The hand-written types in types.ts stay, because their comments are what a
 * reader of the code needs; the `satisfies` checks at the bottom keep the two
 * from drifting apart.
 */

/** A finite number: NaN or Infinity reaches the renderer as an unreadable path. */
const num = z.number().refine(Number.isFinite, 'Must be a finite number')

export const VecSchema = z
  .object({ x: num, y: num })
  .describe('A position in pitch units. x 0-100 runs goal line to goal line; y 0-64.76 runs touchline to touchline, pointing down. 1 metre = 0.952 units.')

const id = z.string().min(1)

const bend = num
  .optional()
  .describe('How far the path bows off the straight line, in pitch units; the sign picks the side. Absent or 0 is straight.')
const bendAlong = num
  .optional()
  .describe('Where along the path the bow peaks, as a fraction either side of the midpoint (-0.25 to 0.25). Positive leans towards the end.')

export const CounterSchema = z.object({
  id: id.describe('Keep the same id for this player in every phase, or playback cannot animate them.'),
  color: z.enum(['red', 'blue', 'yellow', 'purple', 'black']),
  label: z.string().describe('Up to 4 characters, e.g. a shirt number. Empty for none.'),
  pos: VecSchema,
  bend: bend.describe('Curves this player\'s run INTO this phase. Ignored on the first phase.'),
  bendAlong,
})

export const MarkerSchema = z.object({ id, pos: VecSchema }).describe('A cone.')

export const GoalSchema = z
  .object({
    id,
    a: VecSchema.describe('One post.'),
    b: VecSchema.describe('The other post, 0.95-6.97 units (1-7.32 m) from the first.'),
    flipped: z.boolean().optional().describe('The net sits a quarter turn clockwise from a->b; true puts it on the other side.'),
  })
  .describe('A portable goal. Drill-wide: the same on every phase.')

export const LabelSchema = z.object({ id, pos: VecSchema, text: z.string() }).describe('Short text on the pitch.')

export const BallSchema = z.object({
  id: id.describe('Keep the same id in every phase so the ball can be followed.'),
  pos: VecSchema.describe('Where a loose ball lies. Ignored while a player has it.'),
  attachedTo: z
    .string()
    .nullable()
    .describe('The id of a counter in the SAME phase who has the ball, or null for a loose ball.'),
})

const PenSchema = z.object({ id, kind: z.literal('pen'), color: z.string(), points: z.array(VecSchema) })
const ArrowSchema = z.object({
  id,
  kind: z.literal('arrow'),
  color: z.string().describe('A hex colour, e.g. "#ffffff".'),
  style: z.enum(['run', 'pass']).describe('"run" is solid, "pass" is dashed.'),
  from: VecSchema,
  to: VecSchema,
  bend,
  bendAlong,
})
const LineSchema = z
  .object({ id, kind: z.literal('line'), color: z.string(), from: VecSchema, to: VecSchema })
  .describe('A straight line with no arrowhead: zone edges, channels, thirds.')

export const DrawingSchema = z.discriminatedUnion('kind', [PenSchema, ArrowSchema, LineSchema])

/** Two things of one kind answering to the same id move, and erase, as one. */
function uniqueIds<T extends { id: string }>(schema: z.ZodType<T>) {
  return z
    .array(schema)
    .refine((list) => new Set(list.map((item) => item.id)).size === list.length, 'Two items share an id')
}

export const FrameSchema = z
  .object({
    counters: uniqueIds(CounterSchema).describe('Every player on the board at this moment, including those standing still.'),
    markers: uniqueIds(MarkerSchema).default([]),
    labels: uniqueIds(LabelSchema).default([]),
    balls: uniqueIds(BallSchema).default([]),
    drawings: uniqueIds(DrawingSchema).default([]).describe('Arrows and lines describing what happens in this phase.'),
    note: z.string().optional().describe('A coaching point for this phase only.'),
    duration: num.positive().optional().describe('Milliseconds the move INTO this phase takes. Default 1000. Ignored on the first phase.'),
    hold: num.nonnegative().optional().describe('Milliseconds to pause on this phase once it arrives.'),
  })
  .describe('One phase: the whole board at one moment. Playback animates from each phase to the next, matching things by id.')

const PitchSchema = z.object({
  type: z
    .enum(['blank', 'full', 'half', 'half-right'])
    .describe('"half" shows x 25-75 with its goal at x=25; "half-right" the same with its goal at x=75; "blank" is unmarked grass.'),
  rotated: z.boolean().describe('Display only: turns the board to portrait. Never changes coordinates.'),
})

export const PatternSchema = z
  .object({
    id,
    name: z.string(),
    version: z.literal(3),
    pitch: PitchSchema,
    labelsVisible: z.boolean().default(true),
    counterLabelsVisible: z.boolean().default(true),
    ballsVisible: z.boolean().default(true),
    notes: z.string().default('').describe('Setup, coaching points and progressions for the whole drill.'),
    notesVisible: z.boolean().default(true),
    goals: uniqueIds(GoalSchema).default([]),
    tags: z.array(z.string()).optional().describe('Lowercase, trimmed, unique: "rondo", "pressing", "u12".'),
    frames: z.array(FrameSchema).min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .describe('One drill.')

export const SessionSchema = z
  .object({
    id,
    name: z.string(),
    version: z.literal(1),
    entries: z.array(
      z.object({
        id,
        patternId: z.string().describe('The id of a pattern in the same file.'),
        minutes: num.positive(),
      }),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .describe('A training session: drills run in order, with minutes against each.')

export const BundleSchema = z
  .object({
    patterns: z.array(PatternSchema),
    sessions: z.array(SessionSchema),
  })
  .describe('A Tactics Board drill file. Import it with the drill menu\'s Import..., or open it as /#import=<base64url of this JSON>.')

/** The autosaved working board: a drill's content without its library identity. */
export const SnapshotSchema = z.object({
  frames: z.array(FrameSchema).min(1),
  currentFrame: z.number().int().nonnegative().default(0),
  labelsVisible: z.boolean().default(true),
  counterLabelsVisible: z.boolean().default(true),
  ballsVisible: z.boolean().default(true),
  notes: z.string().default(''),
  notesVisible: z.boolean().default(true),
  goals: uniqueIds(GoalSchema).default([]),
  pitch: PitchSchema,
})

/**
 * What a failed parse tells the coach. One plain sentence naming the part of
 * the drill that is wrong; the issue's path is for an agent's validator, not
 * for a coach looking at an import that did not work.
 */
const PART: Record<string, string> = {
  frames: 'frame',
  counters: 'player position',
  balls: 'ball position',
  markers: 'cone position',
  labels: 'label',
  drawings: 'drawing',
  goals: 'goal',
  duration: 'frame duration',
  hold: 'phase pause',
  note: 'phase note',
  notes: 'notes',
  tags: 'tags',
  entries: 'drill',
}

export function describeIssue(kind: 'pattern' | 'session', issue: z.core.$ZodIssue, value: unknown): string {
  const path = issue.path.map(String)
  const top = path[0]
  if (path.length === 0) return `That is not a saved ${kind}.`
  if (top === 'version') {
    const found = (value as { version?: unknown }).version
    if (kind === 'session') return 'That session was saved by a different version of this app.'
    // Only a newer drill is fixed by updating; an older one never will be.
    return typeof found === 'number' && found > 3
      ? `That pattern was saved by a newer version of this app (version ${found}). Update the app to open it.`
      : `That pattern is in an older format (version ${String(found)}) that this app no longer opens.`
  }
  if (top === 'id' || top === 'name') return `That ${kind} is missing its name or id.`
  if (top === 'createdAt' || top === 'updatedAt') return `That ${kind} is missing when it was created or last saved.`
  if (top === 'pitch') return `That ${kind} is missing its pitch settings.`
  if (top === 'frames' && path.length === 1) return `That ${kind} has no frames.`
  const part = [...path].reverse().find((segment) => segment in PART)
  return `That ${kind} has a damaged ${part ? PART[part] : top}.`
}

/** Parse, or throw the first issue as a sentence a coach can read. */
export function parseWith<T>(schema: z.ZodType<T>, kind: 'pattern' | 'session', value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new Error(describeIssue(kind, result.error.issues[0], value))
}

/**
 * Where an issue is, as a path an agent can find in its own file:
 * `frames[1].counters[0].color`.
 */
export function issuePath(issue: z.core.$ZodIssue): string {
  return issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, '')
}

// The schemas and the hand-written types must describe the same thing.
type Out<S extends z.ZodType> = z.output<S>
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _vec: Same<Out<typeof VecSchema>, Vec> = true
const _counter: Same<Out<typeof CounterSchema>, Counter> = true
const _marker: Same<Out<typeof MarkerSchema>, Marker> = true
const _goal: Same<Out<typeof GoalSchema>, Goal> = true
const _label: Same<Out<typeof LabelSchema>, Label> = true
const _ball: Same<Out<typeof BallSchema>, Ball> = true
const _drawing: Same<Out<typeof DrawingSchema>, Drawing> = true
const _frame: Same<Out<typeof FrameSchema>, Frame> = true
const _session: Same<Out<typeof SessionSchema>, Session> = true
// A parsed pattern has its defaults filled in, so it is a Pattern with more
// fields guaranteed — assignable one way, which is the way that matters.
const _pattern: Out<typeof PatternSchema> extends Pattern ? true : false = true
void [_vec, _counter, _marker, _goal, _label, _ball, _drawing, _frame, _session, _pattern]
