<script setup lang="ts">
/*
 * Help used to listen for Escape itself, because App's keydown handler
 * ignored every key while a dialog was open. App handles Escape ahead of that
 * guard now and closes whatever is topmost, so every dialog in the app closes
 * the same way and this panel needs no listener of its own.
 */
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; startTour: [] }>()
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-label="Help">
      <header class="head">
        <h2>Help</h2>
        <div class="button-group">
          <button data-start-tour class="chip" @click="emit('startTour')">Take the tour</button>
          <button data-close class="chip" @click="emit('close')">Close</button>
        </div>
      </header>

      <!--
        Written to be skimmed, not read through. Each section opens with the
        idea in one line, then short points a coach can find again with their
        eyes rather than by re-reading a paragraph. This panel used to be ten
        walls of prose, which is a thing nobody opens twice.
      -->
      <section data-help-section="board" class="section">
        <h3>The board</h3>
        <p class="lead">Everything on the pitch comes out of the rail's <strong>Add</strong> group.</p>
        <ul class="points">
          <li>
            Drag a colour straight onto the spot you want, or press it to drop a player in the
            middle. Either way you end up holding <strong>Move</strong>. Balls, cones and text
            labels come out the same way.
          </li>
          <li>
            Players arrive unlabelled — most drills read fine from colour and position.
            Double-press one to type up to four characters; clear the text to lose the label.
          </li>
          <li>
            Cones and text labels drop where you tap, drag with Move, and come off with Erase.
            Double-press a label to change what it says.
          </li>
          <li>
            Drop a ball on a player to give them possession: they get a white ring, and the
            ball travels with them until you drag it back onto open grass. One ball each — a
            ball dropped on someone who already has one stays where you put it.
          </li>
          <li>
            Up to eight balls, one per grid or queue or lane. <kbd>B</kbd> hides them all at
            once, rings included, and remembers who had what for when you show them again.
          </li>
        </ul>
      </section>

      <section data-help-section="drawing" class="section">
        <h3>Drawing</h3>
        <p class="lead">
          <strong>Draw</strong> is a freehand pen. <strong>Run</strong> is a solid arrow for a
          player, <strong>Pass</strong> a dashed one for the ball. <strong>Line</strong> marks
          out a zone or a third. <strong>Erase</strong> removes whatever you press.
        </p>
        <ul class="points">
          <li>
            <strong>Bend it.</strong> A Run or a Pass keeps a dot at its midpoint. Drag the dot
            off the line to bow the arrow, or along the line to slide where the bow peaks. Drag
            it back onto the line to lose the curve.
          </li>
          <li>
            <strong>Reshape it.</strong> Each end has a hollow ring. Drag a ring to move that
            end alone — a curved arrow keeps its shape, and a straight line still snaps square.
          </li>
          <li>
            <strong>Change it later.</strong> Press a drawing under Move to pick it back up: it
            gets a pale halo and its handles back. Bare grass, <kbd>Escape</kbd> or a new tool
            puts it down.
          </li>
        </ul>
      </section>

      <section data-help-section="groups" class="section">
        <h3>Several things at once</h3>
        <p class="lead">
          Under Move, drag from bare grass to draw a box. Everything inside joins a group and
          slides together, formation intact.
        </p>
        <ul class="points">
          <li>
            Holding anything opens the panel at the right-hand edge, and it is about what you
            hold: a player's colour and label, what a text label says, and
            <strong>Duplicate</strong> and <strong>Remove</strong> for the whole group.
            Duplicate leaves you holding the copy, ready to drag into place.
          </li>
          <li>
            They live in the panel rather than the top bar so they always say what they would
            act on — and because a tablet has no <kbd>Cmd+D</kbd> and no Delete key.
          </li>
          <li>
            A loose ball in the box joins the group; a carried one does not. It goes where its
            carrier goes, so you cannot lasso a ball out of someone's feet.
          </li>
        </ul>
      </section>

      <section data-help-section="drill" class="section">
        <h3>Building a drill</h3>
        <p class="lead">
          A drill is a sequence, not a picture. Build it from phases — the board at one point in
          the drill — and play it back: everything slides from one phase to the next, so you can
          show the movement instead of talking over a still image.
        </p>
        <ul class="points">
          <li>
            The dashed <strong>Add phase</strong> card copies the phase you're on, so you move
            things from where they already are. Every other card is a phase, drawn as it stands.
          </li>
          <li>
            Moving anything changes only the phase you're on. Your squad is drill-wide, though:
            adding, removing or renaming a player, cone, label or ball reaches every phase, so
            nobody appears halfway through. Copying a player copies their whole run.
          </li>
          <li>
            <strong>Timing.</strong> Each card after the first carries how long the move into it
            takes. Type over it to change it — a tenth of a second to ten, one second if you
            never say.
          </li>
          <li>
            <strong>Curving a run.</strong> A player travels in a straight line from where they
            stood before. To bend that, draw a box round them alone under Move on any phase
            after the first: a dashed trail shows the path they took to get here, with a dot at
            its middle. Drag the dot off the trail to bow the run, or along it to move where the
            bow peaks. Drag it back onto the line, or press <strong>Straighten</strong> in the
            panel, to lose the curve. A ball at their feet follows them round.
          </li>
          <li>
            <strong>Playing it.</strong> Play runs from where you are; the clock says where the
            playhead is and how long the drill lasts. Press a card to jump to it, drag one onto
            another to swap them, or use a card's <kbd>&#8943;</kbd> for Duplicate, Move earlier,
            Move later and Delete. Rewind returns to the start; the scrub bar parks anywhere,
            ticks marking each phase.
          </li>
          <li>
            Mid-play and mid-scrub the board is showing a blend of two phases, so it won't take
            an edit until you land back on one.
          </li>
        </ul>
      </section>

      <section data-help-section="presenting" class="section">
        <h3>Showing it to players</h3>
        <p class="lead">
          The expand button on the pitch, or <kbd>F</kbd>, gives the pitch the whole screen.
        </p>
        <ul class="points">
          <li>
            Everything that edits leaves — no rail, no header, no phases, no notes — and the
            pitch stops answering the pointer, so a tablet held out to a group cannot lose a
            player to somebody's thumb.
          </li>
          <li>
            What's left floats along the bottom: the way back, <kbd>&#8249;</kbd> and
            <kbd>&#8250;</kbd> to step between phases, which phase you're on, and Play. A
            one-phase drill has nothing to run, so only the corner button stays.
          </li>
          <li><kbd>Escape</kbd> comes back, and so does leaving full screen any other way.</li>
        </ul>
      </section>

      <section data-help-section="destructive" class="section">
        <h3>Taking things off</h3>
        <p class="lead">
          <strong>Clear players</strong>, <strong>Clear drawings</strong> and
          <strong>Reset the board…</strong> sit in the red group at the foot of the drill menu,
          away from what you use while drawing.
        </p>
        <ul class="points">
          <li>
            The two clears act straight away and say what they took —
            <em>Cleared 5 players</em> — with six seconds to press Undo. It's the board's own
            undo, so <kbd>Ctrl+Z</kbd> does the same thing afterwards.
          </li>
          <li>
            Reset asks first: it takes everything at once, and the board stops being the drill
            it was saved as.
          </li>
        </ul>
      </section>

      <section data-help-section="board-menus" class="section">
        <h3>The pitch, and what's drawn on it</h3>
        <ul class="points">
          <li>
            <strong>Pitch</strong> holds the three pitches — blank, full and half — as pictures
            rather than names, because what you're choosing is what the board will look like.
            Landscape and Portrait below them say which way round it currently is.
          </li>
          <li>
            <strong>View</strong> is what's drawn on it: player labels, the text you place with
            the Text tool, and switches for the balls and the notes panel.
          </li>
        </ul>
      </section>

      <section data-help-section="notes" class="section">
        <h3>Notes</h3>
        <p class="lead">
          The panel at the right-hand edge stays a strip until you press it, so the pitch starts
          with the room.
        </p>
        <ul class="points">
          <li>
            With nothing held it holds two fields: the whole drill — setup, coaching points,
            progressions — and a note for the phase you're standing on, for the point that
            applies there and nowhere else.
          </li>
          <li>Whether it's open is saved with the drill, so it comes back as you left it.</li>
        </ul>
      </section>

      <section data-help-section="saving" class="section">
        <h3>Saving and sharing</h3>
        <p class="lead">
          A drill saved once keeps saving itself — a second after you stop, the library has
          what's on screen, and the line beside the name says so. Rename it by typing over it.
        </p>
        <ul class="points">
          <li>
            <strong>The <kbd>&#9662;</kbd> menu.</strong> Save now writes it back at once, and
            asks for a name if it has never been saved. Save as… forks it under a new name;
            Duplicate does the same without asking. Open lists every saved drill for loading,
            renaming or deleting. Delete drill removes it from the library and asks first —
            what's on the board stays.
          </li>
          <li>
            <strong>Share.</strong> PNG exports the phase you're looking at, drill notes
            underneath if the notes panel is open. GIF exports the whole drill as a looping
            animation that plays inline in a message; it appears once there's more than one
            phase, since one phase is what PNG is for.
          </li>
          <li>
            <strong>Export and Import.</strong> Export writes every saved drill to one JSON
            file, for a backup or another machine. Import never overwrites: a drill whose id is
            already here arrives as a new one, marked <em>(imported)</em>.
          </li>
          <li>
            <strong>Tags</strong> file a drill under your own words. Naming one asks for them:
            tap the tags you've used before, or type new ones comma-separated. They filter the
            library rather than search it — the chips above the list narrow it to drills
            carrying every chip you press, which is how "rondo" and "u12" together find the one
            that's both.
          </li>
          <li>
            <strong>Sessions</strong>, beside Open, plan a whole training session. Add saved
            drills, set minutes against each, reorder them, and it keeps a running total.
            Export PDF builds a cover with the running order, then a page per drill with up to
            four captioned boards and its notes, where those are showing. A drill deleted out
            from under a session leaves a removable row saying so rather than vanishing.
          </li>
        </ul>
        <p class="tip">
          Everything — every saved drill, and the board in front of you — lives in this
          browser's storage alone. No account, no server. To get a drill onto another device,
          move it there yourself with Export and Import.
        </p>
      </section>

      <section data-help-section="shortcuts" class="section">
        <h3>Keyboard shortcuts</h3>
        <p class="lead">
          <kbd>Space</kbd> plays and pauses — except when a button, link or select has focus,
          where it presses the control instead.
        </p>
        <table>
          <thead>
            <tr><th>Key</th><th>What it does</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>V</kbd></td><td>Move — drag players, cones, labels and balls; bend and reshape drawings</td></tr>
            <tr><td><kbd>D</kbd></td><td>Draw — freehand pen</td></tr>
            <tr><td><kbd>R</kbd></td><td>Run — solid arrow</td></tr>
            <tr><td><kbd>P</kbd></td><td>Pass — dashed arrow</td></tr>
            <tr><td><kbd>L</kbd></td><td>Line — straight edge</td></tr>
            <tr><td><kbd>C</kbd></td><td>Cone</td></tr>
            <tr><td><kbd>T</kbd></td><td>Text</td></tr>
            <tr><td><kbd>E</kbd></td><td>Erase</td></tr>
            <tr><td><kbd>B</kbd></td><td>Show or hide every ball</td></tr>
            <tr><td><kbd>F</kbd></td><td>Show the pitch full screen, and come back</td></tr>
            <tr><td><kbd>Space</kbd></td><td>Play or pause the drill (see above)</td></tr>
            <tr><td><kbd>Ctrl+Z</kbd> / <kbd>Cmd+Z</kbd></td><td>Undo</td></tr>
            <tr><td><kbd>Ctrl+Shift+Z</kbd> / <kbd>Cmd+Shift+Z</kbd></td><td>Redo</td></tr>
            <tr><td><kbd>Ctrl+D</kbd> / <kbd>Cmd+D</kbd></td><td>Copy whatever is held</td></tr>
            <tr><td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td><td>Remove whatever is held</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Close whatever is open, or put down whatever is held</td></tr>
          </tbody>
        </table>
      </section>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: var(--scrim);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.panel {
  background: var(--surface-1); color: var(--ink-1); border-radius: 0.6rem;
  width: min(38rem, 100%); max-height: 80vh; overflow: auto; padding: 1rem;
}
.head {
  display: flex; justify-content: space-between; align-items: center;
  position: sticky; top: -1rem; margin: -1rem -1rem 0.75rem; padding: 1rem 1rem 0.75rem;
  background: var(--surface-1);
  /* The text scrolls under this, and without a line it arrives inside it. */
  border-bottom: 1px solid var(--border);
}
.head h2 { margin: 0; font-size: 1.1rem; }
.button-group { display: flex; gap: 0.5rem; }

