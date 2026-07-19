// @ts-nocheck
import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import {
    CallbackElementRenderer,
    prop,
    insertElementConfig,
    tab,

    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import { VisualMedia, Text, Rectangle } from '@mvmnt-app/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';
import { applyAnimation, FLIP_PRE } from './animations';

// ─────────────────────────────────────────────────────────────────────────────

class ImageCarouselElement extends CallbackElementRenderer {
    private readonly _bundled = [
        this.bundledImage('bocchi_200px.png'),
        this.bundledImage('kita_200px.png'),
        this.bundledImage('nijika_200px.png'),
        this.bundledImage('ryo_200px.png'),
    ] as const;

    private readonly _userHandles = [
        this.visualHandle(),
        this.visualHandle(),
        this.visualHandle(),
        this.visualHandle(),
    ] as const;

    constructor(id: string = 'image-carousel', config: Record<string, unknown> = {}) {
        super('image-carousel', id, config);
    }

    protected override onDestroy(): void {
        this._bundled.forEach((b) => b.destroy());
        this._userHandles.forEach((h) => h.destroy());
        super.onDestroy();
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Image Carousel',
                description: 'Cycles through 4 images on each MIDI note onset',
                category: 'us.maok.midipack2',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'MIDI track to monitor for note onsets',
                            }),
                        ],
                    },
                    {
                        id: 'images',
                        label: 'Images',
                        collapsed: false,
                        properties: [
                            prop.imageAsset('image1', 'Image 1', { description: 'Defaults to Bocchi.' }),
                            prop.imageAsset('image2', 'Image 2', { description: 'Defaults to Kita.' }),
                            prop.imageAsset('image3', 'Image 3', { description: 'Defaults to Nijika.' }),
                            prop.imageAsset('image4', 'Image 4', { description: 'Defaults to Ryo.' }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'imageSize',
                        label: 'Image Size',
                        collapsed: false,
                        properties: [
                            prop.number('imageWidth', 'Width', 200, { step: 1 }),
                            prop.number('imageHeight', 'Height', 200, { step: 1 }),
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        properties: [
                            prop.select('animation', 'Animation', 'none', [
                                { value: 'none', label: 'None' },
                                { value: 'bounce', label: 'Bounce' },
                                { value: 'jump', label: 'Jump' },
                                { value: 'flipy', label: 'Flip Y' },
                                { value: 'flipx', label: 'Flip X' },
                            ]),
                            prop.number('animDuration', 'Duration (s)', 0.3, {
                                min: 0.01,
                                step: 0.01,
                                visibleWhen: [{ key: 'animation', notEquals: 'none' }],
                            }),
                            prop.number('animAmount', 'Amount', 10, {
                                min: 0,
                                step: 0.5,
                                visibleWhen: [{ key: 'animation', notEquals: 'none' }],
                            }),
                        ],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        if (!props.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', {
                color: '#94a3b8', align: 'left', baseline: 'top',
            })];
        }

        const animation = props.animation as string;
        const animDuration = (props.animDuration as number) ?? 0.3;
        const animAmount = (props.animAmount as number) ?? 10;
        const EPS = 1e-3;
        const lookahead = animation === 'flipy' || animation === 'flipx' ? FLIP_PRE + EPS : EPS;

        const notesResult = this.context.timeline?.selectNotes({
            trackIds: [props.midiTrackId],
            startSeconds: 0,
            endSeconds: targetTime + lookahead,
        });
        if (!notesResult?.ok) return [];
        const notes = notesResult.value.map((note) => ({ ...note, startTime: note.startSeconds }));

        const pastNotes = notes.filter((n) => n.startTime <= targetTime);
        const imageIndex = pastNotes.length % 4;

        const lastNote = pastNotes.length > 0 ? pastNotes[pastNotes.length - 1] : null;
        const elapsed = lastNote ? Math.max(0, targetTime - lastNote.startTime) : Infinity;

        const nextNote = notes.find((n) => n.startTime > targetTime);
        const timeToNext = nextNote ? nextNote.startTime - targetTime : null;

        const userSrcs: (string | null)[] = [
            props.image1 as string | null,
            props.image2 as string | null,
            props.image3 as string | null,
            props.image4 as string | null,
        ];

        const resources = userSrcs.map((src, i) =>
            src ? this._userHandles[i].update(src) : this._bundled[i].get()
        );

        const { resource, status } = resources[imageIndex];
        const w = props.imageWidth as number;
        const h = props.imageHeight as number;

        // Centre the VisualMedia at the element origin so scaleX/scaleY animate from the middle
        const vm = new VisualMedia(w / 2, h / 2, w, h, {
            fitMode: 'contain',
            layoutParticipation: 'exclude',
        });
        vm.setResource(resource, status).setOrigin(w / 2, h / 2);

        applyAnimation(vm, animation, elapsed, timeToNext, animDuration, animAmount);

        return [new Rectangle(0, 0, w, h, { fillColor: null, strokeColor: 'transparent' }), vm];
    }
}

export const imageCarousel = defineRendererElement({ type: 'image-carousel', capabilities: { required: ['timeline.read'], optional: [] }, }, ImageCarouselElement);
export default imageCarousel;
