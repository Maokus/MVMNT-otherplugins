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

Connect the development server shown in the terminal from **Scene Settings → Developer**, then add **Common Notation Score**. Alternatively install `dist/us.maok.commonnotation-1.3.0.mvmnt-plugin`.

Without a selected MIDI track the element displays a labeled, two-page example. Select a track to use timeline MIDI. The default page contains two systems of two measures, advancing on playback. Fixed-page mode uses a one-based page number, independent of playback. Playback highlighting still follows the actual timeline time.

Controls include treble/bass clef, sharp/flat preference, constant tempo and meter overrides, score-start offset, page size, staff spacing, measures per system, systems per page, colors and reveal/release durations. A tempo override of zero uses timeline tempo. The example uses 120 BPM and 4/4 unless overridden; its MIDI times remain fixed. Animated notes fade/slide into place, highlight while active, then smoothly return to the ordinary appearance. Turn animation off to see the complete score immediately.

## Elements and library layers

The plugin now contains eight elements. All work without an imported MIDI file; the score and orbit switch to a selected MIDI track when one is assigned.

| Element                            | Library layer                 | What it demonstrates                                                                                                                       |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Common Notation Score**          | Complete pipeline             | MIDI interpretation, quantized measures, pagination, tied durations and playback effects.                                                  |
| **Notation · Glyph Atlas**         | Glyph registry                | Every bundled glyph, isolated or by family, with rotation, outline bounds and attachment anchors.                                          |
| **Notation · Note Workshop**       | Musical model and assembly    | Build a note, chord or rest from pitch and written duration; inspect or separate its head, stem, flag, dots, accidentals and ledger lines. |
| **Notation · Layout Study**        | Placement                     | Place the same assembled notation on a line, wave or circle, optionally rotating it along the path tangent.                                |
| **Notation · MIDI Orbit**          | Rendering and timed effects   | A musical visualisation driven by real MIDI timing: notes orbit, pulse, reveal and release; active notes connect to the centre.            |
| **Notation · Schematic Structure** | Spatial composition           | Whole-piece, per-track planes with overview summaries, focused engraving and musical data overlays.                                        |
| **Notation · Engraving Lab**       | Interpretation and engraving  | Quantization, beams, explicit beat groups, key cancellations, voice overrides, metrical ties and tempo conversion.                         |
| **Notation · Utility Lab**         | Reusable geometry and effects | Transformed anchor connections, schematic marks, local glyph registries and all five phases.                                               |

### Guided feature studies (v1.3)

Start with **Notation · Engraving Lab** and **Notation · Utility Lab** for labeled, self-contained comparisons. Both show all their studies immediately, need no MIDI import, and can isolate one study through the inspector. Their presets select useful configurations. Each of the other elements now also has presets for its main capabilities.

