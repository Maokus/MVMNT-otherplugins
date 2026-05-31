// Template: Minimal Element
// The simplest possible scene element — a good starting point for anything custom.
// Renders a single colored rectangle. Replace the rendering logic with your own.
import { SceneElement, prop, insertElementConfig, tab, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class AmurulikePianorollElement extends SceneElement {
    constructor(id: string = 'amurulike-pianoroll', config: Record<string, unknown> = {}) {
        super('amurulike-pianoroll', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Amurulike Pianoroll',
                description: 'A piano roll inspired by @amuru_chiptune',
                category: 'us.maok.pixelperfect',
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
        return [new Rectangle(-half, -half, props.size, props.size, { fillColor: props.color })];
    }
}
