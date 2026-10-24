import { lintBundle, type LintResult } from './drillLint'

/**
 * Drills arriving by link rather than by file: how an agent, or a coach,
 * hands over a drill without asking anyone to download and pick a file.
 *
 * Two forms, both described in AGENTS.md:
 *
 * - `#import=<payload>` — the file itself, base64url-encoded and optionally
 *   gzipped first. In the fragment so it never reaches a server.
 * - `?import=<url>` — a JSON file elsewhere, fetched by the app. Needs the
 *   host to allow CORS, but has no size limit.
 *
 * Neither imports anything on its own. Both end at the same review the file
 * import goes through, and nothing is saved until the coach confirms it.
 */
export type ImportRequest = { kind: 'inline'; payload: string } | { kind: 'url'; url: string }

/** What the coach is shown before an import is confirmed. */
export type ImportReview = {
  json: string
  source: 'file' | 'link'
  patterns: { name: string; phases: number }[]
  sessions: { name: string; drills: number; minutes: number }[]
  lint: LintResult
}

/** Larger than any real session file, small enough to refuse a runaway fetch. */
const MAX_IMPORT_BYTES = 5_000_000

export function readImportRequest(location: { hash: string; search: string }): ImportRequest | null {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const payload = hash.get('import')
  if (payload) return { kind: 'inline', payload }
  const url = new URLSearchParams(location.search).get('import')
  if (url) return { kind: 'url', url }
  return null
}

/**
 * Take the request back out of the address bar, so a reload does not offer
 * the same import again and the link is not left behind in a bookmark.
 */
export function clearImportRequest(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('import')
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  hash.delete('import')
  url.hash = hash.toString()
  window.history.replaceState(window.history.state, '', url.toString())
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(bytes as BodyInit).body!.pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** The JSON text a `#import=` payload carries, gzipped or not. */
export async function decodeImportPayload(payload: string): Promise<string> {
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(payload)
  } catch {
    throw new Error('That import link is damaged: it could not be decoded.')
  }
  // Gzip's own magic number, so an agent without gzip to hand can send the
  // JSON plainly and the same link form still works.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      bytes = await pipe(bytes, new DecompressionStream('gzip'))
    } catch {
      throw new Error('That import link is damaged: it could not be unzipped.')
    }
  }
  return new TextDecoder().decode(bytes)
}

/** The payload for a `#import=` link: gzipped, then base64url. */
export async function encodeImportPayload(json: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip')))
}

/**
 * Fetch the file a `?import=` link names.
 *
 * HTTPS only (or this site itself): the drills are about to be shown as
 * coming from a link the coach chose to open, and a plain-HTTP fetch could
 * have been swapped on the way. No cookies go with it.
 */
export async function fetchImport(raw: string): Promise<string> {
  let url: URL
  try {
    url = new URL(raw, window.location.href)
  } catch {
    throw new Error('That import link does not name a valid address.')
  }
  if (url.protocol !== 'https:' && url.origin !== window.location.origin) {
    throw new Error('Drills can only be imported from an https:// address.')
  }
  let response: Response
  try {
    response = await fetch(url, { credentials: 'omit' })
  } catch {
    throw new Error(`The drills at ${url.host} could not be fetched. The site may not allow it.`)
  }
  if (!response.ok) throw new Error(`The drills at ${url.host} could not be fetched (${response.status}).`)
  const text = await response.text()
  if (text.length > MAX_IMPORT_BYTES) throw new Error('That file is too large to be a drill file.')
  return text
}

/** Summarise and check a file before anything in it is saved. */
export function reviewImport(json: string, source: ImportReview['source']): ImportReview {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return {
      json,
      source,
      patterns: [],
      sessions: [],
      lint: { errors: [{ where: 'file', message: 'That file is not valid JSON.' }], warnings: [], refused: true },
    }
  }
  const lint = lintBundle(raw)
  const record = (raw ?? {}) as { patterns?: unknown; sessions?: unknown }
  const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]) : [])
  const patterns = list(record.patterns).map((p) => ({
    name: String(p?.name ?? 'Untitled'),
    phases: Array.isArray(p?.frames) ? p.frames.length : 0,
  }))
  const sessions = list(record.sessions).map((s) => {
    const entries = list(s?.entries)
    return {
      name: String(s?.name ?? 'Untitled'),
      drills: entries.length,
      minutes: entries.reduce((sum, e) => sum + (typeof e?.minutes === 'number' ? e.minutes : 0), 0),
    }
  })
  return { json, source, patterns, sessions, lint }
}
