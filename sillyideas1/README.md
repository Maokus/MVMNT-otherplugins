# Silly Ideas 1

`Sorted Waveform` reads a raw PCM frame around the playhead, sorts the samples from negative to positive amplitude, and renders the result as a line, bars, or dots. It intentionally turns a time-domain waveform into a stable amplitude distribution.

`Mismatched Negatives` makes absence visible: interlocking rectangles settle into two continuous rows for each MIDI-free rhythmic subdivision. Only a MIDI onset in that subdivision leaves its pair out of alignment. Time units from half a bar to four bars change the displayed window, with normal, dotted, and triplet subdivisions down to 1/64 notes. Slide-in and staggered slide-out durations and interpolation curves are configurable independently.

`Ball Jar` drops one physics-simulated ball into an open three-rectangle jar for every MIDI note onset. Balls collide with the jar and each other, and the jar clears at each configurable musical time unit.

`Dissolver` draws equally spaced circles for each MIDI note and time step in a repeating musical grid on a transparent background. Horizontal and vertical density insert circles between the time and pitch anchors; padding adds circles beyond the first and last time steps and above and below the note range. Each note onset remains full size while a ripple scales every other circle down by the end of the time unit. Expansion speed controls how quickly the front advances while preserving that endpoint. Circle, diamond (taxicab distance), and noisy distance fields change its shape; gradient controls border softness, with noise amount and texture scale available for the noisy field. At the next boundary, circles scale back in with a configurable stagger and smooth easing; new onsets can dissolve them again. Configure the lowest MIDI note and note count to set the vertical range, and choose the time step and time unit for the horizontal range.

```sh
npm install
npm run test
npm run check
npm run build
```
