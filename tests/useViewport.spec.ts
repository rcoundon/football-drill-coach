import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useViewport, NARROW_MAX_PX, __resetViewportForTests } from '../src/composables/useViewport'

type Listener = (event: { matches: boolean }) => void

/** A controllable stand-in for matchMedia, so the tests can change viewport. */
function stubMatchMedia(initial: Record<string, boolean>) {
  const listeners = new Map<string, Set<Listener>>()
  const state = { ...initial }

  window.matchMedia = ((query: string) => ({
    get matches() {
      return state[query] ?? false
    },
    addEventListener: (_: string, listener: Listener) => {
      if (!listeners.has(query)) listeners.set(query, new Set())
      listeners.get(query)!.add(listener)
    },
    removeEventListener: (_: string, listener: Listener) => listeners.get(query)?.delete(listener),
  })) as unknown as typeof window.matchMedia

  return {
    set(query: string, matches: boolean) {
      state[query] = matches
      listeners.get(query)?.forEach((listener) => listener({ matches }))
    },
  }
}

const NARROW = `(max-width: ${NARROW_MAX_PX}px)`
const PORTRAIT = '(orientation: portrait)'

beforeEach(() => __resetViewportForTests())
afterEach(() => vi.unstubAllGlobals())

describe('useViewport', () => {
  it('reports a narrow portrait screen', () => {
    stubMatchMedia({ [NARROW]: true, [PORTRAIT]: true })
    const viewport = useViewport()
    expect(viewport.isNarrow.value).toBe(true)
    expect(viewport.isPortrait.value).toBe(true)
  })

  it('reports a wide landscape screen', () => {
    stubMatchMedia({ [NARROW]: false, [PORTRAIT]: false })
    const viewport = useViewport()
    expect(viewport.isNarrow.value).toBe(false)
    expect(viewport.isPortrait.value).toBe(false)
  })

  it('follows the screen when it changes', () => {
    const media = stubMatchMedia({ [NARROW]: false, [PORTRAIT]: false })
    const viewport = useViewport()
    media.set(NARROW, true)
    expect(viewport.isNarrow.value).toBe(true)
    media.set(NARROW, false)
    expect(viewport.isNarrow.value).toBe(false)
  })

  /**
   * Rendering must not depend on matchMedia existing: jsdom and older
   * WebViews lack it, and a hard failure there would take the whole app
   * down rather than just the layout choice.
   */
  it('falls back to a wide landscape screen where matchMedia is missing', () => {
    // @ts-expect-error deliberately removing it
    delete window.matchMedia
    const viewport = useViewport()
    expect(viewport.isNarrow.value).toBe(false)
    expect(viewport.isPortrait.value).toBe(false)
  })
})
