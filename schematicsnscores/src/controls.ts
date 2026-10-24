import { prop, type ElementPropertyDefinition, type ElementSchema } from '@mvmnt-app/plugin-sdk';
import type { Language } from './model';

export const titles: Record<Language, string> = {
    cage: 'Cage', penderecki: 'Penderecki', decesare: 'De Cesare', notation: 'Notation', schematic: 'Schematic',
    isometric: 'Isometric', wall: 'Wall', mechanism: 'Mechanism', field: 'Field', matrix: 'Matrix',
};
export const descriptions: Record<Language, string> = {
    cage: 'Sparse points and fine curves suspended in open space.',
    penderecki: 'Massed tone clusters, wedges, and fine hatching.',
    decesare: 'Irregular boxed cells and a geometric glyph vocabulary.',
    notation: 'Decorative five-line scores shaped by MIDI pitches and durations.',
    schematic: 'Dimensioned engineering diagrams, arrows, and mathematical annotations.',
    isometric: 'Axonometric wireframes with MIDI-driven elevations and played nodes.',
    wall: 'Long, layered pitch contours stretched across a phrase.',
    mechanism: 'Pulley trains and belts driven by the MIDI phrase.',
    field: 'Scattered clusters of small, varied marks.',
    matrix: 'A punch-card grid of MIDI-driven cells and slots.',
};
const n = (key: string, label: string, value: number, min: number, max: number, step = .1) => prop.number(key, label, value, { min, max, step });
const specific: Record<Language, ElementPropertyDefinition[]> = {
    cage: [n('pointSize', 'Point Size', 1.6, .3, 8), n('connections', 'Connections', .35, 0, 1, .05)],
    penderecki: [n('bandThickness', 'Band Thickness', 1, .2, 3), n('hatchSpacing', 'Hatch Spacing', 4, 1, 20, 1)],
    decesare: [n('cellSize', 'Cell Size', 22, 8, 80, 1), prop.boolean('showBoxes', 'Show Boxes', true)],
    notation: [n('staffCount', 'Staff Count', 1, 1, 4, 1), n('noteScale', 'Note Scale', 1, .5, 2)],
    schematic: [n('diagramScale', 'Diagram Scale', 1, .4, 2), prop.boolean('showAnnotations', 'Show Annotations', true)],
    isometric: [n('projectionDepth', 'Projection Depth', 20, 2, 80, 1), n('nodeSize', 'Node Size', 2.2, .5, 8)],
    wall: [n('contourCount', 'Contour Count', 5, 1, 16, 1), n('contourSpread', 'Contour Spread', 3, .5, 10, .5)],
    mechanism: [n('pulleySize', 'Pulley Size', 1, .3, 2), n('beltDetail', 'Belt Detail', .6, 0, 1, .05)],
    field: [n('markSize', 'Mark Size', 3, 1, 12, .5), n('scatter', 'Scatter', .7, 0, 1, .05)],
    matrix: [n('rows', 'Rows', 12, 2, 32, 1), n('subdivision', 'Columns per Beat', 2, 1, 8, 1)],
};
export function schema(language: Language): ElementSchema {
    return {
        tabs: [
            { id: 'content', label: 'Content', groups: [
                { id: 'midi', label: 'MIDI & Pages', properties: [
                    prop.midiTrack('midiTrackId', 'MIDI Track'),
                    n('pageBars', 'Bars per Page', 4, 1, 16, 1),
                    prop.number('pageOffset', 'Page Offset (beats)', 0, { min: -4096, max: 4096, step: .25, description: 'Shift phrase boundaries relative to timeline beat zero.' }),
                ] },
                { id: 'layout', label: 'Layout', properties: [
                    n('width', 'Width', 640, 16, 8192, 1), n('height', 'Height', 160, 16, 8192, 1), n('padding', 'Padding', 12, 0, 512, 1),
                    prop.select('orientation', 'Orientation', 'horizontal', [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }]),
                ] },
                { id: 'composition', label: 'Composition', properties: [
                    n('density', 'Density', .65, 0, 1, .05), n('seed', 'Seed', 1998, 0, 2147483647, 1),
                    prop.boolean('autoRange', 'Auto Pitch Range', true),
                    prop.number('minNote', 'Lowest MIDI Pitch', 36, { min: 0, max: 127, step: 1, visibleWhen: [{ key: 'autoRange', equals: false }] }),
                    prop.number('maxNote', 'Highest MIDI Pitch', 84, { min: 0, max: 127, step: 1, visibleWhen: [{ key: 'autoRange', equals: false }] }),
                    ...specific[language],
                ] },
            ] },
            { id: 'appearance', label: 'Appearance', groups: [
                { id: 'palette', label: 'Palette & Marks', properties: [
                    prop.colorAlpha('inkColor', 'Ink', '#F5F1E8FF'), prop.colorAlpha('accentColor', 'Accent', '#C76760FF'),
                    prop.colorAlpha('guideColor', 'Guides', '#F5F1E830'), prop.colorAlpha('backgroundColor', 'Background', '#00000000'),
                    n('strokeWidth', 'Stroke Width', .8, .1, 8), n('markScale', 'Mark Scale', 1, .25, 4),
                    prop.boolean('showGuides', 'Show Structural Guides', false),
                ], presets: [
                    { id: 'monochrome', label: 'Monochrome', values: { inkColor: '#F5F1E8FF', accentColor: '#F5F1E8FF', guideColor: '#F5F1E830', backgroundColor: '#00000000' } },
                    { id: 'paper', label: 'Ink on Paper', values: { inkColor: '#191715FF', accentColor: '#B64E49FF', guideColor: '#19171530', backgroundColor: '#F1EBDDFF' } },
                    { id: 'blueprint', label: 'Blueprint', values: { inkColor: '#E3EEF5FF', accentColor: '#EAB76CFF', guideColor: '#E3EEF530', backgroundColor: '#102E46FF' } },
                ] },
                { id: 'playback', label: 'Playback', properties: [
                    n('accentStrength', 'Accent Strength', .55, 0, 1, .05), n('release', 'Release (seconds)', .45, .01, 5, .05),
                    n('motionAmount', 'Motion Amount', .5, 0, 8), prop.boolean('showPlayhead', 'Show Playhead', false),
                ] },
            ] },
        ],
    };
}
