<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CounterColor, ToolMode } from '../types'
import { COUNTER_COLORS, PITCH_H, PITCH_W } from '../geometry'
import { MAX_BALLS, useBoard } from '../composables/useBoard'
import { startPlacementDrag, type PlacementKind } from '../composables/usePlacement'
import { DRAW_COLORS, DRAW_COLOR_NAMES, SWATCHES, TOOLS } from './controls'
import BoardMenus from './BoardMenus.vue'

const props = withDefaults(
  defineProps<{
    tool: ToolMode
    drawColor: string
    /**
     * Lay the rail along the bottom rather than down the edge. Below about
     * a tablet's width a column costs the pitch more than it is worth.
     */
    horizontal?: boolean
  }>(),
  { horizontal: false },
)

const emit = defineEmits<{
  'update:tool': [tool: ToolMode]
  'update:drawColor': [color: string]
  /** A text label needs its words before it can be placed, so App asks. */
  addLabel: []
}>()

const board = useBoard()

const railEl = ref<HTMLElement | null>(null)

/**
 * Move between tools with the arrow keys, the way a radio group is expected
 * to work — and choose as you go, because a tool is chosen by arriving at
 * it. Tab reaches the group once and leaves it once, rather than stopping
 * eight times on the way past.
 */
function onToolKeydown(index: number, event: KeyboardEvent): void {
  const keys: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
  }
  const step = keys[event.key]
  if (step === undefined) return
  event.preventDefault()
  const next = (index + step + TOOLS.length) % TOOLS.length
  emit('update:tool', TOOLS[next].id)
  // Focus follows the selection, or the coach's next arrow press starts
  // from where they were rather than from where they are.
  const buttons = railEl.value?.querySelectorAll<HTMLElement>('[data-tool]')
  buttons?.[next]?.focus()
}

/**
 * Lucide outline paths, inlined rather than pulled in as a package: eight
 * icons is a smaller thing to own than a dependency, and the rail is the
 * only place in the app drawing them. `dashed` marks the stroke that gives
 * Run its dashes, which is what tells it apart from Pass at a glance.
 */
