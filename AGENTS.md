# Writing drills for the Tactics Board

This guide is for AI agents (and people) writing drill files by hand. The app
imports a single JSON file holding drills and, optionally, training sessions
that run several drills in order. Write the file, check it, and hand it to the
coach as a link or a file.

Working on the app's own code instead? See `README.md`.

## Where things are

The site publishes everything an agent needs, next to the app:

| Path | What |
| --- | --- |
| `/agents.md` | This guide |
| `/drill.schema.json` | JSON Schema (draft 2020-12) for the whole file, generated from the schema the app validates imports with. Use it for structured output. |
| `/demo-drills.json` | Six valid drills and a session to copy from |
| `/llms.txt` | A short summary pointing at the above |

In the repository these are `AGENTS.md`, `src/schema.ts` and
`docs/demo-drills.json`.

## Workflow

1. Write a JSON file in the shape below, or to `/drill.schema.json`. Copy
   patterns from `/demo-drills.json`.
2. Check it. With the repository:

   ```bash
   npm run validate -- path/to/drills.json
   ```

   Exit code 0 means it imports cleanly. Fix every `error`; each one names
   its place in the file, like `frames[1].counters[0].color`. Read every
   `warning`: the drill will still open, but probably not as you meant it.

   Without the repository, validate against `/drill.schema.json`, then work
   through the checklist at the end of this guide. The app runs the same
   checks when the coach opens the file, and lists any problems before they
   confirm.