| Key capability                                                       | Example and configuration                                                                                              | Visible evidence                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Glyph outlines, metrics, attachment anchors and dynamics             | Glyph Atlas → **All glyph metrics and anchors** / **Performance dynamics**                                             | Bounds, anchor crosses and the complete bundled glyph families                                                                 |
| Custom glyph registration and musical assembly                       | Utility Lab → **Custom notehead assembly**; Glyph Atlas → **Locally registered diamond glyph**                         | Default and diamond-headed chords side by side, using each registry's stem anchors                                             |
| Notes, chords, rests, durations, dots, accidentals and ledger lines  | Note Workshop → **Separated chord components**, **Dotted rest**, **Ledger lines and stem anchors**                     | Named, color-coded parts and optional separated assembly                                                                       |
| MIDI quantization and preserved performance timing                   | Engraving Lab → **Beams and flags** study                                                                              | Slightly jittered onsets snap to written sixteenth boundaries; the original onset seconds remain in the model                  |
| Shared stems, primary/secondary/partial beams and flags              | Engraving Lab → **Beams and flags** study                                                                              | Identical attacks rendered with beams and with individual flags                                                                |
| Explicit beat-group overrides                                        | Engraving Lab → **Compare 7/8 beat groups**                                                                            | Fourteen sixteenths grouped as 2+2+3 and 3+2+2, with different beam boundaries                                                 |
| Key-aware spelling and cancellation naturals                         | Engraving Lab → **Key signature and cancellation** study                                                               | Signature-aware alterations and cancellation naturals; choose any supported signature                                          |
| Conservative voices and explicit voice overrides                     | Engraving Lab → **Explicit voice overrides**                                                                           | Sustained lower chord and upper melody, actual voice IDs and independent grouping/color                                        |
| Metrical rhythm decomposition and ties                               | Engraving Lab → **Metrical splitting and ties** study                                                                  | The same off-beat duration shown as a legacy half note and tied metrical fragments                                             |
| Tempo-map conversion                                                 | Engraving Lab → **Tempo-map comparison**; Score → **Built-in tempo change**                                            | Identical performance seconds map to different written beat positions after a 120 → 60 BPM change                              |
| Arbitrary placement and tangent rotation                             | Layout Study → **Wave placement** / **Tangent-aligned chord circle**                                                   | The same assembled notes follow different paths and orientations                                                               |
| Origins, non-uniform scale, rotation, bounds and transformed anchors | Utility Lab → **Transformed attachment anchors**                                                                       | Rotated/scaled notation with a connector that follows its resolved stem tips                                                   |
| Points, ribbons, brackets, connectors and deterministic variation    | Utility Lab → **Schematic marks** study                                                                                | Pitch sets point height, velocity sets size/thickness, duration sets ribbon length; the seed changes color without moving data |
| Upcoming, reveal, active, release and completed states               | Utility Lab → **All five note phases** / **Spin reveal / float release**                                               | Five labeled snapshots of one performance interval, with inspectable progress and effects                                      |
| Continuous MIDI animation and creative placement                     | MIDI Orbit → **Reveal, highlight and release**                                                                         | Real-time orbital motion, note-phase effects, pitch labels and active spokes                                                   |
| Projection, depth, whole-piece summaries and focused engraving       | Schematic Structure → **Whole-piece overview**, **Detailed engraving focus**, **Inspect depth and attachment anchors** | Multiple score planes, musical overlays, detail/overview transitions and camera/anchor inspection                              |

The Utility Lab's phase row samples absolute times rather than waiting for timeline playback, so every state is always inspectable. If reveal/release duration is zero, its snapshot correctly reports the resulting active/completed phase. The Engraving Lab's timing study uses a manual clock by default; switch to playback to follow the scene clock.

The Score's built-in-example selector now offers the original phrase, an engraving phrase, and a tempo-map phrase. Its new presets turn on the relevant engraving options explicitly. Applying a built-in example preset clears the selected track; imported tracks continue to use project timing unless a constant override is set.

### Expanded score

The score supports transposition, beat spacing, system spacing, a page background and an optional page label. Staff/barlines/ledger lines, clefs/meters, rests, accidentals, stems/flags and ties can be hidden independently. Staff, rest and accidental colors are independent of the primary/active note colors. Hiding components leaves the layout stable rather than repaginating the score. Bounds and anchor overlays expose the geometry being rendered.

Fixed-page controls appear only in fixed-page mode. Numerator/denominator controls appear only with the meter override enabled. Page width/height define the container; staff size is a maximum, so increasing it beyond what fits a dense page does not force clipping. Color overrides for accidentals/rests/staves take precedence over the inherited note color.

### Glyph atlas and note workshop

The atlas exposes all glyph families, or one named glyph. Glyph size is measured in pixels per staff space, so differing musical sizes remain meaningful. Gallery column count controls wrapping; rotation applies around each outline's centre. Blue boxes show glyph bounds; amber crosses mark origins and supplied attachment anchors.

The workshop constructs notation directly from the musical model, so it can demonstrate a dotted sixteenth even though the MIDI adapter quantizes to sixteenth boundaries. Its chord presets are major, minor, chromatic cluster and octave. Spelling changes the written note only for chromatic pitches. Explicit accidentals include naturals. Turning explicit accidentals off removes them from the assembly. Component separation spreads parts in staff-space units, while the model retains its pitch and duration. The component legend uses the same palette as the drawing. Controls irrelevant to rests are hidden.

### Layout study and MIDI orbit

