// Template: Minimal Element
// The simplest possible scene element — a good starting point for anything custom.
// Renders a single colored rectangle. Replace the rendering logic with your own.
import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    Rectangle,
    type RenderObject,
    PixelGrid,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class MyFirstElementElement extends SceneElement {
    constructor(id: string = 'my-first-element', config: Record<string, unknown> = {}) {
        super('my-first-element', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'My First Element',
                description: 'A custom my first element element',
                category: 'us.maok.testplugin',
            },
            [
                tab.properties([
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('color', 'Color', '#3B82F6FF'),
                            prop.number('size', 'Size', 100, { min: 10, max: 500, step: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const half = (props.size as number) / 2;

        let objects: RenderObject[] = [];

        let pixelData = new Uint8ClampedArray(4 * 4 * 3);
        for (let i = 0; i < 4 * 4 * 3; i += 4) {
            pixelData[i] = 255; // R
            pixelData[i + 1] = 0; // G
            pixelData[i + 2] = 0; // B
            pixelData[i + 3] = 255; // A
        }

        pixelData[8] = 0;

        objects.push(new PixelGrid(100, 100, 4, 3, 50, pixelData));

        return objects;
    }
}