3. Hand it over, preferably as a link (see below). Otherwise, as a file the
   coach imports from the drill menu (the arrow next to the drill's name) with
   **Import…**.

Either way, the coach sees what the file holds and presses **Import** before
anything is saved. Imported drills appear in the library. An imported session
appears under **Sessions**, where **Review** steps through its drills on the
board. A link that carries a session opens its plan straight away.

Importing never overwrites anything. A drill whose `id` is already in the
library is added again under a new id with "(imported)" after its name, and
the file's sessions are updated to point at the new id.

## Sharing as a link

Put the whole file in the link's fragment, base64url-encoded. Gzip it first
to keep the link short (the app detects gzip itself):

```
https://<the site>/#import=<base64url(gzip(file))>
```

```python
import base64, gzip, json
payload = base64.urlsafe_b64encode(gzip.compress(json.dumps(bundle).encode())).decode().rstrip("=")
link = f"https://<the site>/#import={payload}"
```

```js
const bytes = new Uint8Array(await new Response(
  new Blob([JSON.stringify(bundle)]).stream().pipeThrough(new CompressionStream('gzip'))
).arrayBuffer())
const payload = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
```

The fragment never reaches a server, so the drills stay between you and the
coach. Gzipped, `/demo-drills.json` (six drills and a session) makes a link
of about 5,000 characters: fine for a browser, though some chat apps cut long
links short.

For a bigger file, host the JSON somewhere that serves it over https with
CORS allowed (a GitHub Gist's raw URL works), and link to it:

```
https://<the site>/?import=https://example.com/drills.json
```

## The file

```json
{
  "patterns": [ /* one object per drill */ ],
  "sessions": [ /* zero or more sessions */ ]
}
```

Both keys are required, even when `sessions` is empty. Fields marked "no"
under Required below can be left out; the app fills in the default. Unknown
fields are ignored, so check spelling: a misspelled field is silently dropped,
not reported.

## Coordinates

Everything is in **pitch units**, never pixels:

- `x` runs **0 to 100** along the length of the pitch, from the left goal line
  to the right goal line.
- `y` runs **0 to 64.76** across it, from the top touchline to the bottom one.
  **`y` points down.**
- 1 metre = **0.952** units (100 units = 105 m). The centre spot is
  `(50, 32.38)`.
- Useful marks on a full pitch: the penalty areas reach `x = 15.71` and
  `x = 84.29`, between `y = 13.18` and `y = 51.58`. The penalty spots are at
  `x = 10.48` and `x = 89.52`.

Positions are always stored in these full-pitch coordinates, whatever pitch
type is chosen. The pitch type only changes how much of the pitch is drawn.

| `pitch.type` | Visible area | Notes |
| --- | --- | --- |
| `full` | x 0–100 | The whole pitch. |
| `half` | **x 25–75** | A half pitch. Its goal line is at `x = 25` and the halfway line at `x = 75`. |
| `half-right` | **x 25–75** | The same half mirrored: the goal line is at `x = 75`. |
| `blank` | x 0–100 | Plain grass with no markings, for grids and rondos. |

Anything outside the visible area is off screen. The validator warns about it.

`pitch.rotated: true` turns the board to portrait, 90° clockwise. It is only a
display setting, so **don't change any coordinates for it**. Use `half-right`
with `rotated: true` to put the goal at the bottom of the screen.

## A drill (`pattern`)

```json
{
  "id": "rondo-4v2",
  "name": "4v2 Rondo",
  "version": 3,
  "pitch": { "type": "blank", "rotated": false },
  "notes": "Setup: ...\n\nCoaching points:\n- ...",
  "notesVisible": true,
  "labelsVisible": true,
  "counterLabelsVisible": true,
  "ballsVisible": true,
  "tags": ["rondo", "u12"],
  "goals": [],
  "frames": [ /* phases, at least one */ ],
  "createdAt": "2026-10-23T09:00:00.000Z",
  "updatedAt": "2026-10-23T09:00:00.000Z"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Any string unique within the file. A readable slug is fine. |
| `name` | yes | Shown in the library and the header. |
| `version` | yes | Always `3`. Nothing else is accepted. |
| `pitch` | yes | `{ type, rotated }`. See the coordinates table above. |
| `frames` | yes | One or more phases. See below. |
| `createdAt`, `updatedAt` | yes | ISO 8601 date strings. |
| `notes` | no | Setup, coaching points and progressions for the whole drill. Use `\n` for line breaks. Up to 4000 characters. |
| `notesVisible` | no | Whether the notes panel is open when the drill loads. |
| `tags` | no | Lowercase, trimmed, unique: `"rondo"`, `"pressing"`, `"u12"`. |
| `goals` | no | Portable goals on the pitch. The same on every phase. See below. |
| `labelsVisible`, `counterLabelsVisible`, `ballsVisible` | no | Display toggles. Absent means `true`. |

## Phases (`frames`)

A drill is a sequence of phases, and playback animates from each phase to the
next. **Every phase is the whole board at that moment**, so repeat every
player in every phase, even the ones that don't move. `counters` is required;
`balls`, `markers`, `labels` and `drawings` default to empty lists.

```json
{
  "counters": [ ... ],
  "balls": [ ... ],
  "markers": [ ... ],
  "labels": [ ... ],
  "drawings": [ ... ],
  "note": "Left back plays back to the centre back.",
  "duration": 1000,
  "hold": 500
}
```

- `duration`: how long the move **into** this phase takes, in milliseconds
  (default 1000). It is ignored on the first phase.
- `hold`: how long to pause on this phase once it arrives, in milliseconds.
  On the first phase it holds the setup before anything moves.
- `note`: a coaching point for this phase only.

**Ids tie phases together.** Playback matches a player, ball or cone in one
phase to the one with the same `id` in the next, and animates between them.
Give `"id": "b1"` to the same player in every phase. If the id changes, that
player vanishes and a new one appears instead of running. The validator warns
when this happens.

### Players (`counters`)

```json
{ "id": "b1", "color": "blue", "label": "1", "pos": { "x": 41, "y": 23 } }
```

- `color`: one of `red`, `blue`, `yellow`, `purple`, `black`. Convention:
  one colour per team, and `yellow` for neutrals or jokers.
- `label`: up to 4 characters, such as a shirt number or `GK`. Use `""` for
  no label.
- `bend` (optional): curves the player's run **into** this phase. It is how
  far the path bows off the straight line, in pitch units, and the sign picks
  the side. 3–8 makes a visible curve.
- `bendAlong` (optional, −0.25 to 0.25): where the bow peaks along the run.
  `0` is the middle; positive values move it towards the arrival.

### Balls

```json
{ "id": "ball", "pos": { "x": 44.4, "y": 26.4 }, "attachedTo": "b1" }
```

- `attachedTo`: the `id` of a player **in the same phase** who has the ball,
  or `null` for a ball loose on the grass.
- While a player has the ball, it is drawn just off their feet and `pos` is
  ignored. Set `pos` to the player's position plus `(3.4, 3.4)` anyway.
- To show a pass, keep the ball's `id` and change `attachedTo` from the
  passer in one phase to the receiver in the next.
- At most 8 balls.

### Cones (`markers`)

```json
{ "id": "k1", "pos": { "x": 38.2, "y": 20.2 } }
```

Use cones to mark out grids, gates and channels. For a square grid, put a
cone on each corner.

### Text (`labels`)

```json
{ "id": "t1", "pos": { "x": 50, "y": 5 }, "text": "2 touch max" }
```

Short text placed on the pitch, up to 200 characters. Keep it to a few words.

### Drawings

Drawings belong to the phase they describe. An arrow for a pass goes on the
phase where the pass happens.

```json
{ "id": "a1", "kind": "arrow", "style": "pass", "color": "#ffffff",
  "from": { "x": 41, "y": 23 }, "to": { "x": 59, "y": 23 } }
```

| `kind` | Fields | Use |
| --- | --- | --- |
| `arrow` | `style` (`"run"` solid or `"pass"` dashed), `from`, `to`, optional `bend` and `bendAlong` (same meaning as on players) | Movement of a player or the ball. |
| `line` | `from`, `to` | Zone edges, channels, thirds. There is no arrowhead. |
| `pen` | `points`: an array of `{ x, y }` | A freehand scribble. Rarely needed. |

`color` is a hex string. The app offers white `#ffffff`, yellow `#ffeb3b`,
black `#212121` and red `#e53935`, plus the team colours: red `#d32f2f`,
blue `#1976d2`, yellow `#fdd835` and purple `#8e24aa`.

### Goals

These are portable goals, which sit on the drill rather than on a phase.
(The pitch markings already include the full-size goals.)

```json
{ "id": "g1", "a": { "x": 10, "y": 30.9 }, "b": { "x": 10, "y": 33.8 } }
```

`a` and `b` are the two posts, between 0.95 and 6.97 units apart (1 m to
7.32 m). The net sits a quarter turn clockwise from the line running from `a`
to `b`. In practice, `a` above `b` puts the net on the left. Set
`"flipped": true` to put it on the other side.

## A session

```json
{
  "id": "tue-u12",
  "name": "Tuesday U12: Possession",
  "version": 1,
  "entries": [
    { "id": "e1", "patternId": "rondo-4v2", "minutes": 15 },
    { "id": "e2", "patternId": "switch-of-play", "minutes": 20 }
  ],
  "createdAt": "2026-10-23T09:00:00.000Z",
  "updatedAt": "2026-10-23T09:00:00.000Z"
}
```

Entries run in order. `patternId` must name a drill **in the same file**,
because the person importing it doesn't have your library. `minutes` must be
above zero. The same drill may appear twice, as long as each entry has its own
`id`.

## Checklist

- [ ] `version: 3` on every drill and `version: 1` on every session.
- [ ] Every player appears in every phase, with the same `id` throughout.
- [ ] Every `attachedTo` names a player in that phase, or is `null`.
- [ ] Positions are inside the visible area: x 25–75 on a half pitch.
- [ ] `y` points down, and the pitch is 64.76 units tall, not 100.
- [ ] Notes explain the setup, the coaching points and a progression.
- [ ] `npm run validate -- file.json` reports 0 errors.
