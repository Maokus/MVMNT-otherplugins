import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    VisualMediaPlayback,
    sampleAudio,
    registerFeatureRequirements,
    timeToBeats,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, EmptyRenderObject, Rectangle, Text, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type {
    BundledSprite,
    ResourceHandleResult,
    EnhancedConfigSchema,
    VisualResource,
    ResourceStatus,
} from '@mvmnt/plugin-sdk';

registerFeatureRequirements('boinker', [{ feature: 'rms' }]);

const BASE_SIZE = 600;

interface Part {
    handle: BundledSprite;
    renderObject: VisualMedia;
    defaultTransforms: {
        rotation?: number;
        scaleX?: number;
        scaleY?: number;
        pivotX?: number;
        pivotY?: number;
        x?: number;
        y?: number;
    };
    resource?: VisualResource;
    status?: ResourceStatus;
}

export class BoinkerElement extends SceneElement {
    private readonly _parts: { [index: string]: Part } = {
        body: {
            handle: this.bundledImage('Body.png'),
            renderObject: new VisualMedia(0, 0, BASE_SIZE, BASE_SIZE, { layoutBoundsMode: 'none' }),
            defaultTransforms: { x: 310, y: 270 },
        },
        head: {
            handle: this.bundledImage('Head.png'),
            renderObject: new VisualMedia(0, 0, BASE_SIZE, BASE_SIZE, { layoutBoundsMode: 'none' }),
            defaultTransforms: { x: 300, y: 100 },
        },
        armL: {
            handle: this.bundledImage('ArmL.png'),
            renderObject: new VisualMedia(0, 0, BASE_SIZE, BASE_SIZE, { layoutBoundsMode: 'none' }),
            defaultTransforms: { x: 120, y: 340 },
        },
        armR: {
            handle: this.bundledImage('ArmR.png'),
            renderObject: new VisualMedia(0, 0, BASE_SIZE, BASE_SIZE, { layoutBoundsMode: 'none' }),
            defaultTransforms: { x: 480, y: 320 },
        },
        legL: {
            handle: this.bundledImage('LegL.png'),
            renderObject: new VisualMedia(0, 0, BASE_SIZE, BASE_SIZE, { layoutBoundsMode: 'none' }),
            defaultTransforms: { x: 220, y: 600, pivotX: 0.5, pivotY: 1 },
        },
        legR: {
            handle: this.bundledImage('LegR.png'),
            renderObject: new VisualMedia(0, 0, BASE_SIZE, BASE_SIZE, { layoutBoundsMode: 'none' }),
            defaultTransforms: { x: 440, y: 600, pivotX: 0.5, pivotY: 1 },
        },
    };

    private readonly _playback = new VisualMediaPlayback();
    private readonly _container = new EmptyRenderObject(0, 0, 1, 1, 1);
    private readonly _layoutRect = new Rectangle(0, 0, BASE_SIZE, BASE_SIZE, { fillColor: null });

    constructor(id: string = 'boinker', config: Record<string, unknown> = {}) {
        super('boinker', id, config);
        for (const partKey in this._parts) {
            this._container.addChild(this._parts[partKey].renderObject);
        }
    }

    protected override onDestroy(): void {
        for (const partKey in this._parts) {
            this._parts[partKey].handle.destroy();
        }
        super.onDestroy();
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Boinker',
                description: 'A character that bounces in time with the music',
                category: 'us.maok.boinker',
            },
            [
                tab.properties([
                    {
                        id: 'boinkerSettings',
                        label: 'Boinker',
                        collapsed: false,
                        properties: [
                            prop.audioTrack('audioTrackId', 'Audio Track'),
                            prop.number('size', 'Size', 1, { min: 0.1, max: 5, step: 0.05 }),
                            prop.number('sensitivity', 'Sensitivity', 2.5, { min: 0.5, max: 8, step: 0.1 }),
                            prop.number('debugRot', 'Debug Rotation', 0, { step: 0.1 }),
                            prop.number('debugAnchorX', 'Debug Anchor X', 0, { step: 0.1, min: 0, max: 1 }),
                            prop.number('debugAnchorY', 'Debug Anchor Y', 0, { step: 0.1, min: 0, max: 1 }),
                            prop.number('debugPivotX', 'Debug Pivot X', 0, { step: 0.1, min: 0, max: 1 }),
                            prop.number('debugPivotY', 'Debug Pivot Y', 0, { step: 0.1, min: 0, max: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        if (!props.audioTrackId) {
            return [new Text(0, 0, 'Select an audio track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top')];
        }

        // Prepare resources and media objects
        for (const partKey in this._parts) {
            const part = this._parts[partKey];
            const result: ResourceHandleResult = part.handle.get();
            if (result.resource) {
                part.resource = result.resource;
            }
            part.status = result.status;

            if (part.resource) {
                part.renderObject.width = part.resource.width;
                part.renderObject.height = part.resource.height;
                part.renderObject
                    .setResource(part.resource, part.status)
                    .setFitMode('clip')
                    .setLayoutBoundsMode('none')
                    .setOriginFraction(part.defaultTransforms.pivotX ?? 0.5, part.defaultTransforms.pivotY ?? 0.5);
                part.renderObject.rotation = part.defaultTransforms.rotation ?? 0;
                part.renderObject.scaleX = part.defaultTransforms.scaleX ?? 0.4;
                part.renderObject.scaleY = part.defaultTransforms.scaleY ?? 0.4;
                part.renderObject.x = part.defaultTransforms.x ?? 0;
                part.renderObject.y = part.defaultTransforms.y ?? 0;
            }
        }

        const rmsResult = sampleAudio(props.audioTrackId as string | null, 'rms', targetTime, {
            element: this,
            samplingOptions: { smoothing: 6 },
        });
        const sensitivity = (props.sensitivity as number) ?? 2.5;
        const rms = Math.min(1, (rmsResult?.values?.[0] ?? 0) * sensitivity);

        // Head bump: smooth arch up and back down once per beat
        const beatPhase = timeToBeats(targetTime) % 1;
        const headBump = Math.sin(beatPhase * Math.PI); // 0 → peak → 0 over one beat
        const headBumpPixels = 25 * ((props.size as number) ?? 1);
        this._parts.head.renderObject.y = (this._parts.head.defaultTransforms.y ?? 0) - headBump * headBumpPixels;

        const size = (props.size as number) ?? 1;

        this._playback.computeLocalTime(targetTime);
        const displaySize = BASE_SIZE * size;

        this._container.x = 0;
        this._container.setAnchorOffset(displaySize / 2, displaySize);

        this._layoutRect.width = displaySize;
        this._layoutRect.height = displaySize;

        return [this._layoutRect, this._container];
    }
}
