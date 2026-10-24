import { describe, it, expect } from 'vitest'
import demoDrills from '../docs/demo-drills.json'
import { lintBundle } from '../src/drillLint'

/** The smallest drill the import accepts: one phase, one player. */
function drill(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    name: 'Drill',
    version: 3,
    pitch: { type: 'full', rotated: false },
    frames: [{ counters: [{ id: 'p1', color: 'red', label: '', pos: { x: 50, y: 30 } }], markers: [], labels: [], balls: [], drawings: [] }],
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    ...overrides,
  }
}

function bundle(patterns: unknown[], sessions: unknown[] = []) {
  return { patterns, sessions }
}

function messages(result: { errors: { message: string }[]; warnings: { message: string }[] }) {
  return { errors: result.errors.map((i) => i.message), warnings: result.warnings.map((i) => i.message) }
}

describe('lintBundle', () => {
  it('passes the demo drills shipped in docs/, so the example agents copy stays valid', () => {
    expect(lintBundle(demoDrills)).toEqual({ errors: [], warnings: [], refused: false })
  })

  it('passes a minimal drill', () => {
    expect(lintBundle(bundle([drill()]))).toEqual({ errors: [], warnings: [], refused: false })
  })

  it('refuses a file without both lists, as the import does', () => {
    expect(lintBundle({ patterns: [drill()] })).toMatchObject({ refused: true })
    expect(lintBundle([drill()]).errors).toHaveLength(1)
  })

  it("reports the schema's refusal with where it is", () => {
    const result = lintBundle(bundle([drill({ frames: [] })]))
    expect(result.refused).toBe(true)
    expect(result.errors.map((i) => i.where)).toEqual(['patterns[0] "Drill" frames'])
  })

  it('reports every schema issue, not only the first', () => {
    const bad = drill({ pitch: { type: 'third', rotated: false } })
    bad.frames[0].counters[0].color = 'green'
    const result = lintBundle(bundle([bad]))
    expect(result.refused).toBe(true)
    expect(result.errors.map((i) => i.where)).toEqual([
      'patterns[0] "Drill" pitch.type',
      'patterns[0] "Drill" frames[0].counters[0].color',
    ])
  })

  it('does not count its own stricter errors as a refusal', () => {
    const session = {
      id: 's1', name: 'Tuesday', version: 1,
      entries: [{ id: 'e1', patternId: 'elsewhere', minutes: 10 }],
      createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z',
    }
    const result = lintBundle(bundle([drill()], [session]))
    expect(result.errors).toHaveLength(1)
    expect(result.refused).toBe(false)
  })

  it('refuses a ball handed to a player who is not in the phase', () => {
    const bad = drill()
    bad.frames[0].balls = [{ id: 'b1', pos: { x: 0, y: 0 }, attachedTo: 'nobody' }] as never
    expect(messages(lintBundle(bundle([bad]))).errors[0]).toContain('"nobody"')
  })

  it('refuses two players sharing an id in one phase', () => {
    const bad = drill()
    bad.frames[0].counters.push({ ...bad.frames[0].counters[0] })
    const result = lintBundle(bundle([bad]))
    expect(result.refused).toBe(true)
    expect(result.errors[0].where).toBe('patterns[0] "Drill" frames[0].counters')
  })

  it('refuses a session naming a drill that is not in the file', () => {
    const session = {
      id: 's1', name: 'Tuesday', version: 1,
      entries: [{ id: 'e1', patternId: 'elsewhere', minutes: 10 }],
      createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z',
    }
    expect(messages(lintBundle(bundle([drill()], [session]))).errors[0]).toContain('not in this file')
  })

  it('warns when a player changes id between phases, which reads as vanishing', () => {
    const d = drill()
    d.frames.push({ ...d.frames[0], counters: [{ ...d.frames[0].counters[0], id: 'p2' }] })
    const { errors, warnings } = messages(lintBundle(bundle([d])))
    expect(errors).toEqual([])
    expect(warnings[0]).toContain('[p1] disappear and [p2] appear')
  })

  it('warns about a player off the visible half pitch', () => {
    const d = drill({ pitch: { type: 'half', rotated: false } })
    d.frames[0].counters[0].pos = { x: 10, y: 30 }
    expect(messages(lintBundle(bundle([d]))).warnings[0]).toContain('outside the visible half pitch (x 25–75')
  })

  it('warns about tags the import would rewrite', () => {
    const { warnings } = messages(lintBundle(bundle([drill({ tags: ['Rondo', 'rondo '] })])))
    expect(warnings[0]).toContain('["rondo"]')
  })
})
