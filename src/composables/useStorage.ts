import { ref } from 'vue'
import type { Pattern } from '../types'
import type { BoardSnapshot } from './useBoard'

export const PATTERNS_KEY = 'fct.patterns.v1'
export const DRAFT_KEY = 'fct.draft.v1'

const SCHEMA_VERSION = 1

const lastError = ref<string | null>(null)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate an untrusted value as a Pattern. Throws with a readable reason. */
export function parsePattern(value: unknown): Pattern {
  if (!isObject(value)) throw new Error('That is not a saved pattern.')

  if (value.version !== SCHEMA_VERSION) {
    throw new Error(
      `This pattern was saved by a newer version of the app (version ${String(value.version)}). Update the app to open it.`,
    )
  }

  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('That pattern is missing its name or id.')
  }

  if (!isObject(value.pitch) || typeof value.pitch.type !== 'string') {
    throw new Error('That pattern is missing its pitch settings.')
  }

  if (!Array.isArray(value.drawings)) throw new Error('That pattern is missing its drawings.')

  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error('That pattern has no frames.')
  }

  for (const frame of value.frames) {
    if (!isObject(frame) || !Array.isArray(frame.counters) || !isObject(frame.ball)) {
      throw new Error('That pattern has a damaged frame.')
    }
  }

  return value as unknown as Pattern
}

function readRaw(key: string): unknown {
  const text = localStorage.getItem(key)
  if (text === null) return null
  return JSON.parse(text)
}

function writeRaw(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    lastError.value =
      name === 'QuotaExceededError'
        ? 'The browser is out of space. Export some patterns to a file and delete them to free room.'
        : 'That could not be saved to this browser.'
    return false
  }
}

function listPatterns(): Pattern[] {
  let raw: unknown
  try {
    raw = readRaw(PATTERNS_KEY)
  } catch {
    lastError.value =
      'Your saved patterns could not be read. The stored data has been left untouched so it can be recovered.'
    return []
  }

  if (raw === null) return []
  if (!Array.isArray(raw)) {
    lastError.value = 'Your saved patterns could not be read.'
    return []
  }

  const patterns: Pattern[] = []
  let dropped = 0
  for (const entry of raw) {
    try {
      patterns.push(parsePattern(entry))
    } catch {
      dropped += 1
    }
  }
  if (dropped > 0) {
    lastError.value = `${dropped} damaged pattern(s) could not be read and were skipped.`
  }
  return patterns
}

function writePatterns(patterns: Pattern[]): boolean {
  return writeRaw(PATTERNS_KEY, patterns)
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function toPattern(name: string, snap: BoardSnapshot, id: string, createdAt: string): Pattern {
  const copy = structuredClone(snap)
  return {
    id,
    name,
    version: SCHEMA_VERSION,
    pitch: copy.pitch,
    drawings: copy.drawings,
    frames: [{ counters: copy.counters, ball: copy.ball }],
    createdAt,
    updatedAt: nowIso(),
  }
}

function savePattern(name: string, snap: BoardSnapshot, id?: string): Pattern {
  const patterns = listPatterns()
  const existing = id ? patterns.find((p) => p.id === id) : undefined
  const pattern = toPattern(name, snap, existing?.id ?? id ?? makeId(), existing?.createdAt ?? nowIso())

  const index = patterns.findIndex((p) => p.id === pattern.id)
  if (index === -1) patterns.push(pattern)
  else patterns[index] = pattern

  writePatterns(patterns)
  return pattern
}

function deletePattern(id: string): void {
  writePatterns(listPatterns().filter((p) => p.id !== id))
}

function renamePattern(id: string, name: string): void {
  const patterns = listPatterns()
  const pattern = patterns.find((p) => p.id === id)
  if (!pattern) return
  pattern.name = name
  pattern.updatedAt = nowIso()
  writePatterns(patterns)
}

function patternToSnapshot(pattern: Pattern): BoardSnapshot {
  const copy = structuredClone(pattern)
  const frame = copy.frames[0]
  return {
    counters: frame.counters,
    ball: frame.ball,
    drawings: copy.drawings,
    pitch: copy.pitch,
  }
}

function saveDraft(snap: BoardSnapshot): void {
  writeRaw(DRAFT_KEY, snap)
}

function loadDraft(): BoardSnapshot | null {
  try {
    const raw = readRaw(DRAFT_KEY)
    if (!isObject(raw) || !Array.isArray(raw.counters) || !isObject(raw.pitch)) return null
    return raw as unknown as BoardSnapshot
  } catch {
    return null
  }
}

function exportPatternsJson(patterns: Pattern[]): string {
  return JSON.stringify(patterns, null, 2)
}

/**
 * Validate an exported file whole, then merge. A pattern whose id already
 * exists is added under a NEW id with a suffixed name, so importing can
 * never silently overwrite the coach's existing work.
 */
function importPatterns(json: string): Pattern[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!Array.isArray(raw)) throw new Error('That file does not contain a list of patterns.')

  const incoming = raw.map((entry) => parsePattern(entry))

  const patterns = listPatterns()
  const existingIds = new Set(patterns.map((p) => p.id))

  const added = incoming.map((pattern) => {
    if (!existingIds.has(pattern.id)) return pattern
    return { ...pattern, id: makeId(), name: `${pattern.name} (imported)` }
  })

  writePatterns([...patterns, ...added])
  return added
}

const storage = {
  listPatterns,
  savePattern,
  deletePattern,
  renamePattern,
  patternToSnapshot,
  saveDraft,
  loadDraft,
  importPatterns,
  exportPatternsJson,
  lastError,
}

export function useStorage() {
  return storage
}
