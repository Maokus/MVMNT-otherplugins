export * from '@mvmnt-app/plugin-sdk';
export * from '@mvmnt-app/plugin-sdk/audio';
export * from '@mvmnt-app/plugin-sdk/render';
export * from '@mvmnt-app/plugin-sdk/timeline';
export * from '@mvmnt-app/plugin-sdk/timing';
export * from '@mvmnt-app/plugin-sdk/visual-assets';

import {
    PluginContractError,
    definePluginElement,
    type CapabilityContext,
    type ElementContext,
    type ElementPropertyTab,
    type ElementSchema,
} from '@mvmnt-app/plugin-sdk';
import type { AudioCalculator, AudioFeatureRequirement } from '@mvmnt-app/plugin-sdk/audio';
import type { RenderObject } from '@mvmnt-app/plugin-sdk/render';

export interface EnhancedConfigSchema extends ElementSchema {
    readonly name: string;
    readonly description: string;
    readonly category?: string;
}

export function insertElementConfig(
    base: Partial<EnhancedConfigSchema>,
    overrides: Partial<Pick<EnhancedConfigSchema, 'name' | 'description' | 'category' | 'presets'>>,
    pluginTabs: readonly ElementPropertyTab[]
): EnhancedConfigSchema {
    return {
        name: overrides.name ?? base.name ?? '',
        description: overrides.description ?? base.description ?? '',
        ...(base.category || overrides.category ? { category: overrides.category ?? base.category } : {}),
        ...(overrides.presets || base.presets ? { presets: overrides.presets ?? base.presets } : {}),
        tabs: [...(base.tabs?.slice(0, 1) ?? []), ...pluginTabs],
    };
}

export abstract class CallbackElementRenderer {
    protected context!: ElementContext<Readonly<Record<string, unknown>>>;
    private props: Readonly<Record<string, unknown>> = Object.freeze({ visible: true });
    private readonly pendingAssets: Array<(context: CapabilityContext) => void> = [];

    constructor(_type?: string, _id?: string | null, config: Record<string, unknown> = {}) {
        this.props = Object.freeze({ visible: true, ...config });
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return { name: '', description: '', tabs: [] };
    }

    __attach(
        context: ElementContext<Readonly<Record<string, unknown>>>,
        props: Readonly<Record<string, unknown>>
    ): void {
        this.context = context;
        this.__update(props);
        this.pendingAssets.splice(0).forEach((attach) => attach(context));
    }

    __update(props: Readonly<Record<string, unknown>>): void {
        this.props = Object.freeze({ visible: true, ...props });
    }

    __dispose(): void {
        this.onDestroy();
    }

    protected onDestroy(): void {}

    protected getProperty<T>(key: string): T {
        return this.props[key] as T;
    }

    protected getSchemaProps(): any {
        return this.props;
    }

    protected secondsToBeats(seconds: number): number {
        const result = this.context.timing?.secondsToBeats(seconds);
        return result?.ok ? result.value : 0;
    }

    protected secondsToTicks(seconds: number): number {
        const result = this.context.timing?.secondsToTicks(seconds);
        return result?.ok ? result.value : 0;
    }

    protected bundledImage(path: string): any {
        return this.lazyAsset((context) => context.assets.bundledImage(path));
    }

    protected bundledSprite(path: string): any {
        return this.bundledImage(path);
    }

    protected bundledSparrow(imagePath: string, xmlPath: string, fps?: number): any {
        return this.lazyAsset((context) => context.assets.bundledSparrow(imagePath, xmlPath, fps));
    }

    protected bundledGridAtlas(
        path: string,
        layout: Readonly<{ columns: number; rows: number; frameDurationMs?: number }>
    ): any {
        return this.lazyAsset((context) => context.assets.bundledGridAtlas(path, layout));
    }

    protected visualHandle(): any {
        return this.lazyAsset((context) => context.assets.project());
    }

    private lazyAsset(factory: (context: CapabilityContext) => any): any {
        let handle: any;
        this.pendingAssets.push((context) => {
            handle = factory(context);
        });
        return {
            get: () => handle?.get?.() ?? { resource: null, status: 'idle' },
            update: (id: string | null) => handle?.update?.(id) ?? { resource: null, status: 'idle' },
            destroy: () => handle?.dispose?.(),
            dispose: () => handle?.dispose?.(),
        };
    }

    abstract _buildRenderObjects(config: unknown, targetTime: number): readonly RenderObject[];
}

export function defineRendererElement(
    input: Readonly<{
        type: string;
        featureRequirements?: readonly AudioFeatureRequirement[];
        calculators?: readonly AudioCalculator[];
    }>,
    Renderer: (new (id?: string, config?: Record<string, unknown>) => CallbackElementRenderer) & {
        getConfigSchema(): EnhancedConfigSchema;
    }
) {
    const schema = Renderer.getConfigSchema();
    return definePluginElement({
        type: input.type,
        metadata: { name: schema.name, description: schema.description, category: schema.category },
        schema,
        load(context) {
            for (const calculator of input.calculators ?? []) {
                const registered = context.audioCalculators?.register(calculator);
                if (!registered?.ok)
                    throw new PluginContractError(
                        registered?.error.message ?? `Unable to register calculator '${calculator.id}'`
                    );
            }
            if (input.featureRequirements?.length) {
                const result = context.audio?.requireFeatures(input.featureRequirements);
                if (!result?.ok)
                    throw new PluginContractError(
                        result?.error.message ?? 'audio.features.read is required for feature requirements'
                    );
            }
        },
        create(props, context) {
            const renderer = new Renderer(input.type, { ...props });
            renderer.__attach(context, props);
            return renderer;
        },
        render(props, renderer, time) {
            renderer.__update(props);
            return renderer._buildRenderObjects({}, time.seconds);
        },
        dispose(renderer) {
            renderer.__dispose();
        },
    });
}
