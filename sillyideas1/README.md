# Silly Ideas 1

`Sorted Waveform` reads a raw PCM frame around the playhead, sorts the samples from negative to positive amplitude, and renders the result as a line, bars, or dots. It intentionally turns a time-domain waveform into a stable amplitude distribution.

`Mismatched Negatives` makes absence visible: interlocking rectangles settle into two continuous rows for each MIDI-free rhythmic subdivision. Only a MIDI onset in that subdivision leaves its pair out of alignment. Time units from half a bar to four bars change the displayed window, with normal, dotted, and triplet subdivisions down to 1/64 notes. Slide-in and staggered slide-out durations and interpolation curves are configurable independently.

`Ball Jar` drops one physics-simulated ball into an open three-rectangle jar for every MIDI note onset. Balls collide with the jar and each other, and the jar clears at each configurable musical time unit.

`Dissolver` draws equally spaced marks for each MIDI note and time step in a repeating musical grid on a transparent background. Horizontal and vertical density insert marks between the time and pitch anchors; padding adds marks beyond the first and last time steps and above and below the note range. The default horizontal density is 3. Each note onset remains full size while a ripple scales nearby marks down. The ripple starts with a brief configurable burst, then travels at a constant speed. It continues across the time-unit boundary until each mark's staggered return begins. Circle, diamond, noisy, square, cross, star, spiral, wide oval, and tall oval distance fields change the ripple shape; the default is noisy with an amount of 2.75. Gradient controls border softness, and the noisy field has texture controls. Grid marks can be circles, squares, diamonds, triangles, or hexagons, with configurable rotation. Marks scale back in with a configurable stagger and smooth easing; new onsets can dissolve them again. Configure the lowest MIDI note and note count to set the vertical range, and choose the time step and time unit for the horizontal range.

`Grid Gravity` uses the same repeating mark grid. Each held MIDI note pulls marks toward its onset cell; the pull stops at note release. Simulated positions and velocities let the marks move under a spring back to their home cells, with adjustable pull strength, distance falloff, spring stiffness, and damping. Density, padding, time unit, pitch range, mark shape, and colors can be configured independently of Dissolver.

```sh
npm install
npm run test
npm run check
npm run build
```
