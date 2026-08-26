import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BallToken, {
  BALL_HIT_RADIUS_ATTACHED,
  BALL_HIT_RADIUS_FREE,
} from '../src/components/BallToken.vue'
import {
  BALL_OFFSET,
  COUNTER_RADIUS,
  COUNTER_SPACING,
  SNAP_RADIUS,
  useBoard,
  __resetBoardForTests,
} from '../src/composables/useBoard'

beforeEach(() => __resetBoardForTests())

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

  /**
   * Possession is resolved against where the ball is DRAWN, not only against
   * counter centres, so the snap radius does not have to reach the offset.
   * It must stay under COUNTER_SPACING instead: a snap radius wider than the
   * gap between counters leaves a laid-out squad with nowhere on the pitch a
   * coach can put the ball down and have it stay free.
   */
  it('keeps the snap radius inside the gap between counters', () => {
    expect(SNAP_RADIUS).toBeLessThan(COUNTER_SPACING)
  })

  /**
   * The board's first counter lands at the pitch centre. A ball starting
   * there sits its 3.2-unit hit circle right on top of the counter's 2.4-unit
   * body, so the coach's very first action — drop a player, drag it — grabs
   * the ball instead.
   */
  it('starts the ball clear of where the first counter lands', () => {
    const board = useBoard()
    const first = board.addCounter('red')
    const gap = Math.hypot(
      board.ballPosition(board.state.balls[0].id).x - first.pos.x,
      board.ballPosition(board.state.balls[0].id).y - first.pos.y,
    )
    expect(gap).toBeGreaterThanOrEqual(COUNTER_RADIUS + BALL_HIT_RADIUS_FREE)
  })
})
