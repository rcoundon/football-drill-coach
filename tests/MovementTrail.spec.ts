import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MovementTrail from '../src/components/MovementTrail.vue'
import { curveControlPoint } from '../src/geometry'

const base = { from: { x: 10, y: 10 }, to: { x: 30, y: 10 }, color: '#c33' }

describe('MovementTrail', () => {
  it('draws a straight path when there is no bend', () => {
    const trail = mount(MovementTrail, { props: base })
    expect(trail.find('[data-movement-trail]').attributes('d')).toBe('M 10 10 L 30 10')
  })

  it('draws the quadratic the bend describes', () => {
    const trail = mount(MovementTrail, { props: { ...base, bend: 6, bendAlong: 0.1 } })
    const control = curveControlPoint(base.from, base.to, 6, 0.1)
    expect(trail.find('[data-movement-trail]').attributes('d')).toBe(
      `M 10 10 Q ${control.x} ${control.y} 30 10`,
    )
  })

  it('takes the colour of the player it belongs to', () => {
    const trail = mount(MovementTrail, { props: base })
    expect(trail.find('[data-movement-trail]').attributes('stroke')).toBe('#c33')
  })

  it('is stripped from an export', () => {
    const trail = mount(MovementTrail, { props: base })
    expect(trail.find('[data-transient]').exists()).toBe(true)
  })
})
