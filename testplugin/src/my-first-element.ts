import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Rectangle, type RenderObject } from '@mvmnt-app/plugin-sdk/render';

interface MyFirstElementProps extends Readonly<Record<string, unknown>> {
    readonly color: string;
    readonly size: number;
}

export const myFirstElement = definePluginElement<MyFirstElementProps, undefined>({
    type: 'my-first-element',
    metadata: {
        name: 'My First Element',
        description: 'A minimal SDK 2 custom element',
        category: 'us.maok.testplugin',
    },
    schema: {
        tabs: [{
            id: 'properties', label: 'Properties', groups: [{
                id: 'appearance', label: 'Appearance', collapsed: false,
                properties: [
                    { key: 'color', label: 'Color', type: 'colorAlpha', default: '#3B82F6FF' },
                    { key: 'size', label: 'Size', type: 'number', default: 100, min: 10, max: 500, step: 1 },
                ],
            }],
        }],
    },
    capabilities: { required: [], optional: [] },
    render(props): readonly RenderObject[] {
        return [new Rectangle(0, 0, props.size, props.size, { fillColor: props.color })];
    },
});
