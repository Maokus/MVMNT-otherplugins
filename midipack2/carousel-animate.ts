import type { RenderObject } from '@mvmnt/plugin-sdk';

export const JUMP_DURATION = 0.3;
export const JUMP_HEIGHT = 20;
export const BOUNCE_DURATION = 0.5;
export const BOUNCE_AMOUNT = 0.2;
export const FLIP_PRE = 0.2;
export const FLIP_POST = 0.2;

/**
 * Mutates a render object's transform (x, y, scaleX, scaleY) for the selected animation.
 * The object must be centered at its local origin for scale animations to look correct.
 */
export function applyAnimation(obj: RenderObject, animation: string, elapsed: number, timeToNext: number | null): void {
    if (animation === 'jump') {
        const progress = Math.min(elapsed / JUMP_DURATION, 1);
        obj.y -= JUMP_HEIGHT * (1 - Math.pow(progress, 3));
        return;
    }

    if (animation === 'bounce') {
        const progress = Math.min(elapsed / BOUNCE_DURATION, 1);
        const s = 1 + BOUNCE_AMOUNT * Math.exp(-progress * 6) * Math.cos(progress * Math.PI * 2.5);
        obj.scaleX *= s;
        obj.scaleY *= s;
        return;
    }

    if (animation === 'flipy' || animation === 'flipx') {
        let scale = 1;
        if (elapsed < FLIP_POST) {
            scale = Math.pow(Math.max(0, elapsed) / FLIP_POST, 0.5);
        } else if (timeToNext !== null && timeToNext < FLIP_PRE) {
            const p = 1 - timeToNext / FLIP_PRE;
            scale = 1 - Math.pow(p, 2);
        }
        scale = Math.max(0, scale);
        if (animation === 'flipy') {
            obj.scaleY *= scale;
        } else {
            obj.scaleX *= scale;
        }
    }
}
