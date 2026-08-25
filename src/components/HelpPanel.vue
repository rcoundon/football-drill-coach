<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

/**
 * The one place Help differs from PatternLibrary's shape: nothing else in
 * this app closes on Escape, because nothing else is read rather than acted
 * on. App's own keydown handler cannot do it either — it deliberately
 * ignores every key while a dialog is open, this one included, so that
 * typing behind a prompt cannot leak into the board's own shortcuts. The
 * panel is mounted for the app's whole life (App only toggles `open`), so a
 * plain module-level listener that arms and disarms with the prop is enough;
 * there is no repeated mount to leak it from.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-label="Help">
      <header class="head">
        <h2>Help</h2>
        <button data-close class="chip" @click="emit('close')">Close</button>
      </header>

      <section data-help-section="board" class="section">
        <h3>The board</h3>
        <p>
          Press a colour under Players to drop a counter, then drag it into position. Adding a new
          player switches you to Move, since dragging it somewhere is almost always the next
          thing you do.
        </p>
        <p>
          Counters arrive unlabelled — most drills read fine from colour and position alone.
          To give one a number or initials, double-press it and type up to four characters.
          Clearing the text removes the label again.
        </p>
        <p>
          Cones mark out space, tap the pitch with Cone to drop one,
          drag it with Move, and take it off with Erase. Text works the same way: tap to drop
          a label, then drag or double-press it to change what it says.
        </p>
        <p>
          Drop a ball on a player to give them possession — they get a white ring and the ball
          travels with them from then on. Drag it onto open grass to let it go. A player holds
          one ball at a time, so a ball dropped on someone who already has one stays free where
          you dropped it rather than taking theirs.
        </p>
        <p>
          A drill can have up to eight balls: one per rondo grid, per queue, per lane.
          <strong>+ Ball</strong> puts another out, and Erase takes one off the way it takes off
          a cone. A drill with none at all is fine — a shape or pressing session has no ball in
          it. Balls look alike, because footballs do: in a rondo it does not matter which is
          which.
        </p>
        <p>
          The Ball button (or <kbd>B</kbd>) hides every ball at once, and takes the possession
          rings with them, since nobody can hold a ball that isn't there. It is not the same as
          removing them: the board remembers where each one was and who had it, and hands them
          all back when you show them again.
        </p>
      </section>

      <section data-help-section="drawing" class="section">
        <h3>Drawing</h3>
        <p>
          Draw is a freehand pen. Run is a solid arrow for a player's movement, Pass a dashed
          one for the ball's. Line marks out a zone, channel or third with a straight edge.
          Erase removes whatever you press.
        </p>
        <p>
          A Run or a Pass keeps a small dot at its midpoint while you're working on it. Drag
          the dot out from the line to bow the arrow, or along the line to slide where the
          bow peaks — an even curve for a pass bent round a defender, an early one for a run
          that curves away and straightens. Drag the dot back onto the straight line to lose
          the curve again.
        </p>
        <p>
          Each end of the arrow or line you just drew has a hollow ring. Drag a ring to move
          that end on its own — a curved arrow keeps its shape while its ends move, and a
          straight line still snaps to the horizontal or vertical.
        </p>
        <p>
          To change a drawing after the fact, press it under Move to pick it back up. It gets
          a pale halo and its handles back: drag its body to slide the whole thing, a ring to
          move an end, the dot to bend it. Press bare grass, press <kbd>Escape</kbd>, or
          change tool to put it down again.
        </p>
      </section>

      <section data-help-section="groups" class="section">
        <h3>Working with several things at once</h3>
        <p>
          Under Move, drag from bare grass to draw a box. Every player, cone, label and
          drawing inside it joins a group and gets a highlight. Drag any one of them and the
          whole group slides together, formation intact.
        </p>
        <p>
          Copy duplicates whatever the group is holding, drops the copy a little down and to
          the right, and leaves you holding the copy — ready to drag straight into place.
          Delete takes the whole group off in one press. Both sit beside Undo rather than
          behind ☰ More, because a tablet has no <kbd>Cmd+D</kbd> and no Delete key, and
          those buttons are the only way in on the device this board is mostly used on.
        </p>
        <p>
          A plain press on grass, <kbd>Escape</kbd>, or switching tool puts the group down
          again. A loose ball inside the box joins the group like anything else, but one a
          player is carrying does not — it goes where its carrier goes, so it comes along only
          if they were in the box too. You cannot lasso a ball out of someone's feet.
        </p>
      </section>

      <section data-help-section="drill" class="section">
        <h3>Building a drill</h3>
        <p>
          A drill is not one picture — it's a sequence a team is walked through. Build it as a
          set of phases, each one the board at a single point in the drill: where everyone
          stands, what's drawn, who has a ball. Play it back and the board slides everything
          from one phase to the next, so a coach can show the movement rather than talk over a
          still image.
        </p>
        <p>
          <strong>+ Add a phase</strong> adds one, an exact copy of the phase you're on — same
          players, same positions, same balls — so you're moving things from where they already
          are rather than starting again from nothing.
        </p>
        <p>
          Moving a player, drawing on the board, or dropping a ball only changes the phase
          you're currently on — earlier and later phases are untouched. Your squad, though, is
          the same in every phase: adding, removing or renaming a player, cone, label or ball
          reaches
          the whole drill at once, so nobody can appear or disappear partway through it. Only
          where things stand, and what's drawn, differs from phase to phase — which is also why
          a drawing belongs to the phase it describes: the arrow showing a pass is there while
          the pass happens, and rubbing it out only clears it from the phase you're looking at.
        </p>
        <p>
          Copy follows the same rule for players: duplicating one copies its whole run, so the
          copy repeats the same movement, offset, through every phase — not just where the
          original happens to stand right now.
        </p>
        <p>
          Every phase after the first has a <strong>Takes</strong> field: how long, in seconds,
          the move into that phase takes. There's nothing to move into the very first phase, so
          the field is hidden there. It accepts anything from a tenth of a second to ten
          seconds, and if you never set it, a phase takes one second to arrive.
        </p>
        <p>
          Play (▶) watches the drill from where you are; the numbered chips jump straight to a
          phase, ◀ and ▶ move the phase you're on earlier or later, and Delete phase removes
          it — a drill always keeps at least one. Rewind returns to the start, and the scrub
          slider lets you park on any point by hand. While the drill is playing, or while
          you're dragging the slider, the board is showing a blend between two phases rather
          than a phase itself, so it won't take an edit until you land back on one.
        </p>
      </section>

      <section data-help-section="saving" class="section">
        <h3>Saving and sharing</h3>
        <p>
          Save writes the drill you have open back to itself; if the board has never been
          saved, it asks for a name first. Save as… forks the board into a new drill under a
          new name, leaving the original as it was. Open lists every saved drill, for loading,
          renaming or deleting.
        </p>
        <p>
          PNG exports the phase you're looking at as an image — drill notes come with it, in a
          band under the pitch, if the notes panel is showing. GIF exports the whole drill as a
          looping animation instead, so it plays inline in a message or a document; it appears
          once there's more than one phase, since a single phase is what PNG is for.
        </p>
        <p>
          Export writes every saved drill to a single JSON file, for a backup or for moving
          them to another machine. Import reads one back in — it never overwrites: a drill
          whose id already exists on this device arrives as a new one, with
          <em>(imported)</em> added to its name.
        </p>
        <p>
          Everything — every saved drill, and the board you're working on right now — lives
          in this browser's own storage only. There's no account and no server, so a drill
          you want on another device or another browser has to be moved there yourself, with
          Export and Import.
        </p>
      </section>

      <section data-help-section="shortcuts" class="section">
        <h3>Keyboard shortcuts</h3>
        <p>
          <kbd>Space</kbd> plays and pauses the drill, except when a button, link or select has
          focus — those already act on <kbd>Space</kbd> themselves, so pressing it there
          presses the control instead of starting playback.
        </p>
        <table>
          <thead>
            <tr><th>Key</th><th>What it does</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>V</kbd></td><td>Move — drag players, cones, labels and balls; bend and reshape drawings</td></tr>
            <tr><td><kbd>P</kbd></td><td>Draw — freehand pen</td></tr>
            <tr><td><kbd>R</kbd></td><td>Run — solid arrow</td></tr>
            <tr><td><kbd>S</kbd></td><td>Pass — dashed arrow</td></tr>
            <tr><td><kbd>L</kbd></td><td>Line — straight edge</td></tr>
            <tr><td><kbd>C</kbd></td><td>Cone</td></tr>
            <tr><td><kbd>T</kbd></td><td>Text</td></tr>
            <tr><td><kbd>E</kbd></td><td>Erase</td></tr>
            <tr><td><kbd>B</kbd></td><td>Show or hide every ball</td></tr>
            <tr><td><kbd>Space</kbd></td><td>Play or pause the drill (see above)</td></tr>
            <tr><td><kbd>Ctrl+Z</kbd> / <kbd>Cmd+Z</kbd></td><td>Undo</td></tr>
            <tr><td><kbd>Ctrl+Shift+Z</kbd> / <kbd>Cmd+Shift+Z</kbd></td><td>Redo</td></tr>
            <tr><td><kbd>Ctrl+D</kbd> / <kbd>Cmd+D</kbd></td><td>Copy whatever is held</td></tr>
            <tr><td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td><td>Remove whatever is held</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Put down whatever is held</td></tr>
          </tbody>
        </table>
      </section>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: #000000aa;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.panel {
  background: #263238; color: #eceff1; border-radius: 0.6rem;
  width: min(38rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem;
}
.head {
  display: flex; justify-content: space-between; align-items: center;
  position: sticky; top: -1rem; margin: -1rem -1rem 0.75rem; padding: 1rem 1rem 0.75rem;
  background: #263238;
}
.head h2 { margin: 0; font-size: 1.1rem; }
.section { margin-bottom: 1.25rem; }
.section:last-child { margin-bottom: 0; }
.section h3 { margin: 0 0 0.4rem; font-size: 1rem; }
.section p { margin: 0 0 0.6rem; line-height: 1.45; font-size: 0.9rem; }
.section p:last-child { margin-bottom: 0; }
kbd {
  font-family: inherit; font-size: 0.85em; background: #37474f; border: 1px solid #ffffff40;
  border-radius: 0.25rem; padding: 0.05rem 0.35rem;
}
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #ffffff26; }
.chip { border: 1px solid #ffffff40; background: #455a64; color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }

/*
 * A finger is far bigger than a mouse pointer, and this gets used at the
 * side of a pitch — the same 44px convention as the rest of the toolbar.
 */
@media (pointer: coarse) {
  .chip { min-height: 44px; padding-inline: 0.85rem; }
}
</style>
