import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BallToken, {
  BALL_HIT_RADIUS_ATTACHED,
  BALL_HIT_RADIUS_FREE,
} from '../src/components/BallToken.vue'
import { BALL_OFFSET, COUNTER_RADIUS, SNAP_RADIUS } from '../src/composables/useBoard'

function hitRadius(attached: boolean): number {
  const wrapper = mount(BallToken, { props: { pos: { x: 50, y: 30 }, attached } })
  const hit = wrapper.find('[data-ball]').element.lastElementChild as Element
  return Number(hit.getAttribute('r'))
}

/**
 * The ball's transparent hit circle is painted after the counters, so
 * wherever it overlaps a counter it wins the press. With the offset and hit
 * radius the board shipped with, that overlap swallowed the counter's own
 * centre: pressing the middle of a player in possession grabbed the ball,
 * and dragging a player who has the ball is the most common action on a
 * tactics board.
 */
describe('an attached ball does not cover the player holding it', () => {
  it('leaves the whole drawn counter clear of the ball hit circle', () => {
    const offset = Math.hypot(BALL_OFFSET.x, BALL_OFFSET.y)
    expect(offset - BALL_HIT_RADIUS_ATTACHED).toBeGreaterThanOrEqual(COUNTER_RADIUS)
  })

  it('keeps the ball comfortably grabbable with a fingertip', () => {
    // Roughly a 44px target on a tablet-sized board, the usual touch minimum.
    expect(BALL_HIT_RADIUS_ATTACHED).toBeGreaterThanOrEqual(2.2)
  })

  it('uses the tighter hit circle only while attached', () => {
    expect(hitRadius(true)).toBe(BALL_HIT_RADIUS_ATTACHED)
    expect(hitRadius(false)).toBe(BALL_HIT_RADIUS_FREE)
    expect(BALL_HIT_RADIUS_FREE).toBeGreaterThan(BALL_HIT_RADIUS_ATTACHED)
  })

  it('keeps the snap radius wide enough to reach the offset the ball rides at', () => {
    // Otherwise a tap on an attached ball, released where it sits, drops
    // possession: the release lands further from the counter than it snaps.
    expect(SNAP_RADIUS).toBeGreaterThan(Math.hypot(BALL_OFFSET.x, BALL_OFFSET.y))
  })
})
