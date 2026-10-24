# Schematics n’ Scores

Ten MIDI-driven mark languages plus **Score Panels**, a combined composition of unequal rectangles. All eleven elements appear under **Schematics n’ Scores** in the element picker and support transparent decorations, margin strips, and larger score panels.

Select a MIDI track to generate a composition for the current phrase. Its primary geometry remains stable throughout the phrase; note playback adds selective ink emphasis and motion. Pages advance through the track, rather than looping one passage. All geometry and animation are deterministic when seeking or exporting.

| Element | MIDI mapping | Language controls |
| --- | --- | --- |
| Cage | Onsets place sparse points, pitch sets height, velocity sets size, and duration shapes the fine connecting curves. | Point size, connection amount |
| Penderecki | Overlapping notes form masses. Pitch span determines cluster height, duration determines width, and velocity determines visual weight. | Band thickness, hatch spacing |
| De Cesare | Pitch selects geometric glyphs; onset, pitch, and duration arrange irregular cells; velocity emphasizes their borders. | Cell size, box visibility |
| Notation | Pitch determines staff position and accidentals; relative durations determine notehead/stem/flag forms; gaps suggest rests and velocity suggests dynamics. | Staff count, note scale |
| Schematic | Notes place dimensioned engineering and math diagrams. Pitch chooses diagram families, duration supplies spans and dimension annotations, and velocity shapes load/wave emphasis. | Diagram scale, annotations |
| Isometric | Onsets and durations arrange wireframe boxes, pitch determines elevation, intervals connect their nodes, and velocity sets node size. | Projection depth, node size |
| Wall | Chord centroids form layered pitch contours. Durations produce held plateaus and velocity shapes curvature and weight. | Contour count, contour spread |
| Mechanism | Onsets position pulleys, pitch sets radius, durations label spans, and velocity conditions hubs and rotating spokes. Belts connect adjacent pulleys. | Pulley size, belt detail |
| Field | Notes seed scattered groups; pitch selects mark families, velocity sets group size, and duration widens the scatter. | Mark size, scatter amount |
| Matrix | Onsets map to columns, pitch maps to rows, durations extend occupied cells, and velocity sets fill emphasis. Some cells are outlines or narrow punched slots. | Rows, columns per beat |

## Controls

- **MIDI & Pages:** one MIDI track, bars per page (default 4), and page offset in beats. Boundaries use the project's tempo map. Bar length respects the time-signature denominator: a 6/8 bar contains three quarter-note beats. The SDK supplies the project time signature; changing time signatures within a project are not exposed as a signature map by this API.
- **Layout:** width and height (default 640 × 160), padding, and horizontal/vertical orientation. Vertical orientation rotates the entire composition clockwise inside the specified bounds; text rotates with it. Position, rotation, and overall opacity use the host's normal element controls.
- **Composition:** Note Coverage selects a distributed subset of the phrase's notes (the saved key remains `density`). The separate **Visual Density** control ranges from 1–4 and adds MIDI-derived companion marks, subdivisions, construction lines, contour layers, and other fine detail. It does not move primary marks or create MIDI events. Seed changes ornamental choices; automatic pitch range fits the current page. Disable auto range to keep the same pitch scale between pages. Note Coverage zero hides MIDI marks and their added detail.
- **Appearance:** ink, accent, guide, and background colors with alpha, stroke width, mark scale, and optional structural guides. Background is transparent by default. Palette presets provide monochrome, ink on paper, and blueprint treatments.
- **Playback:** Accent Mode defaults to **Ink**, using localized rings, registration ticks, stronger outlines, filled noteheads, and short contour segments. **Spot Color** applies the optional accent color only to those designated live marks; it never tints an entire group. **None** disables these accents. Ink alpha is preserved, and spot-color alpha multiplies it. Accent Strength and Release shape their envelope. Motion Amount and the optional playhead remain independent. For a completely static phrase, disable transitions, set accent strength and motion amount to zero, and hide the playhead.
- **Phrase Transitions:** choose None, **Slide & Fade**, **Shrink & Grow**, or **Retract & Draw**. Each primitive is staggered along the reading direction: exits accelerate with cubic ease-in and entries decelerate with cubic ease-out. Duration defaults to 0.8 seconds, Stagger to 55%, and slide Travel Distance to 12 px. Duration zero disables transitions. Retraction trims line lengths, path perimeters, and arc angles; text and filled shapes use local wipes.