Layout Study uses `placeOnPath()` and `pathPosition()` from the library. Event count, starting pitch and pattern define the phrase; spacing controls the line/wave, while radius controls the circle. Wave height/cycles and phase determine the curve. Path alignment changes geometry only, never the musical model. Labels identify the events.

MIDI Orbit queries a past/future time window, displays the nearest notes up to its configured limit, and uses original MIDI onset/offset times for effects. Angular travel is in degrees per second; pitch spread offsets radius per octave from middle C. A small pitch-class angle offset separates simultaneous chord tones. Written durations approximate performance lengths using the notation-tempo control. Orientation can remain upright or follow the orbit tangent. The example optionally loops every 16 seconds; imported tracks never loop implicitly. Window limits and the maximum-note limit take precedence over effect durations. Optional labels show pitch and the current phase.

### Effects shared by score and orbit

- **Reveal:** fade, slide or spin before onset. Reveal duration controls how early it starts; upcoming opacity determines the unrevealed appearance.
- **Active:** accent color and a configurable scale while the original MIDI note sounds.
- **Release:** settle back into place, float upward or shrink after note-off. Release duration controls the transition; completed opacity determines the final appearance. Float/shrink retain their final position/scale after release.
- **Slide/float distances:** separate controls measured in staff spaces, shown only when their corresponding motion style is selected.
- **Animate notes:** disables all note-phase styling; inspector effect controls are hidden when it is off. Orbital travel and the optional active-note spokes remain independent visualisation features.

Effects are computed from absolute time, so seeking and out-of-order export frames are deterministic. Stable page bounds do not grow during note effects; large creative offsets may deliberately extend outside the page.

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
- `GlyphRegistry.names()` lists registered glyphs. `GlyphRegistry` provides glyph commands, bounds, advances and attachment anchors. Register custom glyph data or pass a custom registry to `glyphNode` and `NotationRenderer`. Layout's built-in musical builders use `defaultGlyphs`.
- `placeOnPath(nodes, options)` repositions copies on a line, sine wave or circle, with optional tangent rotation. `pathPosition` evaluates the same continuous curve for guides or other objects. Coordinates use staff spaces; phase and rotation use radians.
- `NotationRenderer.renderNode` renders any individual node; `render` adds a transparent stable page boundary for MVMNT placement. Note and component callbacks return additional X/Y offsets, rotation, uniform scale, opacity and color. `LayoutNode.rotation` supplies base rotation; callback rotation is added to it. `showBounds` and `showAnchors` enable geometry overlays. Reveal/release styles, active scale, slide/float distances and upcoming/completed opacity are configurable in `RenderOptions`. Component style takes precedence. Parent transforms and opacity compose normally.
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

- The score and schematic element can use the SDK tempo map; the orbit uses its explicit notation-tempo control. Meter remains constant.
- No automatic key inference, tuplets, harmonic voice inference, grace notes, pedal-duration interpretation or automatic clef changes. Manual keys, conservative voices and eighth/sixteenth beaming are supported.
- Spelling follows an explicit key when supplied, with a sharp/flat preference for chromatic alternatives; it does not infer harmony.
- Overlapping notes are retained with deterministic offsets; dense independent voices can be spread out and may need caller-provided notation/layout.
- Off-grid rhythms are approximated. Legacy duration decomposition is greedy; optional metrical grouping respects strong divisions and ties fragments.
- Page changes take precedence over the previous page's release effects. Ties at system/page boundaries use continuation stubs.
- Very dense pages scale down uniformly and can become small. Reduce measures per page or enlarge the page for readability.

## Glyph source and validation

Glyph outlines and anchors come from pinned Bravura source under the SIL Open Font License. See `assets/licenses/PROVENANCE.txt` and `assets/licenses/Bravura-OFL.txt`; both are included in the archive. `vendor/` contains the original font and metadata for offline regeneration with `npm run glyphs`. Generated data is named **Commonnotation Glyphs**.

