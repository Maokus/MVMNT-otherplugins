// @ts-nocheck
import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
// Audio-reactive GIF frame controller. The selected frame is calculated solely
// from the requested timeline time, so scrubbing and export are deterministic.
import {
    CallbackElementRenderer,
    prop,
    insertElementConfig,
    tab,
    Rectangle,
    type RenderObject,
    type VisualResource,
} from '@mvmnt-app/plugin-sdk';
import { VisualMedia } from '@mvmnt-app/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';

function frameStartTime(resource: VisualResource | null, normalizedVolume: number): number {
    const frames = resource?.frames ?? [];
    if (frames.length < 2) return 0;

    // Map silence to frame 0 and the configured loudness ceiling to the final
    // decoded GIF frame. Frame delays can vary, so use their real durations
    // instead of assuming a fixed frame rate.
    const frameIndex = Math.min(frames.length - 1, Math.floor(normalizedVolume * (frames.length - 1)));
    let milliseconds = 0;
    for (let index = 0; index < frameIndex; index += 1) {
        milliseconds += frames[index].durationMs;
    }
    return milliseconds / 1000;
}

class EbWubElement extends CallbackElementRenderer {
    private readonly _bundledGif = this.bundledSprite('eb_wub.gif');
    private readonly _selectedAsset = this.visualHandle();
    private readonly _media = new VisualMedia(0, 0, 320, 320, { layoutParticipation: 'exclude' });
    private readonly _layoutRect = new Rectangle(0, 0, 320, 320, { fillColor: '#00000000' }).setLayoutParticipation('include');

    constructor(id: string = 'eb-wub', config: Record<string, unknown> = {}) {
        super('eb-wub', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'EB Wub GIF',
                description: 'Selects a GIF frame from the volume of an audio track.',
                category: 'us.maok.ebwub',
            },
            [
                tab.content([
                    {
                        id: 'source',
                        label: 'GIF Source',
                        collapsed: false,
                        properties: [
                            prop.imageAsset('imageSource', 'Custom GIF', {
                                description: 'Choose an image or GIF from the Asset Manager. Leave empty to use EB Wub.',
                            }),
                            prop.audioTrack('audioTrackId', 'Audio Track', {
                                description: 'The track whose volume selects the GIF frame.',
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'layout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('width', 'Width (px)', 320, { min: 1, max: 4096, step: 1 }),
                            prop.number('height', 'Height (px)', 320, { min: 1, max: 4096, step: 1 }),
                            prop.select('fitMode', 'Fit Mode', 'contain', [
                                { value: 'contain', label: 'Contain' },
                                { value: 'cover', label: 'Cover' },
                                { value: 'fill', label: 'Fill' },
                                { value: 'clip', label: 'Clip (native size)' },
                            ]),
                        ],
                    },
                ]),
                tab.animation([
                    {
                        id: 'audioResponse',
                        label: 'Audio Response',
                        collapsed: false,
                        properties: [
                            prop.number('volumeForLastFrame', 'Volume for Last Frame', 0.2, {
                                min: 0.001,
                                max: 1,
                                step: 0.001,
                                description: 'RMS volume that selects the final GIF frame. Louder audio remains on that frame.',
                            }),
                            prop.number('smoothing', 'Smoothing', 4, {
                                min: 0,
                                max: 64,
                                step: 1,
                                description: 'RMS averaging window: 25 ms plus 10 ms per step.',
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

        const width = props.width as number;
        const height = props.height as number;
        this._layoutRect.width = width;
        this._layoutRect.height = height;

        const sourceId = props.imageSource as string | null;
        const { resource, status } = sourceId
            ? this._selectedAsset.update(sourceId)
            : this._bundledGif.get();
        const trackId = props.audioTrackId as string | null;
        const smoothing = props.smoothing as number;
        const windowSec = Math.max(0.025, smoothing * 0.01);
        const rmsResult = trackId
            ? this.context.audio?.getRms({
                  trackId,
                  startSeconds: targetTime - windowSec / 2,
                  endSeconds: targetTime + windowSec / 2,
              })
            : null;
        const rms = rmsResult?.ok ? rmsResult.value : null;
        const volume = rms && rms.length > 0 ? Math.max(0, rms.reduce((sum, value) => sum + value, 0) / rms.length) : 0;
        const ceiling = Math.max(0.001, props.volumeForLastFrame as number);
        const localTime = frameStartTime(resource, Math.min(1, volume / ceiling));

        this._media
            .setResource(resource, status)
            .setAnimation(null)
            .setLocalTime(localTime)
            .setDimensions(width, height)
            .setFitMode(props.fitMode as 'contain' | 'cover' | 'fill' | 'clip');

        return [this._layoutRect, this._media];
    }
}

export const ebWub = defineRendererElement({ type: 'eb-wub', capabilities: { required: ['audio.raw.read'], optional: [] }, }, EbWubElement);
export default ebWub;
