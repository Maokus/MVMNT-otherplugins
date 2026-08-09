// @ts-nocheck
import { definePluginElement, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Text, type RenderObject } from '@mvmnt-app/plugin-sdk/render';
import {
    ElementRuntime,
    insertElementConfig,
    type EnhancedConfigSchema,
    type RendererContext,
    type RendererProps,
} from './element-runtime';

class TrackerlikeMidiDisplayElement {
    readonly runtime = new ElementRuntime();
    constructor(props: RendererProps, context: RendererContext) {
        this.runtime.attach(context, props);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            { tabs: [] },
            {
                name: 'Trackerlike Midi Display',
                description: 'A tracker-style MIDI display showing notes per beat in monospace text',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'The MIDI track to display notes from',
                            }),
                        ],
                    },
                    {
                        id: 'trackerLayout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('division', 'Division (rows per beat)', 4, {
                                min: 1,
                                max: 32,
                                step: 1,
                                description: '1 = quarter notes, 2 = 8th, 4 = 16th, etc.',
                            }),
                            prop.number('rowCount', 'Rows per page', 8, { step: 1 }),
                            prop.number('columns', 'Note columns', 4, {
                                min: 1,
                                max: 8,
                                step: 1,
                                description: 'How many simultaneous notes to show per row',
                            }),
                            prop.boolean('showTrackName', 'Show Track Name', true),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'trackerAppearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            prop.number('fontSize', 'Font Size', 16, { step: 1 }),
                            prop.colorAlpha('textColor', 'Text Color', '#e2e8f0FF'),
                            prop.colorAlpha('activeColor', 'Active Row Color', '#10B981FF'),
                            prop.colorAlpha('headerColor', 'Header Color', '#94a3b8FF'),
                        ],
                    },
                ]),
            ]
        );
    }

    render(targetTime: number): RenderObject[] {
        const props = this.runtime.props;

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        if (!props.midiTrackId) {
            objects.push(
                new Text(0, 0, 'Select a MIDI track', '14px monospace', {
                    color: '#94a3b8',
                    align: 'left',
                    baseline: 'top',
                })
            );
            return objects;
        }

        const timeline = this.runtime.context.timeline;
        const timing = this.runtime.context.timing;
        if (!timeline || !timing) {
            objects.push(
                new Text(0, 0, 'Timeline API unavailable', '12px monospace', {
                    color: '#64748b',
                    align: 'left',
                    baseline: 'top',
                })
            );
            return objects;
        }

        const division = Math.max(1, Math.round(props.division));
        const rowCount = props.rowCount;
        const columns = Math.max(1, Math.round(props.columns));
        const fontSize = props.fontSize;
        const lineHeight = Math.round(fontSize * 1.6);
        const font = `${fontSize}px monospace`;

        // Current position in subbeats (beats * division)
        const currentBeatsResult = timing.secondsToBeats(targetTime);
        const currentBeats = currentBeatsResult.ok ? currentBeatsResult.value : 0;
        const currentSubbeat = Math.floor(Math.max(0, currentBeats) * division);

        // Page: which group of rowCount subbeats are we in
        const pageStart = Math.floor(currentSubbeat / rowCount) * rowCount;
        const activeRowIndex = currentSubbeat - pageStart; // 0-indexed row within this page

        let yOffset = 0;

        // Header row
        if (props.showTrackName) {
            const track = timeline.getTrack(props.midiTrackId);
            const trackLabel = track.ok ? track.value.name : '?';
            objects.push(
                new Text(0, 0, ` T> ${trackLabel}`, font, {
                    color: props.headerColor,
                    align: 'left',
                    baseline: 'top',
                })
            );
            yOffset = lineHeight;
        }

        // Subbeat rows
        for (let i = 0; i < rowCount; i++) {
            const subbeat = pageStart + i; // 0-indexed absolute subbeat
            const isActive = i === activeRowIndex;

            // Time window for this subbeat (1/division of a beat wide)
            const startResult = timing.beatsToSeconds(subbeat / division);
            const endResult = timing.beatsToSeconds((subbeat + 1) / division);
            const subbeatStartSec = startResult.ok ? startResult.value : subbeat / division;
            const subbeatEndSec = endResult.ok ? endResult.value : (subbeat + 1) / division;

            // Get notes that START within this subbeat's window, up to `columns` of them
            const selected = timeline.selectNotes({
                trackIds: [props.midiTrackId],
                startSeconds: subbeatStartSec,
                endSeconds: subbeatEndSec,
            });
            const starting = (selected.ok ? selected.value : [])
                .filter((n) => n.startSeconds >= subbeatStartSec && n.startSeconds < subbeatEndSec)
                .slice(0, columns);

            // Build note columns: each is 4 chars wide ("C3  ", "C#3 ", "-- ")
            const noteCells = Array.from({ length: columns }, (_, col) => {
                const note = starting[col];
                return note ? (this.runtime.context.midi?.noteName(note.note) ?? String(note.note)).padEnd(4) : '--  ';
            });

            const cursor = isActive ? '>' : ' ';
            const rowNum = String(i + 1).padStart(2);
            const line = `${cursor}${rowNum} ${noteCells.join(' ')}`;

            const color = isActive ? props.activeColor : props.textColor;
            const y = yOffset + lineHeight * i;
            objects.push(new Text(0, y, line, font, { color, align: 'left', baseline: 'top' }));
        }

        return objects;
    }
}

export const trackerlikeMidiDisplay = definePluginElement({
    type: 'trackerlike-midi-display',
    metadata: {
        name: 'Trackerlike MIDI Display',
        description: 'A tracker-style MIDI note display',
        category: 'us.maok.midipack1',
    },
    schema: TrackerlikeMidiDisplayElement.getConfigSchema(),
    create(props, context) {
        const renderer = new TrackerlikeMidiDisplayElement(props, context);
        return renderer;
    },
    render(props, renderer, time) {
        renderer.runtime.update(props);
        return renderer.render(time.seconds);
    },
    dispose(renderer) {
        renderer.runtime.dispose();
    },
});
export default trackerlikeMidiDisplay;