.section { margin-bottom: 1.5rem; }
.section:last-child { margin-bottom: 0; }

/*
 * An ember tick beside every heading. The panel is one long scroll, and the
 * eye needs somewhere to land when a coach comes back looking for the part
 * they half remember.
 */
.section h3 {
  margin: 0 0 0.5rem; font-size: 1rem;
  display: flex; align-items: center; gap: 0.5rem;
}
.section h3::before {
  content: ''; width: 0.2rem; height: 1em; border-radius: 1rem;
  background: var(--brand); flex: none;
}

/* The idea, before any control is named. Brighter than the points under it. */
.lead {
  margin: 0 0 0.6rem; line-height: 1.5; font-size: 0.95rem; color: var(--ink-1);
}

.points {
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 0.5rem;
}
.points li {
  position: relative; padding-left: 0.9rem;
  line-height: 1.5; font-size: 0.9rem; color: var(--ink-2);
}
.points li::before {
  content: ''; position: absolute; left: 0; top: 0.6em;
  width: 0.3rem; height: 0.3rem; border-radius: 50%; background: var(--brand);
}
.points strong { color: var(--ink-1); }

/* The one thing in here a coach loses work by not having read. */
.tip {
  margin: 0.75rem 0 0; padding: 0.6rem 0.75rem;
  border-left: 2px solid var(--brand); border-radius: 0 0.4rem 0.4rem 0;
  background: var(--surface-2); color: var(--ink-2);
  line-height: 1.5; font-size: 0.9rem;
}

kbd {
  font-family: inherit; font-size: 0.85em; background: var(--surface-3);
  border: 1px solid var(--ring); border-radius: 0.25rem; padding: 0.05rem 0.35rem;
  color: var(--ink-1); white-space: nowrap;
}

table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); }
th { color: var(--ink-3); font-weight: 500; }
td { color: var(--ink-2); }
tbody tr:nth-child(odd) { background: #ffffff08; }

.chip {
  border: 1px solid var(--ring); background: var(--surface-3); color: inherit;
  border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem;
}

/*
 * A finger is far bigger than a mouse pointer, and this gets used at the
 * side of a pitch — the same 44px convention as the rest of the toolbar.
 */
@media (pointer: coarse) {
  .chip { min-height: 44px; padding-inline: 0.85rem; }
}
</style>
