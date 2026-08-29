import { describe, it, expect } from 'vitest'
import { LABEL_INK, SWATCHES, TOKEN_CASING } from '../src/components/controls'
import type { CounterColor } from '../src/types'

/**
 * The palette lives in one `:root` block in App.vue, and every component
 * reaches it by name. A token that is used but never defined does not fail
 * a build, does not fail a type check, and does not throw at runtime — the
 * colour simply does not arrive, and the control renders transparent. This
 * is the only thing that would notice.
 */
const sources = import.meta.glob('../src/**/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const app = Object.entries(sources).find(([path]) => path.endsWith('App.vue'))![1]

const defined = new Set(Array.from(app.matchAll(/^\s*(--[a-z0-9-]+):/gm), (m) => m[1]))

describe('the design tokens', () => {
  it('are all defined where the components look for them', () => {
    const missing: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      for (const match of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(match[1])) missing.push(`${path}: ${match[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  /**
   * A token defined as itself renders as nothing at all. It happened once,
   * to three of them, when the palette was swept in.
   */
  it('are not defined in terms of themselves', () => {
    const circular = Array.from(app.matchAll(/^\s*(--[a-z0-9-]+):\s*var\(\1\)/gm), (m) => m[1])
    expect(circular).toEqual([])
  })

  it('cover the warm-charcoal surfaces the board is built from', () => {
    for (const token of ['--bg-app', '--surface-1', '--surface-2', '--ink-1', '--brand-gradient']) {
      expect(defined.has(token)).toBe(true)
    }
  })
})

/**
 * Contrast, measured rather than eyeballed.
 *
 * A palette drifts one shade at a time, and the shade that finally makes a
 * label unreadable looks no different from the one before it. WCAG asks
 * 4.5:1 of text this size, and these are the pairs the board actually puts
 * on screen.
 */
function channel(value: number): number {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The first stop of a gradient, which is the lightest place text sits on it. */
function firstStop(gradient: string): string {
  return gradient.match(/#[0-9a-fA-F]{6}/)![0]
}

const AA = 4.5

describe('what a coach can actually read', () => {
  /**
   * White on the yellow disc is 1.4:1 — no contrast at all — which is why
   * yellow is the one colour whose label is written in the board's near
   * black instead.
   */
  it('writes every player label against its own disc', () => {
    for (const color of Object.keys(SWATCHES) as CounterColor[]) {
      expect(contrast(LABEL_INK[color], SWATCHES[color])).toBeGreaterThanOrEqual(AA)
    }
  })

  /**
   * The active tool, the Play button and the segmented control all put white
   * on this. The brighter ember it replaced managed 2.84:1 at its lightest
   * point, which made the tool a coach was holding the least readable thing
   * on the board.
   */
  it('carries white on the ember behind text', () => {
    for (const token of ['--brand-gradient', '--button-gradient']) {
      const value = app.match(new RegExp(`${token}:([^;]+);`))![1]
      expect(contrast('#ffffff', firstStop(value))).toBeGreaterThanOrEqual(AA)
    }
  })

  it('carries white on the solid red the confirm buttons use', () => {
    const solid = app.match(/--error-solid:\s*(#[0-9a-fA-F]{6})/)![1]
    expect(contrast('#ffffff', solid)).toBeGreaterThanOrEqual(AA)
  })

  it('reads its three inks against the surfaces they sit on', () => {
    const value = (token: string) => app.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`))![1]
    const surfaces = [value('--surface-1'), value('--surface-2'), value('--field-bg')]
    for (const surface of surfaces) {
      expect(contrast(value('--ink-1'), surface)).toBeGreaterThanOrEqual(AA)
    }
  })

  /**
   * The handoff drew this ring at `rgba(0,0,0,.22)`, which over grass is
   * 1.44:1 — decoration rather than an edge. Solid, it is the boundary
   * every disc leans on, so it has to clear the 3:1 that non-text contrast
   * asks for against the pitch and against the white markings a player
   * frequently stands on.
   */
  it('gives every token an edge against the grass and the markings', () => {
    const PITCH = '#2e7d32'
    expect(contrast(TOKEN_CASING, PITCH)).toBeGreaterThanOrEqual(3)
    expect(contrast(TOKEN_CASING, '#ffffff')).toBeGreaterThanOrEqual(3)
  })
})
