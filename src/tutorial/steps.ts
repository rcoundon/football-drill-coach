import type { useBoard } from '../composables/useBoard'

/** The board, as every goal sees it. */
export type Board = ReturnType<typeof useBoard>

export type TutorialStep = {
  /** Stable across reorders. */
  id: string
  title: string
  /** One or two sentences. Plain text, no markup. */
  body: string
  /**
   * CSS selector for the control to spotlight. Absent means a card centred
   * on the screen with nothing cut out, which is what the opening and
   * closing steps want.
   */
  anchor?: string
  /**
   * What the coach has to do. Absent means the step advances on a press,
   * which is the right control for a step that only says something.
   */
  goal?: (board: Board) => boolean
}

/**
 * The tour, in order.
 *
 * Every anchor is an attribute the app already carries for its own reasons,
 * so no component knows the tour exists. Goals are deliberately loose: they
 * ask whether the coach has done the KIND of thing the step teaches, not
 * whether they did it to the letter. Someone who drags a different player
 * has understood the lesson.
 */
export const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the drills board',
    body: 'Two minutes and you will have a drill that plays back. Anything you had on the pitch is parked safely and comes back when the tour ends.',
  },
  {
    id: 'place',
    title: 'Put some players out',
    body: 'Press a colour in the rail to drop a player in the middle, or drag one straight onto the spot you want. Put out three.',
    anchor: '[data-add-counter="red"]',
    goal: (board) => board.state.counters.length >= 3,
  },
  {
    id: 'label',
    title: 'Give one a number',
    body: 'Double-press a player and type up to four characters. Most drills read fine from colour alone, so this is for the player the session is about.',
    /*
     * A player, not a control. Pressing a colour drops players at the middle
     * of the pitch, which is exactly where a card with no anchor sits — so
     * this step used to cover the very players it was asking the coach to
     * press. Pointing at one moves the card clear and says which to press.
     */
    anchor: '[data-counter]',
    goal: (board) => board.state.counters.some((c) => c.label !== ''),
  },
  {
    id: 'phase',
    title: 'Add a phase',
    body: 'A drill is a handful of moments. Press Add phase — the new one starts as a copy of this one, so you move what is already there.',
    anchor: '[data-add-frame]',
    goal: (board) => board.state.frames.length >= 2,
  },
  {
    id: 'move',
    title: 'Move somebody',
    body: 'Drag a player somewhere new. The gap between where they stood on the last phase and where they stand on this one is their run.',
    // The same player, for the same reason. The hole does not follow them
    // mid-drag, which costs nothing: the step is over the moment they land.
    anchor: '[data-counter]',
    goal: (board) =>
      board.state.frames.some((frame, index) => {
        if (index === 0) return false
        const before = board.state.frames[index - 1]
        return frame.counters.some((counter) => {
          const was = before.counters.find((c) => c.id === counter.id)
          return !!was && (was.pos.x !== counter.pos.x || was.pos.y !== counter.pos.y)
        })
      }),
  },
  {
    id: 'ball',
    title: 'Give someone the ball',
    body: 'Drag the ball onto a player. They get a white ring and carry it wherever they run, until you drag it back onto open grass.',
    anchor: '[data-ball]',
    /*
     * Read across every phase, like the pass below: possession belongs to
     * the phase it was given on, so a coach who hands the ball over and then
     * steps to the next phase has still handed it over.
     */
    goal: (board) =>
      board.state.frames.some((frame) => frame.balls.some((b) => b.attachedTo !== null)),
  },
  {
    id: 'pass',
    title: 'Draw a pass',
    body: 'Pick Pass in the rail and drag from one player to another. Run is the same gesture with a solid arrow.',
    anchor: '[data-tool="arrow-pass"]',
    /*
     * Read across every phase, not just the one on screen: a coach who drew
     * the pass and then stepped to the next phase has still drawn it. Read
     * while the stroke is live, too, so a stroke too short to survive
     * `finishDrawing` still completes the step — choosing the tool and
     * drawing on the pitch is the lesson.
     */
    goal: (board) =>
      board.state.frames.some((frame) =>
        frame.drawings.some((d) => d.kind === 'arrow' && d.style === 'pass'),
      ),
  },
  {
    id: 'play',
    title: 'Watch it back',
    body: 'Press Play and watch the drill back. Everyone travels from where they were to where they are, over the time the phase is given.',
    anchor: '[data-play]',
    /*
     * The drill running, and nothing else. `at` is not a record of having
     * played: landing on a phase parks the playhead at that phase's start
     * time, so by the time the coach reaches this step — two phases in, and
     * standing on the second — `at` has been past zero since they pressed
     * Add phase, and a goal reading it would complete the step before they
     * could read the card. Scrubbing is out for the same reason: it moves
     * the playhead without ever playing the drill back, which is the one
     * thing this step is asking them to watch.
     */
    goal: (board) => board.playback.playing,
  },
  {
    id: 'more',
    title: "We've covered the core concepts",
    body: 'Curved runs, moving players as a group, saving to your library, sending your drills to another coach and presenting full screen are all in Help, along with every keyboard shortcut.',
    anchor: '[data-help]',
  },
]
