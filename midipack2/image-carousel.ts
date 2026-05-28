import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    VisualResourceHandle,
    resolveProjectAssetDescriptor,
    getRequiredPluginApi,
    PLUGIN_CAPABILITIES,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, Text, Rectangle } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// ── Animation constants ──────────────────────────────────────────────────────

const JUMP_DURATION = 0.3;
const JUMP_HEIGHT = 20;
const BOUNCE_DURATION = 0.5;
const BOUNCE_AMOUNT = 0.2;
// Flip: how far before/after the note onset the scale-down/up takes effect
const FLIP_PRE = 0.2;
const FLIP_POST = 0.2;

/** Compute animated x/y offset and w/h for the image given the current animation state. */
function animateImage(
    animation: string,
    elapsed: number,
    timeToNext: number | null,
    w: number,
    h: number
): { x: number; y: number; w: number; h: number } {
    if (animation === 'jump') {
        const progress = Math.min(elapsed / JUMP_DURATION, 1);
        const env = 1 - Math.pow(progress, 3);
        return { x: 0, y: -JUMP_HEIGHT * env, w, h };
    }

    if (animation === 'bounce') {
        const progress = Math.min(elapsed / BOUNCE_DURATION, 1);
        const scale = 1 + BOUNCE_AMOUNT * Math.exp(-progress * 6) * Math.cos(progress * Math.PI * 2.5);
        const dw = w * (scale - 1);
        const dh = h * (scale - 1);
        return { x: -dw / 2, y: -dh / 2, w: w * scale, h: h * scale };
    }

    if (animation === 'flipy' || animation === 'flipx') {
        let scale = 1;
        if (elapsed < FLIP_POST) {
            // Post-onset: ease-out from 0 → 1 (fast then slow)
            scale = Math.pow(Math.max(0, elapsed) / FLIP_POST, 0.5);
        } else if (timeToNext !== null && timeToNext < FLIP_PRE) {
            // Pre-onset: ease-in from 1 → 0 (slow then fast)
            const p = 1 - timeToNext / FLIP_PRE;
            scale = 1 - Math.pow(p, 2);
        }
        scale = Math.max(0, scale);

        if (animation === 'flipy') {
            const newH = h * scale;
            return { x: 0, y: (h - newH) / 2, w, h: newH };
        } else {
            const newW = w * scale;
            return { x: (w - newW) / 2, y: 0, w: newW, h };
        }
    }

    return { x: 0, y: 0, w, h };
}

// ─────────────────────────────────────────────────────────────────────────────

export class ImageCarouselElement extends SceneElement {
    private readonly _bundled = [
        this.bundledImage('bocchi_200px.png'),
        this.bundledImage('kita_200px.png'),
        this.bundledImage('nijika_200px.png'),
        this.bundledImage('ryo_200px.png'),
    ] as const;

    private readonly _userHandles = [
        new VisualResourceHandle(),
        new VisualResourceHandle(),
        new VisualResourceHandle(),
        new VisualResourceHandle(),
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
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        if (!props.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top')];
        }

        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
        if (!host.ok) return host.renderFallback();

        const animation = props.animation as string;
        const EPS = 1e-3;
        // For flip we need a short lookahead to detect the approaching next note
        const lookahead = animation === 'flipy' || animation === 'flipx' ? FLIP_PRE + EPS : EPS;

        const notes = host.api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: 0,
            endSec: targetTime + lookahead,
        });

        // Notes that started at or before targetTime determine the image index
        const pastNotes = notes.filter((n) => n.startTime <= targetTime);
        const imageIndex = pastNotes.length % 4;

        // Most recent onset drives animation timing
        const lastNote = pastNotes.length > 0 ? pastNotes[pastNotes.length - 1] : null;
        const elapsed = lastNote ? Math.max(0, targetTime - lastNote.startTime) : Infinity;

        // Next upcoming onset for flip pre-phase
        const nextNote = notes.find((n) => n.startTime > targetTime);
        const timeToNext = nextNote ? nextNote.startTime - targetTime : null;

        const userSrcs: (string | null)[] = [
            props.image1 as string | null,
            props.image2 as string | null,
            props.image3 as string | null,
            props.image4 as string | null,
        ];

        // Update all handles every frame so user assets are kept loaded
        const resources = userSrcs.map((src, i) =>
            src ? this._userHandles[i].update(resolveProjectAssetDescriptor(src)) : this._bundled[i].get()
        );

        const { resource, status } = resources[imageIndex];
        const w = props.imageWidth as number;
        const h = props.imageHeight as number;

        const { x, y, w: aw, h: ah } = animateImage(animation, elapsed, timeToNext, w, h);

        const vm = new VisualMedia(x, y, aw, ah, { fitMode: 'contain', layoutBoundsMode: 'none' });
        vm.setResource(resource, status);

        // Stable layout anchor — VisualMedia opts out of layout bounds via layoutBoundsMode: 'none'
        return [new Rectangle(0, 0, w, h, null, 'transparent', 1), vm];
    }
}