const TOOL_ICONS: Record<ToolMode, { d: string; dashed?: boolean }[]> = {
  select: [
    { d: 'M12 2v20' }, { d: 'm15 19-3 3-3-3' }, { d: 'm19 9 3 3-3 3' },
    { d: 'M2 12h20' }, { d: 'm5 9-3 3 3 3' }, { d: 'm9 5 3-3 3 3' },
  ],
  pen: [
    { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' },
    { d: 'm15 5 4 4' },
  ],
  'arrow-run': [{ d: 'M18 8l4 4-4 4' }, { d: 'M2 12h20', dashed: true }],
  'arrow-pass': [{ d: 'M5 12h14' }, { d: 'm12 5 7 7-7 7' }],
  line: [{ d: 'M5 12h14' }],
  cone: [{ d: 'M13.73 4a2 2 0 0 0-3.46 0L2.6 17a2 2 0 0 0 1.73 3h15.34a2 2 0 0 0 1.73-3z' }],
  text: [{ d: 'M12 4v16' }, { d: 'M4 7V4h16v3' }, { d: 'M9 20h6' }],
  erase: [
    { d: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' },
    { d: 'M22 21H7' }, { d: 'm5 11 9 9' },
  ],
}

/**
 * The keys App.vue actually listens for. Kept in the tooltip so the rail
 * teaches the shortcut that works, rather than one it would be nice to have.
 */
const TOOL_KEYS: Record<ToolMode, string> = {
  select: 'V',
  pen: 'D',
  'arrow-run': 'R',
  'arrow-pass': 'P',
  line: 'L',
  cone: 'C',
  text: 'T',
  erase: 'E',
}

/**
 * A new player arrives where the board decides, which is rarely where the
 * coach wants them, so the next thing they do is drag them. Switching to
 * Move saves a trip to the tool row for a step that follows nearly every
 * time — and unlike Cone, a colour swatch is not a tool the coach chose to
 * stay in, so there is nothing to switch back to.
 *
 * The toolbar does the same thing. Both are covered by their own tests, so
 * the two layouts cannot drift apart on this.
 */
function addPlayer(color: CounterColor): void {
  board.addCounter(color)
  if (props.tool !== 'select') emit('update:tool', 'select')
}

/** A drill may have eight balls. Past that the pitch stops being readable. */
const atBallCap = computed(() => board.state.balls.length >= MAX_BALLS)

const addBallTitle = computed(() => {
  if (!board.state.ballsVisible) return 'Show the balls before putting another one out'
  if (atBallCap.value) return `A drill can have ${MAX_BALLS} balls at most`
  if (board.isDerived.value) return lockedTitle
  return 'Drag a ball onto the pitch, or press for the middle'
})

/** Why the whole Add group refuses mid-move. */
const lockedTitle = 'A player appearing mid-drill is never what anyone meant'

/**
 * Press to drop in the middle, drag to drop where you let go. Both are
 * started by the same press, so the coach does not have to decide which
 * gesture they are making before they make it.
 */
function beginPlacement(what: PlacementKind, event: PointerEvent, onTap: () => void): void {
  if (board.isDerived.value) return
  startPlacementDrag(what, event, onTap)
}

function placePlayer(color: CounterColor, event: PointerEvent): void {
  beginPlacement({ kind: 'player', color }, event, () => addPlayer(color))
}

function placeBall(event: PointerEvent): void {
  if (atBallCap.value || !board.state.ballsVisible) return
  beginPlacement({ kind: 'ball' }, event, () => board.addBall())
}

function placeCone(event: PointerEvent): void {
  // Straight to Move afterwards, like a player: a cone dropped on the pitch
  // is one the coach is about to nudge into place, and the Cone tool is for
  // laying out a line of them rather than for the one just placed.
  beginPlacement({ kind: 'cone' }, event, () => {
    board.addMarker({ x: PITCH_W / 2, y: PITCH_H / 2 })
    if (props.tool !== 'select') emit('update:tool', 'select')
  })
}

function placeText(event: PointerEvent): void {
  beginPlacement({ kind: 'text' }, event, () => emit('addLabel'))
}
</script>

<template>
  <!--
    The modes a coach changes constantly, down the edge the hand holding a
    tablet is already on. Everything used once per drill stays in the bar
    across the top.
  -->
  <nav
    ref="railEl"
    :class="['rail', { 'rail--horizontal': horizontal }]"
    aria-label="Players and tools"
  >
    <div class="rail-scroll">
    <!--
      What the drill is made of, said out loud. The swatches used to be an
      unlabelled run of colour with no hint that they were the way a player
      got onto the pitch at all.
    -->
    <div class="rail-group rail-group--add">
      <span class="eyebrow">Add</span>
      <div class="disc-grid">
        <button
          v-for="color in COUNTER_COLORS"
          :key="color"
          :data-add-counter="color"
          class="swatch"
          :style="{ background: SWATCHES[color] }"
          :disabled="board.isDerived.value"
          :title="board.isDerived.value ? lockedTitle : `Drag a ${color} player onto the pitch, or press for the middle`"
          :aria-label="`Add a ${color} player`"
          @pointerdown="placePlayer(color, $event)"
        />
      </div>

      <div class="disc-grid disc-grid--objects">
        <button
          data-add-ball
          class="object"
          :disabled="atBallCap || !board.state.ballsVisible || board.isDerived.value"
          :title="addBallTitle"
          aria-label="Add a ball"
          @pointerdown="placeBall($event)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5 8.5 10l1.3 4h4.4l1.3-4z" /><path d="M12 3v4.5M4.2 14 9.8 14M19.8 14 14.2 14" /></svg>
        </button>
        <button
          data-add-cone
          class="object"
          :disabled="board.isDerived.value"
          title="Drag a cone onto the pitch, or press for the middle"
          aria-label="Add a cone"
          @pointerdown="placeCone($event)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.73 4a2 2 0 0 0-3.46 0L2.6 17a2 2 0 0 0 1.73 3h15.34a2 2 0 0 0 1.73-3z" /></svg>
        </button>
        <button
          data-add-text
          class="object"
          :disabled="board.isDerived.value"
          title="Drag a text label onto the pitch, or press for the middle"
          aria-label="Add a text label"
          @pointerdown="placeText($event)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16" /><path d="M4 7V4h16v3" /><path d="M9 20h6" /></svg>
        </button>
      </div>

      <p class="helper">Drag on, or press to drop in the middle.</p>
    </div>

    <!--
      One tool is in force at any moment, which the row of identical pills
      never said out loud. A radio group says it to a screen reader and the
      ember fill says it across a pitch-side tablet held at arm's length.
    -->
    <div class="rail-group rail-group--tools" role="radiogroup" aria-label="Tool">
      <span class="eyebrow">Tools</span>
      <button
        v-for="(t, index) in TOOLS"
        :key="t.id"
        :data-tool="t.id"
        :class="['rail-tool', { 'is-active': tool === t.id }]"
        role="radio"
        :aria-checked="tool === t.id"
        :tabindex="tool === t.id ? 0 : -1"
        :title="`${t.label}  ${TOOL_KEYS[t.id]}`"
        @keydown="onToolKeydown(index, $event)"
        @click="emit('update:tool', t.id)"
      >
        <svg
          class="rail-tool-icon"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            v-for="(p, i) in TOOL_ICONS[t.id]"
            :key="i"
            :d="p.d"
            :stroke-dasharray="p.dashed ? '4 3' : undefined"
          />
        </svg>
        <span class="rail-tool-label">{{ t.label }}</span>
      </button>
    </div>

    </div>

    <div class="rail-group rail-group--colors">
      <span class="eyebrow">Ink</span>
      <button
        v-for="c in DRAW_COLORS"
        :key="c"
        :data-draw-color="c"
        class="swatch swatch--sm"
        :class="{ 'is-active': drawColor === c }"
        :style="{ background: c }"
        :title="`Draw in ${DRAW_COLOR_NAMES[c] ?? c}`"
        :aria-label="`Draw in ${DRAW_COLOR_NAMES[c] ?? c}`"
        @click="emit('update:drawColor', c)"
      />
    </div>

    <div class="rail-group rail-group--menus">
      <BoardMenus vertical />
    </div>
  </nav>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  /*
   * A fixed width, because a segmented control that changes width with its
   * longest label is not a segmented control. 88px is the widest tool item
   * plus the rail's own padding.
   */
  width: 88px;
  flex: none;
  padding: 0.6rem 0.5rem;
  background: var(--surface-1);
  border-radius: var(--radius-card);
  /*
   * Visible, so the Pitch and View popovers can stand clear of an 88px
   * rail. The part that needs clipping does its own.
   */
  overflow: visible;
}

/*
 * Only the tools and the things you can add scroll. Ink and the two board
 * menus are pinned below them, because a control that scrolls off the
 * bottom of a rail is a control a coach cannot find.
 */
.rail-scroll {
  flex: 1; min-height: 0; width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
  overflow-y: auto;
  /*
   * A hairline in reserved space, rather than the platform's own bar.
   *
   * On a Mac set to show scrollbars always, the default one is 15px of an
   * 88px rail — a sixth of it — and it is drawn OVER the swatches rather
   * than beside them. `scrollbar-gutter` keeps its 6px whether or not the
   * rail is currently long enough to scroll, so nothing shifts sideways the
   * moment it is.
   */
  scrollbar-width: thin;
  scrollbar-color: var(--ring) transparent;
  scrollbar-gutter: stable;
}
.rail-scroll::-webkit-scrollbar { width: 6px; }
.rail-scroll::-webkit-scrollbar-track { background: transparent; }
.rail-scroll::-webkit-scrollbar-thumb {
  background: var(--ring);
  border-radius: 3px;
}
.rail-scroll::-webkit-scrollbar-thumb:hover { background: var(--ink-3); }

.rail-group { display: flex; flex-direction: column; gap: 0.35rem; align-items: stretch; }

.rail-group--add { align-items: center; gap: 0.4rem; }

/*
 * Two discs to a row rather than five down the rail: five in a column is
 * most of a tablet's height spent on colour, and the rail still has tools
 * and ink to fit under it.
 */
.disc-grid { display: grid; grid-template-columns: repeat(2, auto); gap: 0.35rem; justify-content: center; }
/* Three objects in a two-column grid: the last one sits under the first. */
.disc-grid--objects { grid-template-columns: repeat(2, auto); }

.object {
  width: 30px; height: 30px; display: grid; place-items: center;
  border: 1px solid var(--border); background: var(--surface-2); color: var(--ink-1);
  border-radius: var(--radius-control); cursor: pointer; padding: 0;
  touch-action: none;
}
.object:hover:not(:disabled) { background: var(--surface-3); }
.object:disabled { opacity: 0.4; cursor: default; }

.eyebrow {
  width: 100%;
  font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3); text-align: center;
}

