# Roadmap

What is worth building next, and why. Ordered by when it makes sense to do
it rather than by size.

Anything that has landed has been removed from this file; the decisions behind
those pieces live in the code and its comments.

## Editing what you have already drawn

Selection, endpoint and bend handles, box multi-select, copy and delete have
all landed. What is left:

- **Nudging with the arrow keys.** Once something is held, the keyboard is the
  obvious way to move it a metre rather than a handful. Keyboard-only is not
  enough on its own — a tablet has no arrow keys either — so anything that
  matters must also have a button.
- **Rotating or flipping a group.** Harder, and worth waiting to see whether
  anyone reaches for it.

## Frames and playback

Frames, tweening, scrubbing and playback have landed. What is left:

- **Timing one movement against another.** A run that starts before the pass
  that finds it. Every object on a frame currently moves over the same
  duration, and staggering them needs its own model and its own UI.
- **Motion paths.** A player travels in a straight line between frames. A
  curved run is expressed by adding a frame at the turn, which is usually
  enough — worth revisiting only if it turns out not to be.

## Smaller things

- **A session plan.** Several drills in one exported document, rather than a
  PNG per pattern. Coaches plan a session, not a drill.
- **Pattern folders or tags.** The library is a flat list; a coach with fifty
  patterns wants "rondos" and "pressing" apart from each other.
- **Straight-line snapping for arrows.** Lines snap to the horizontal and
  vertical; arrows deliberately do not, because an arrow traces a movement.
  Worth revisiting if squaring off a run turns out to be something coaches
  actually want.