`npm test` covers interpretation, layout, deterministic effects, caching, missing data and SDK rendering. Every exposed property is tested for an output change with a relevant input fixture, and numeric controls are exercised at their advertised limits. Integration tests import the actual primitive implementations from the sibling MVMNT checkout (tests only). The development-only native canvas renderer writes treble, bass, active, second-page and layer-demonstration PNG previews under `.build/previews/`. This checks the real drawing paths without requiring an app window. `npm run check` verifies the SDK contract and archive loading; `npm run build` creates the installable archive.

## Spatial schematic structure (v1.2)

**Notation · Schematic Structure** is a sixth element: a whole-piece score distributed over planes in depth. It combines engraved focus notation with overview points, duration/density bands, pitch-centroid connectors and real musical annotations. The reference is Conrad House's [Schematic Scores](https://www.creativeapplications.net/project/schematic-scores-values-to-structures/); this implementation generates its own structures from MIDI.

Choose the built-in, three-track, 32-measure demonstration or select up to eight MIDI tracks. Each distinct selected track receives a plane. A missing selected track produces a diagnostic instead of switching sources. Project range includes the whole timeline; custom range uses seconds. When the timing capability is available, project-mode timing follows the complete tempo map. An explicit tempo override uses constant timing instead. The SDK currently supplies one time signature, so meter remains constant unless explicitly overridden.

The complete source remains represented while a detailed notation window follows playback. Manual focus decouples that window from playback highlighting. The default span is four measures; its edges crossfade between detail and overview. Defaults budget 256 detailed events and 2,048 overview cells across all planes. A detail event can contain several chord tones; rests also count as events. Musical events beyond the detail budget remain represented by overview summaries. Time/pitch bins are deterministic and rebuilt only for source/configuration changes. Long pieces increase the effective measures per strip to retain the full range in at most sixteen strips per plane.

Time runs horizontally within strips. Pitch positions determine notation and overview register; performance duration determines ribbon length, local event count determines band thickness, and velocity affects point size and annotations. Connectors link consecutive time-bin pitch centroids. The annotation vocabulary includes measure/time, duration, pitch-class sets, centroid intervals, velocity and event density. The seed controls plane orientation and secondary-mark selection, never the musical content. Layer toggles do not reshuffle the structure.

Camera controls include yaw, pitch, perspective, zoom and optional time-based rotation. Rotation is off by default. The page container is fixed and clips projected content; high zoom can intentionally crop the composition. **Ink on paper** and **Night study** presets change ink, background and playback accent. Future/completed opacity applies to musical content; structural staves and track labels remain as context.

### Engraving additions

The original score now has optional beaming, metrical grouping, conservative voices and a key signature. Existing property keys remain valid; legacy rhythm grouping and flags remain the score defaults. The schematic element enables metrical grouping, conservative voices and beaming.

- `normalizeMidiNotes()` returns immutable notes with stable source identities plus rejected-record diagnostics. Velocity changes retain identity; exact duplicate records get occurrence suffixes.
- `TimeMap`, `constantTimeMap()` and `sdkTimeMap()` decouple engraving beats from performance seconds. `MidiOptions.timeMap` supplies a conversion map; absent a map, `tempo` supplies constant conversion. The score-start offset is applied in beat space.
- `KeySignature` contains `fifths` (−7 to +7) and optional major/minor label mode. `spellPitch()` accepts it as a third argument; `buildKeySignature()` draws it. Accidental state resets by measure, follows the signature, and explicitly marks simultaneous conflicting alterations. Major/minor labels share the same written signature.
- `MidiOptions.voices` assigns deterministic lanes per track/channel after grouping exact quantized chords. `voiceIds` provides overrides keyed by normalized source ID. This is interval partitioning, without harmonic voice inference or automatic staff assignment.
- `rhythm: 'metrical'` preserves aligned long values, splits values that conceal stronger boundaries, and ties the fragments. `beatGroups` overrides numerator-unit grouping; conventional compound grouping and 2+3 / 2+2+3 defaults cover 5/8 and 7/8. The MIDI grid remains sixteenth-note based.
- `layoutScore({…}, {beaming:true,…})` supports eighth/sixteenth beams, bounded slopes and partial secondary beams. Ambiguous overlaps, rests and group boundaries break runs. Shared stems/flags belong to chord roots, with independent pitch components underneath. Accidentals reuse non-colliding columns; identical ledger segments and augmentation dots are deduplicated.

