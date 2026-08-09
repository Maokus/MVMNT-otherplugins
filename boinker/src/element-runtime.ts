import type { CapabilityContext, ElementContext, ElementPropertyTab, ElementSchema } from '@mvmnt-app/plugin-sdk';

export type RendererProps = Readonly<Record<string, unknown>>;
export type RendererContext = ElementContext<RendererProps>;

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

/** Instance-local services used by the existing stateful drawing implementations. */
export class ElementRuntime {
    context!: RendererContext;
    props: any = Object.freeze({ visible: true });

    private readonly pendingAssets: Array<(context: CapabilityContext) => void> = [];
    private readonly assetHandles: Array<{ dispose?: () => void }> = [];

    attach(context: RendererContext, props: RendererProps): void {
        this.context = context;
        this.update(props);
        this.pendingAssets.splice(0).forEach((attach) => attach(context));
    }

    update(props: RendererProps): void {
        this.props = Object.freeze({ visible: true, ...props });
    }

    dispose(): void {
        this.pendingAssets.length = 0;
        this.assetHandles.splice(0).forEach((handle) => handle.dispose?.());
    }

    secondsToBeats(seconds: number): number {
        const result = this.context.timing?.secondsToBeats(seconds);
        return result?.ok ? result.value : 0;
    }

    secondsToTicks(seconds: number): number {
        const result = this.context.timing?.secondsToTicks(seconds);
        return result?.ok ? result.value : 0;
    }

    bundledImage(path: string): any {
        return this.lazyAsset((context) => context.assets.bundledImage(path));
    }

    bundledSprite(path: string): any {
        return this.bundledImage(path);
    }

    bundledSparrow(imagePath: string, xmlPath: string, fps?: number): any {
        return this.lazyAsset((context) => context.assets.bundledSparrow(imagePath, xmlPath, fps));
    }

    bundledGridAtlas(path: string, layout: Readonly<{ columns: number; rows: number; frameDurationMs?: number }>): any {
        return this.lazyAsset((context) => context.assets.bundledGridAtlas(path, layout));
    }

    visualHandle(): any {
        return this.lazyAsset((context) => context.assets.project());
    }

    private lazyAsset(factory: (context: CapabilityContext) => any): any {
        let handle: any;
        this.pendingAssets.push((context) => {
            handle = factory(context);
            this.assetHandles.push(handle);
        });
        return {
            get: () => handle?.get?.() ?? { resource: null, status: 'idle' },
            update: (id: string | null) => handle?.update?.(id) ?? { resource: null, status: 'idle' },
            destroy: () => handle?.dispose?.(),
            dispose: () => handle?.dispose?.(),
        };
    }
}
