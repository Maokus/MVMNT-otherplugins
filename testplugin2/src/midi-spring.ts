import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const midiSpring = definePluginElement({
    type: 'midi-spring',
    metadata: { name: 'Midi Spring', description: 'A custom midi spring element', category: 'Custom' },
    schema: {
        tabs: [
            tab.content([
                group('spring', 'Spring', [
                    prop.midiTrack('midiTrackId', 'MIDI Track'),
                    prop.number('seed', 'Seed', 1),
                    prop.number('stiffness', 'Stiffness', 40),
                    prop.number('damping', 'Damping', 5),
                    prop.number('strength', 'Impulse Strength', 100),
                ]),
            ]),
        ],
    },
    simulation: {
        initialize: ({ seed }) => ({ position: 0, velocity: (seed % 17) / 17 }),
        step({ state, props, context, deltaSeconds }) {
            const notes = props.midiTrackId ? context.noteOns([props.midiTrackId]) : undefined;

            const impulse = notes?.ok ? notes.value.length * props.strength : 0;
            const velocity =
                state.velocity +
                impulse -
                (props.stiffness * state.position + props.damping * state.velocity) * deltaSeconds;
            return { position: state.position + velocity * deltaSeconds, velocity };
        },
    },
    render({ simulation, context }) {
        return [new Rectangle(0, 0, 40, 40, { fillColor: "#00000000" }), new Rectangle(0, simulation.state.position, 40, 40, { fillColor: '#10B981FF', layoutParticipation: "exclude" })];
    },
});
