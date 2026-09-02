<script setup lang="ts">
/*
 * Help used to listen for Escape itself, because App's keydown handler
 * ignored every key while a dialog was open. App handles Escape ahead of that
 * guard now and closes whatever is topmost, so every dialog in the app closes
 * the same way and this panel needs no listener of its own.
 */
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
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
          Drag a colour out of the rail's Add group straight onto the spot you want, or press
          it to drop a player in the middle and drag them into position from there. Either way you end up
          holding Move, since dragging a new player somewhere is almost always the next thing
          you do. Balls, cones and text labels are placed the same way, from the same group.
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
          The ball in the rail's <strong>Add</strong> group puts another out, and Erase takes
          one off the way it takes off a cone. A drill with none at all is fine — a shape or pressing session has no ball in
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
          Picking anything up opens the panel at the right-hand edge, and the panel is about
          whatever you are holding: a player's colour and label, what a text label says, and
          <strong>Duplicate</strong> and <strong>Remove</strong> for the whole selection.
          Duplicate drops the copy a little down and to the right and leaves you holding it,
          ready to drag into place; Remove takes everything held off in one press. They live
          there rather than in the bar across the top so that they always say what they would
          act on — and because a tablet has no <kbd>Cmd+D</kbd> and no Delete key, so on the
          device this board is mostly used on they are the only way in.
        </p>
        <p>
          A plain press on grass, <kbd>Escape</kbd>, or switching tool puts the group down
          again. A loose ball inside the box joins the group like anything else, but a ball
          a player is carrying does not — it goes where its carrier goes, so it comes along
          only if they were in the box too. You cannot lasso a ball out of someone's feet.
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
          The dashed <strong>Add phase</strong> card at the end of the strip adds one, an exact
          copy of the phase you're on — same players, same positions, same balls — so you're
          moving things from where they already are rather than starting again from nothing.
          Every other card in the strip is a phase, drawn as it stands, with its number in one
          corner and how long it takes in the other.
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
          Every phase after the first carries its duration in the corner of its card: how long,
          in seconds, the move into that phase takes. Type over it on the phase you're on to
          change it. There's nothing to move into the very first phase, so it has no duration at
          all. It accepts anything from a tenth of a second to ten seconds, and if you never set
          it, a phase takes one second to arrive.
        </p>
        <p>
          Play watches the drill from where you are, and the clock beside it says where the
          playhead is and how long the whole drill runs. Press a card to jump to that phase, or
          drag it onto another card to reorder the two. Each card's <kbd>⋯</kbd> button holds
          Duplicate phase, Move earlier, Move later and Delete phase, and acts on that card
          rather than on whichever phase you happen to be on — a drill always keeps at least
          one. Rewind returns to the start, and the scrub bar parks the drill on any point by
          hand; the ticks along it are where each phase begins. While the drill is playing, or
          while you're dragging the scrub bar, the board is showing a blend between two phases
          rather than a phase itself, so it won't take an edit until you land back on one.
        </p>
      </section>

      <section data-help-section="presenting" class="section">
        <h3>Showing it to players</h3>
        <p>
          The expand button in the corner of the pitch, or <kbd>F</kbd>, gives the pitch the
          whole screen — and the whole display too, where the browser allows it. Everything
          that edits leaves: no rail, no header, no phases, no notes, and the pitch itself
          stops answering the pointer, so a tablet held out to a group cannot lose a player to
          somebody's thumb.
        </p>
        <p>
          What is left floats at the bottom of a drill with more than one phase: the way back,
          <kbd>‹</kbd> and <kbd>›</kbd> to step between phases, the phase you are on, and Play.
          A single-phase drill has nothing to run, so only the corner button stays.
          <kbd>Escape</kbd> comes back, and so does leaving full screen by any other route.
        </p>
      </section>

      <section data-help-section="destructive" class="section">
        <h3>Taking things off</h3>
        <p>
          <strong>Clear players</strong>, <strong>Clear drawings</strong> and
          <strong>Reset the board…</strong> sit in the red group at the foot of the drill menu,
          away from the controls you use while drawing. The two clears do it straight away and
          say what they took — <em>Cleared 5 players</em> — with an Undo you have six seconds to
          press; it is the board's own undo, so <kbd>Ctrl+Z</kbd> does the same thing afterwards.
          Reset asks first, because it takes everything at once and the board stops being the
          drill it was saved as.
        </p>
      </section>

      <section data-help-section="board-menus" class="section">
        <h3>The pitch, and what is drawn on it</h3>
        <p>
          <strong>Pitch</strong> holds the three pitches — blank, full and half — shown as
          pictures rather than named, because what you are choosing between is what the board
          will look like. Under them, Landscape and Portrait say which way round the board
          currently is rather than offering to turn it.
        </p>
        <p>
          <strong>View</strong> is what is drawn on that pitch: <strong>Player labels</strong> is
          what is written on the players themselves, <strong>Text labels</strong> is the text you
          place on the grass with the Text tool, and the other two switches are the balls and the
          notes panel at the right-hand edge.
        </p>
      </section>

      <section data-help-section="notes" class="section">
        <h3>Notes</h3>
        <p>
          The panel at the right-hand edge is a strip until you press it, so the pitch starts
          with the room. With nothing held it holds two fields: notes for the whole drill —
          setup, coaching points, progressions — and a note for the phase you are standing on,
          for the point that applies there and nowhere else. Whether the panel is open is saved
          with the drill, so a drill you work on with the notes up comes back that way.
        </p>
      </section>

      <section data-help-section="saving" class="section">
        <h3>Saving and sharing</h3>
        <p>
          A drill that has been saved once keeps saving itself: a second after you stop
          changing it, the library has what is on screen, and the line beside the drill's name
          in the header says so. Rename it by typing over that name.
        </p>
        <p>
          Everything else about the drill lives in the <kbd>▾</kbd> menu beside its name.
          Save now writes it back immediately rather than waiting; on a board that has never
          been saved it asks for a name first. Save as… forks the board into a new drill under
          a new name, leaving the original as it was, and Duplicate does the same without
          asking, naming the copy for you. Open lists every saved drill, for loading, renaming
          or deleting. Delete drill removes the drill you have open from the library and asks
          first — what is on the board stays there.
        </p>
        <p>
          The Share menu takes a drill out of the app. PNG exports the phase you're looking at as an image — drill notes come with it, in a
          band under the pitch, if the notes panel is open. GIF exports the whole drill as a
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
        <p>
          <strong>Tags</strong> file a drill under whatever words you give it. Naming a drill
          asks for them too: tap the tags you have already used, and type any new ones
          comma-separated, so "rondo, warm up" gives it two. Tags filter the library rather than
          search it — the row of chips above the list narrows it to drills carrying every chip
          you've pressed, which is how "rondo" and "u12" together find the one drill that is
          both. The Tags button on a row changes them later. Save a copy as… starts the copy
          with the original's tags already chosen, since a copy of a rondo is still a rondo.
        </p>
        <p>
          <strong>Sessions</strong>, beside Open in the same <kbd>▾</kbd> menu, plan a whole
          training session rather than one drill. Name a session, add saved drills to it —
          filtered by tag, the same way the library is — set minutes against each and reorder
          them, and it keeps its own running total. Export PDF builds one document: a cover
          with the running order and total time, then a page per drill with up to four
          captioned boards and its notes, ready to print or hand to an assistant coach. A drill
          deleted out from under a session leaves a removable row saying so rather than
          vanishing quietly, and the PDF skips it the same way.
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
}
.head h2 { margin: 0; font-size: 1.1rem; }
.section { margin-bottom: 1.25rem; }
.section:last-child { margin-bottom: 0; }
.section h3 { margin: 0 0 0.4rem; font-size: 1rem; }
.section p { margin: 0 0 0.6rem; line-height: 1.45; font-size: 0.9rem; }
.section p:last-child { margin-bottom: 0; }
kbd {
  font-family: inherit; font-size: 0.85em; background: var(--surface-2); border: 1px solid #ffffff40;
  border-radius: 0.25rem; padding: 0.05rem 0.35rem;
}
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); }
.chip { border: 1px solid #ffffff40; background: var(--surface-3); color: inherit; border-radius: 0.4rem; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.8rem; }

/*
 * A finger is far bigger than a mouse pointer, and this gets used at the
 * side of a pitch — the same 44px convention as the rest of the toolbar.
 */
@media (pointer: coarse) {
  .chip { min-height: 44px; padding-inline: 0.85rem; }
}
</style>