Sustained notes can appear on multiple pages and keep their real start/end times for playback. Phrase transitions overlap outgoing and incoming compositions around the boundary. Their window is capped at half the shorter neighboring phrase, so only two pages can coexist. Backgrounds and playheads stay outside the stagger. Transitions use absolute timeline time and behave identically when seeking or exporting. Empty pages contain no fabricated notes; optional guides remain, and an explicitly chosen background may still render. Missing/unavailable tracks render nothing. There is no audio synthesis.

Notation is a decorative interpretation, not a sheet-music engraver: spacing is proportional and compressed for the panel, extreme pitches are limited to a small ledger range, chromatic notes use sharps, and duration categories and rests are approximate. Multiple staves distribute the phrase across successive staff rows.

## Score Panels

Score Panels defaults to **1280 × 720**, **10 panels**, **12 px gutters**, a transparent background, and hidden dividers. A seeded recursive partition creates unequal rectangles. Each language is used once before another seeded cycle begins. Panel Count ranges from 1–16; Layout Seed, Gutter, padding, and dimensions determine the layout. Rectangles and language assignments stay fixed between phrases. When the available space cannot fit 96 × 64 panels, fewer panels are generated; very small containers retain one clipped panel.

One MIDI track drives the composition. Within each phrase, successive onset groups are assigned round-robin to panels; notes within 1 ms of the group's first onset stay together. Grouping restarts each phrase. The original phrase-relative positions, pitch normalization, durations, and playback times survive partitioning. An empty partition stays empty. Each panel uses its language's specific defaults and shares the composition's palette, density, accent, motion, and transition controls. Shared orientation rotates the complete arrangement clockwise.

## Added visual detail

| Language | Visual Density adds |
| --- | --- |
| Cage | Satellite points and fine companion curves |
| Penderecki | Cross-hatching and secondary internal bands |
| De Cesare | Cell subdivisions, small glyphs, and index marks |
| Notation | Duration-derived slurs and articulation detail, without extra noteheads |
| Schematic | Construction lines, subdivisions, and secondary annotations |
| Isometric | Interior braces and wireframe subdivisions |
| Wall | Fine companion contours between the primary layers |
| Mechanism | Concentric rings, bearings, and rim teeth |
| Field | More small marks within the existing note clusters |
| Matrix | Cell divisions, slot indexing, and adjacent fine rules |

Detail passes use independent seeds. Raising Visual Density preserves previously generated geometry until the primitive budget requires simplification. Primary geometry takes priority over added detail; heavily populated phrases can reach the limit before level 4.

## Development

```sh
npm install
npm run typecheck
npm test
npm run check
npm run build
npm run review
npm run dev
```

The build produces the distributable `.mvmnt-plugin` in `dist/`. The review command creates `dist/review/index.html` with sparse, chordal, and dense sheets, accent comparisons, Visual Density levels 1/2/4, three seeded panel compositions, and a playable/scrubbable comparison of all three transition styles. It exercises the real element definitions and render adapter through recording implementations of the host render primitives, then paints them to a CPU canvas. Review output complements the tests; verify host integration by connecting the development plugin server from **Scene Settings → Developer** in MVMNT.

The plugin requires SDK 2.2's `timeline.read` and `timing.conversion` capabilities. Each render queries the visible phrase or two transitioning phrases so MIDI edits and tempo changes invalidate cached geometry. Instances retain at most two page compositions. Score Panels queries each phrase once before partitioning it. At most 256 source notes are sampled evenly across a phrase. Standalone elements share a 6,000-primitive total between both layers and accents; Score Panels shares 24,000 across all panels, transitions, accents, and dividers. Very dense passages intentionally simplify; the first and last notes remain represented in the source sample. No whole-track scan or playback-history simulation is needed.

## Compatibility

Version 1.1.0 retains all ten existing element IDs, MIDI selectors, saved property keys, and palette values. Missing new properties default to Ink accents, Slide & Fade transitions, and Visual Density 1. Choose Transition None for the previous direct phrase change.

## Inspiration

The ten vocabulary names and visual direction come from Conrad House's [Schematics n’ Scores](https://scores.conradhouse.dev/about/), whose references include John Cage, Krzysztof Penderecki, and John De Cesare. The [Are.na reference supplied with this project](https://www.are.na/block/51214756) provides additional visual context. This plugin is an independent implementation of MIDI-conditioned geometry; it does not bundle the source website's JavaScript, images, or fonts and has no runtime network dependencies.
