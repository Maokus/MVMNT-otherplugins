# Silly Ideas 1

`Sorted Waveform` reads a raw PCM frame around the playhead, sorts the samples from negative to positive amplitude, and renders the result as a line, bars, or dots. It intentionally turns a time-domain waveform into a stable amplitude distribution.

`Mismatched Negatives` makes absence visible: interlocking rectangles settle into two continuous rows for each MIDI-free rhythmic subdivision. Only a MIDI onset in that subdivision leaves its pair out of alignment. Time units from half a bar to four bars change the displayed window, with normal, dotted, and triplet subdivisions down to 1/64 notes. Slide-in and staggered slide-out durations and interpolation curves are configurable independently.

`Ball Jar` drops one physics-simulated ball into an open three-rectangle jar for every MIDI note onset. Balls collide with the jar and each other, and the jar clears at each configurable musical time unit.

```sh
npm install
npm run test
npm run check
npm run build
```
