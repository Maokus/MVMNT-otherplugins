# Commonnotation

A plugin-local musical notation toolkit for MVMNT SDK 2. It exposes editable musical and geometric data, then creates ordinary SDK render objects. No host changes, runtime font loading, DOM, canvas access, or network requests are needed by the plugin.

## Run

```sh
npm install
npm test
npm run check
npm run build
npm run dev
```

Connect the development server shown in the terminal from **Scene Settings → Developer**, then add **Common Notation Score**. Alternatively install `dist/us.maok.commonnotation-1.0.0.mvmnt-plugin`.

Without a selected MIDI track the element displays a labeled, two-page example. Select a track to use timeline MIDI. The default page contains two systems of two measures, advancing on playback. Fixed-page mode uses a one-based page number, independent of playback. Playback highlighting still follows the actual timeline time.

Controls include treble/bass clef, sharp/flat preference, constant tempo and meter overrides, score-start offset, page size, staff spacing, measures per system, systems per page, colors and reveal/release durations. A tempo override of zero uses timeline tempo. The example uses 120 BPM and 4/4 unless overridden; its MIDI times remain fixed. Animated notes fade/slide into place, highlight while active, then smoothly return to the ordinary appearance. Turn animation off to see the complete score immediately.

## Library

Import from `src/notation/index.ts`. The TypeScript source compiles to JavaScript through the normal plugin build. There are no app-private imports in runtime source. Reuse this directory in another SDK plugin; it is deliberately not a separate published package yet.

The pipeline is:

```text
MidiNoteEvent[] → adaptMidiNotes → Score → layoutScore → ScoreLayout
                                                        ↓
                                   NotationRenderer → SDK RenderObject[]
```

- `adaptMidiNotes(notes, options)` accepts constant tempo/meter, score start in seconds, a zero-based first measure and measure count, and spelling preference. Beats are quarter-note beats. Quantization uses nearest sixteenth-note boundaries and a minimum sixteenth duration. Performance times remain unchanged for animation.
- `Score` contains measures, events, written durations and pitches. An event with no notes is a rest. Equal onset/duration notes form chords. Each tied segment retains its original source identity and original performance start/end seconds.
- `layoutScore(score, options)` produces a page of systems fitted uniformly within pixel dimensions. `staffSize` is the maximum pixels per staff space. Dense music makes the whole page smaller rather than clipping it. The layout has stable semantic IDs, component roles, bounds and anchors, and is not mutated by rendering.
- `glyphNode`, `buildStaff`, `buildNote`, `buildChord` and `groupNode` work independently of pagination. Geometry uses staff spaces, canvas Y down, and radians for rotation. Staff Y=0 is the top line; Y=4 is the bottom line. `staffPosition` returns half-space steps upward from the bottom line.
- `GlyphRegistry` provides glyph commands, bounds, advances and attachment anchors. Register custom glyph data or pass a custom registry to `glyphNode` and `NotationRenderer`. Layout's built-in musical builders use `defaultGlyphs`.
- `NotationRenderer.renderNode` renders any individual node; `render` adds a transparent stable page boundary for MVMNT placement. Note and component callbacks return additional X/Y offsets, rotation, uniform scale, opacity and color. Component style takes precedence. Parent transforms and opacity compose normally.
- `evaluateNotePhase` is a pure absolute-time function. Notes are active on `[start,end)`. Zero-length reveal/release intervals skip their respective phases. Release color interpolation supports SDK hex colors; custom CSS colors return directly to their base color.

### Standalone glyph

```ts
import { glyphNode, NotationRenderer } from "./notation";

const renderer = new NotationRenderer();
const clef = glyphNode("free-clef", "gClef");
const object = renderer.renderNode(clef, {
  time: 0,
  color: "#eeeeee",
  activeColor: "#34d399",
  reveal: 0,
  release: 0,
});
object.setScale(24).setPosition(100, 120);
```

### Custom placement and component effects

```ts
import { adaptMidiNotes, buildChord, NotationRenderer } from "./notation";

const score = adaptMidiNotes(notes, {
  tempo: 120,
  numerator: 4,
  denominator: 4,
  measureCount: 4,
});
const renderer = new NotationRenderer();
const events = score.measures.flatMap((m) => m.events);
const objects = events.map((event, index) => {
  const node = buildChord(event, "treble");
  return renderer
    .renderNode(node, {
      time: seconds,
      color: "#dddddd",
      activeColor: "#34d399",
      reveal: 0.4,
      release: 0.3,
      noteStyle: (_note, phase) => ({
        rotation: phase.phase === "active" ? 0.08 : 0,
      }),
      componentStyle: (component) =>
        component.role === "accidental" ? { color: "#fbbf24" } : {},
    })
    .setScale(16)
    .setPosition(80 + index * 55, 180 + Math.sin(index * 0.6) * 60);
});
```

Layouts and callback inputs should be treated as read-only. Keep stable IDs when supplying your own musical model. Render objects are fresh for each frame; per-element resources cache the layout only. The demo compares normalized note content and layout settings each frame because the public SDK has no timeline revision token. Seeking, edits and undo therefore do not leave stale layout. Only the current page is retained; disposal clears it.

## Musical scope

Supports treble/bass clefs, ledger lines, barlines, numeric meters, sharp/flat/natural accidentals, whole through sixteenth notes/rests, dotted values representable on the sixteenth grid, chords and ties. Durations are split at barlines and decomposed into supported values. Rest intervals cover only silence across all notes. Accidentals reset at barlines; tied continuations suppress repeated accidentals.

This is a toolkit and basic MIDI adapter, not a publication-quality engraver:

- No tempo-map reconstruction: the public SDK exposes one tempo and meter. Set constant overrides when necessary.
- No key-signature inference, tuplets, beaming, voice inference, grace notes, pedal-duration interpretation or automatic clef changes.
- Spelling follows a sharp/flat preference in a key-signature-free context, not harmonic analysis.
- Overlapping notes are retained with deterministic offsets; dense independent voices can be spread out and may need caller-provided notation/layout.
- Off-grid rhythms are approximated. Duration decomposition is greedy within each measure rather than a full metrical grouping algorithm.
- Page changes take precedence over the previous page's release effects. Ties at system/page boundaries use continuation stubs.
- Very dense pages scale down uniformly and can become small. Reduce measures per page or enlarge the page for readability.

## Glyph source and validation

Glyph outlines and anchors come from pinned Bravura source under the SIL Open Font License. See `assets/licenses/PROVENANCE.txt` and `assets/licenses/Bravura-OFL.txt`; both are included in the archive. `vendor/` contains the original font and metadata for offline regeneration with `npm run glyphs`. Generated data is named **Commonnotation Glyphs**.

`npm test` covers interpretation, layout, deterministic effects, caching, missing data and SDK rendering. Integration tests import the actual primitive implementations from the sibling MVMNT checkout (tests only). The development-only native canvas renderer writes treble, bass, active and second-page PNG previews under `.build/previews/`. This checks the real drawing paths without requiring an app window. `npm run check` verifies the SDK contract and archive loading; `npm run build` creates the installable archive.