### Geometry, effects and projection APIs

All exports remain available through `src/notation/index.ts`.

- `LayoutNode` supports `originX/Y`, `scaleX/Y`, `rotation`, semantic metadata, shared timing, color/opacity and text nodes. `groupNode()` uses the same transforms as rendering. Page nodes use ordinary scale fields; the old `anchors.scale` value is retained for read compatibility.
- `transformMatrix()`, `multiply()`, `transformPoint()`, `transformBounds()`, `measureNodes()`, `remeasure()`, `walkNodes()` and `resolveAnchor()` provide shared geometry operations.
- `evaluateNoteStyle()` is a pure appearance function. `evaluateLayoutNodes()` produces a fresh animated scene; source layouts are not mutated. Component callbacks receive phase and source context. Connections are rebuilt from evaluated anchors, so beams and ties follow moving chord roots.
- `lineNode()`, `bracketNode()`, `ribbonNode()`, `pointNode()`, `pointField()` and `anchorConnector()` provide reusable schematic marks. `seededValue(seed,id)` gives a deterministic value independent of traversal order.
- Glyph registries own frozen copies and expose a `revision`. All musical builders accept an optional registry. The atlas also includes piano, mezzo and forte symbols.
- `SpatialPlane` associates ordinary notation nodes with a `PlaneTransform`. `Camera` defines viewport, yaw/pitch, distance, focal length, near plane, zoom and perspective amount. Units are shared with the source geometry; angles are radians.
- `projectScene()` returns SDK render objects. `projectPrimitives()` additionally exposes stable IDs and depth. Glyph outlines are adaptively flattened with separate contour winding preserved; geometry is clipped at the near plane and painter-sorted. `flattenPath()` and `clipNear()` are exported for reuse.
- `buildSchematicStructure()` compiles normalized tracks, engraving and whole-range summaries. `schematicPlanes()` produces a frame's focused composition. Detail assembly and outline caches are bounded or revision-aware; camera/palette/playback changes do not rebuild the musical source.

```ts
import { buildChord, projectScene } from "./notation";

const nodes = [buildChord(event, "treble")];
const objects = projectScene(
  [
    {
      id: "score-plane",
      nodes,
      transform: { x: 0, y: 0, z: 0, rotationY: 0.4 },
    },
  ],
  {
    width: 800,
    height: 600,
    yaw: -0.2,
    pitch: 0.1,
    distance: 100,
    focalLength: 500,
    near: 1,
    zoom: 1,
    perspective: 0.8,
  },
  {
    time: seconds,
    color: "#272822",
    activeColor: "#A33B28",
    reveal: 0.4,
    release: 0.8,
  },
);
```

Projection uses transparent Canvas linework, without a depth buffer for opaque surface intersections. Small text labels use a local affine approximation; they are not perspective-warped outlines. Those limits suit the schematic visual style. Tuplets, double accidentals, harmonic voice inference and meter-change maps remain outside this release.

### Verification and performance

Tests cover the existing elements plus stable MIDI identity, tempo changes, all key signatures, conservative voices, metrical duration splitting, partial beams, chord ownership, immutable registries, transformed anchors, glyph holes, clipping, depth order, missing sources, cache invalidation and deterministic seeking. Schematic inspector controls have relevant-input tests, with additional assertions on actual layer membership, camera geometry, timing and focus behaviour.

The suite writes paper/night/flat/detail preview matrices under `.build/previews/`. A 20,000-note/eight-track fixture records cold compilation, process memory and cached projection/full-element timings at 1080p in `.build/benchmark.json`. Timings measure scene preparation and render-object generation, excluding canvas rasterisation and host scheduling. Process memory includes the test runner and other tests; heap deltas can vary with garbage collection.

The example-coverage tests additionally assert the studies' musical and geometric content: changed beam boundaries, retained original seconds, explicit voice assignments, cancellation naturals, metrical ties, resolved connector endpoints, private custom-glyph anchors and actual phase styles. Every preset is checked for valid property values and a successful render. Native-canvas previews of both lab galleries are written to `.build/previews/engraving-lab.png` and `.build/previews/utility-lab.png`.
