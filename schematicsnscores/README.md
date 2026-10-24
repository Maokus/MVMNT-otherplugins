# Schematics n’ Scores

Ten MIDI-driven mark languages for transparent peripheral decorations, narrow margin strips, and small score panels. Each language is a separate element under **Schematics n’ Scores** in the element picker.

Select a MIDI track to generate a composition for the current phrase. Its complete geometry remains stable throughout the phrase; note playback adds restrained color accents and motion. Pages advance through the track, rather than looping one passage. All geometry and animation are deterministic when seeking or exporting.

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
- **Composition:** density selects a distributed subset of the phrase's notes, seed changes ornamental choices, and automatic pitch range fits the current page. Disable auto range to keep the same pitch scale between pages. Density zero hides MIDI marks.
- **Appearance:** ink, accent, guide, and background colors with alpha, stroke width, mark scale, and optional structural guides. Background is transparent by default. Palette presets provide monochrome, ink on paper, and blueprint treatments.
- **Playback:** accent strength, release time, motion amount, and optional playhead. Set accent strength and motion amount to zero and hide the playhead for a completely static page. Accent mixing preserves the original color's alpha.

Sustained notes can appear on multiple pages and keep their real start/end times for playback. Pages change directly at phrase boundaries. Empty pages contain no fabricated notes; optional guides remain, and an explicitly chosen background may still render. Missing/unavailable tracks render nothing. There is no audio synthesis.

Notation is a decorative interpretation, not a sheet-music engraver: spacing is proportional and compressed for the panel, extreme pitches are limited to a small ledger range, chromatic notes use sharps, and duration categories and rests are approximate. Multiple staves distribute the phrase across successive staff rows.

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

The build produces the distributable `.mvmnt-plugin` in `dist/`. The review command creates `dist/review/index.html` and three PNG sheets showing every language as both a strip and a panel with sparse, chordal, and dense fixtures. It exercises the real element definitions and render adapter through recording implementations of the host render primitives, then paints them to a CPU canvas. Review output complements the tests; verify host integration by connecting the development plugin server from **Scene Settings → Developer** in MVMNT.

The plugin requires SDK 2.2's `timeline.read` and `timing.conversion` capabilities. Each render queries the current page so edits and tempo changes invalidate cached geometry. Each instance retains only its most recent generated page. At most 256 notes are sampled evenly across a phrase, with at most 6,000 rendered primitives. Very dense passages intentionally simplify; the first and last notes remain represented in the source sample. No whole-track scan or playback-history simulation is needed.

## Inspiration

The ten vocabulary names and visual direction come from Conrad House's [Schematics n’ Scores](https://scores.conradhouse.dev/about/), whose references include John Cage, Krzysztof Penderecki, and John De Cesare. The [Are.na reference supplied with this project](https://www.are.na/block/51214756) provides additional visual context. This plugin is an independent implementation of MIDI-conditioned geometry; it does not bundle the source website's JavaScript, images, or fonts and has no runtime network dependencies.
