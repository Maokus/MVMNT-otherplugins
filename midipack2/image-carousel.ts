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
                            prop.imageAsset('image1', 'Image 1', {
                                description: 'First image. Defaults to Bocchi.',
                            }),
                            prop.imageAsset('image2', 'Image 2', {
                                description: 'Second image. Defaults to Kita.',
                            }),
                            prop.imageAsset('image3', 'Image 3', {
                                description: 'Third image. Defaults to Nijika.',
                            }),
                            prop.imageAsset('image4', 'Image 4', {
                                description: 'Fourth image. Defaults to Ryo.',
                            }),
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

        // Count note onsets up to targetTime; each onset advances the carousel by one
        const EPS = 1e-3;
        const notes = host.api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: 0,
            endSec: targetTime + EPS,
        });
        const imageIndex = notes.length % 4;

        const userSrcs: (string | null)[] = [
            props.image1 as string | null,
            props.image2 as string | null,
            props.image3 as string | null,
            props.image4 as string | null,
        ];

        // Update all handles each frame so asset loads are kept fresh
        const resources = userSrcs.map((src, i) =>
            src
                ? this._userHandles[i].update(resolveProjectAssetDescriptor(src))
                : this._bundled[i].get()
        );

        const { resource, status } = resources[imageIndex];
        const w = props.imageWidth as number;
        const h = props.imageHeight as number;

        const vm = new VisualMedia(0, 0, w, h, { fitMode: 'contain', layoutBoundsMode: 'none' });
        vm.setResource(resource, status);

        return [new Rectangle(0, 0, w, h, null, 'transparent', 1), vm];
    }
}
