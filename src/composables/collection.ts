import { ref } from 'vue'

/**
 * A stored collection: an array of entities under one localStorage key,
 * read and written with two disciplines the library has always had and the
 * sessions need identically.
 *
 * `unreadable` is the disaster case: the stored bytes could not be trusted at
 * all, and a caller that goes on to write would permanently destroy them.
 *
 * A `damaged` entry is the partial case: the rest is good and the coach must
 * still be able to save and delete, but the damaged rows are their work too,
 * so they ride along with every write rather than being dropped on the first
 * one. `writeCollection` takes them as an argument for that reason.
 */
export type CollectionRead<T> = {
  items: T[]
  unreadable: boolean
  damaged: unknown[]
}

export const lastError = ref<string | null>(null)

/**
 * Whether the most recent write actually reached localStorage. A caller that
 * wants to tell the coach "saved" has to know, because a write can be
 * refused (unreadable store) or fail (quota) while the caller still holds the
 * value it built in memory.
 */
export const lastWriteSucceeded = ref(true)

export function damagedMessage(count: number): string {
  return `${count} saved item(s) could not be read. They have been left untouched so they can be recovered.`
}

export function readCollection<T>(key: string, parse: (value: unknown) => T): CollectionRead<T> {
  const text = localStorage.getItem(key)
  // A key that was never written is an empty collection. A key holding the
  // literal `null` is not: something wrote it, and treating it as absent
  // would let the next write paint over whatever went wrong.
  if (text === null) return { items: [], unreadable: false, damaged: [] }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { items: [], unreadable: true, damaged: [] }
  }

  if (!Array.isArray(raw)) return { items: [], unreadable: true, damaged: [] }

  const items: T[] = []
  const damaged: unknown[] = []
  for (const entry of raw) {
    try {
      items.push(parse(entry))
    } catch {
      damaged.push(entry)
    }
  }
  return { items, unreadable: false, damaged }
}

export function writeRaw(key: string, value: unknown): boolean {
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

/**
 * Write the collection back, damaged rows included. Every write goes through
 * here so no code path can drop a row it merely failed to understand.
 */
export function writeCollection<T>(key: string, items: T[], damaged: unknown[]): boolean {
  return writeRaw(key, [...items, ...damaged])
}

/** Record whether a write landed, and say whether damaged rows rode through it. */
export function recordWrite(ok: boolean, damaged: unknown[]): boolean {
  lastWriteSucceeded.value = ok
  return ok && damaged.length > 0
}