/*
 * Said once, where the discs are, because the drag is the interaction a
 * coach will not guess at. The press is the one they will find anyway.
 */
.helper { margin: 0; font-size: 0.6rem; line-height: 1.3; text-align: center; color: var(--ink-3); }

/*
 * Stretched to the rail's full width, padding included, so an active tool's
 * marker can sit flush against the edge the pitch is on.
 */
.rail-group--tools { align-self: stretch; margin-inline: -0.5rem; gap: 0.15rem; }

/* Draw colours are small enough to pair up rather than run down the rail. */
.rail-group--colors { flex: none; flex-direction: row; flex-wrap: wrap; justify-content: center; }

/*
 * Last down the rail, and pushed to the bottom: which pitch and what is
 * drawn on it are settled once and then left alone, unlike everything
 * above them.
 */
.rail-group--menus { flex: none; padding-top: 0.5rem; border-top: 1px solid var(--border); width: 100%; }

.rail-tool {
  position: relative;
  width: 100%;
  min-height: 46px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.15rem;
  border: none; background: transparent; color: var(--ink-3);
  border-radius: 0.75rem; cursor: pointer; padding: 0.3rem 0;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), background 180ms linear, color 180ms linear;
}
.rail-tool-label {
  font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
}
.rail-tool:hover { background: #ffffff0f; color: var(--ink-1); transform: translateY(-1px); }
.rail-tool:active { transform: translateY(0) scale(0.97); }
.rail-tool:focus-visible { outline: 2px solid #ff6b35; outline-offset: -2px; }

.rail-tool.is-active {
  background: var(--brand-gradient);
  color: #ffffff;
  box-shadow: 0 6px 16px -8px rgba(238, 10, 36, 0.55);
  transform: none;
}
/* The bar on the pitch-facing edge: the active tool is what the pitch obeys. */
.rail-tool.is-active::after {
  content: ''; position: absolute; top: 6px; bottom: 6px; right: 0; width: 3px;
  border-radius: 3px 0 0 3px; background: #ff6b35;
}

.swatch {
  /*
   * 30px with a mouse, 44px under a finger. The rail carries eight tools
   * under these, and a column of full-size discs pushed Erase off the
   * bottom of a 1000px screen.
   */
  width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid var(--ring); cursor: pointer; padding: 0;
  align-self: center;
  /*
   * The browser's own touch gestures would otherwise win: without this, a
   * finger dragged off a swatch scrolls the rail instead of carrying a
   * player out to the pitch.
   */
  touch-action: none;
}
.swatch:disabled { opacity: 0.4; cursor: default; }
.swatch--sm { width: 1.5rem; height: 1.5rem; }
.swatch.is-active { border-color: #ffffff; }

/*
 * Lying down: the same groups, the same order, read left to right instead
 * of top to bottom. Nothing is removed — a control a coach learnt on a
 * tablet is in the same rail on a phone, just along a different edge.
 */
.rail--horizontal {
  flex-flow: row wrap;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: auto;
  padding: 0.5rem 0.6rem;
}
/*
 * Wraps onto a second line rather than scrolling sideways. Lying down, the
 * strip shares its width with whatever the inspector is not using, and the
 * tools — the most-used group in the rail — ended up entirely behind a
 * horizontal scroll: 822px of controls in a 284px window. A second row of
 * 50px costs a phone less than a hidden toolset does.
 */
.rail--horizontal .rail-scroll {
  flex-flow: row wrap;
  align-items: center;
  justify-content: center;
  width: auto;
  row-gap: 0.35rem;
  overflow: visible;
}
/*
 * Each group keeps its label, upright and beside its controls rather than
 * above them. Turning the labels on their side to save width made the same
 * word read differently depending on which way the rail was lying, and
 * letting the groups wrap let the widest of them squeeze the tools down to
 * a sliver — a flex item that wraps takes the room it is left, not the room
 * it needs.
 */
.rail--horizontal .rail-group {
  /*
   * Shrinkable and wrapping, both deliberately. A group that can do
   * neither runs straight out of the strip and over whatever is beside it
   * — eight tools are 464px, and a phone sharing its width with the notes
   * panel has nothing like that to give.
   */
  /*
   * A line each, wrapping within itself. Sharing lines let Ink ride up
   * beside the tools and read as part of them, and a group that could
   * neither shrink nor wrap ran straight out of the strip and over the
   * notes panel beside it — eight tools are 464px, and a phone has nothing
   * like that to give.
   */
  flex: 0 1 100%;
  flex-flow: row wrap;
  align-items: center;
  justify-content: center;
  min-width: 0;
  gap: 0.3rem;
}
.rail--horizontal .rail-group--tools {
  align-self: center;
  margin-inline: 0;
}
/* Five discs in a row rather than two: the strip has width and no height. */
.rail--horizontal .disc-grid { grid-template-columns: repeat(5, auto); }
.rail--horizontal .disc-grid--objects { grid-template-columns: repeat(3, auto); }
/*
 * `flex: none` as well as a width: a flex child shrinks below its width by
 * default, and eight tools sharing what the strip has left is how the whole
 * group ended up a sliver between Add and Ink.
 */
.rail--horizontal .rail-tool { width: 58px; flex: none; }
.rail--horizontal .swatch,
.rail--horizontal .object { flex: none; }
.rail--horizontal .rail-tool.is-active::after { display: none; }
/* Under the rest rather than beside it, now that every group has a line. */
.rail--horizontal .rail-group--menus {
  flex-wrap: nowrap;
  align-items: center;
  width: auto;
  padding-top: 0.35rem;
  padding-left: 0;
  border-left: none;
  border-top: 1px solid var(--border);
}
/* No room for a sentence along the bottom; the tooltips still carry it. */
.rail--horizontal .helper { display: none; }
.rail--horizontal .eyebrow { flex: none; width: auto; }

/*
 * Short screens: the rail carries the same fifteen controls, drawn smaller,
 * rather than putting the last of them behind a scroll. A laptop at 1080
 * with a dock and a browser chrome has around 700px to give it, which the
 * full-size rail overruns by about the height of one tool.
 */
@media (max-height: 900px) {
  .rail { gap: 0.35rem; }
  .rail-scroll { gap: 0.35rem; }
  /*
   * The icon and the padding set a tool's height, not `min-height`, so both
   * have to come down for the rail to lose a row's worth of space.
   */
  .rail-tool { min-height: 0; padding: 0.15rem 0; gap: 0; }
  .rail-tool-icon { width: 18px; height: 18px; }
  .rail-tool-label { font-size: 9px; }
  .swatch { width: 26px; height: 26px; }
  .object { width: 26px; height: 26px; }
  .helper { display: none; }
}

@media (pointer: coarse) {
  /* A finger needs its 44px whatever the screen height says. */
  .rail-tool { min-height: 44px; }
  .swatch { width: 44px; height: 44px; }
  .swatch--sm { width: 36px; height: 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .rail-tool { transition: background 180ms linear, color 180ms linear; }
  .rail-tool:hover, .rail-tool:active { transform: none; }
}
</style>
