// @ts-nocheck
import type { RenderObject } from '@mvmnt-app/plugin-sdk';
import * as af from '@mvmnt-app/plugin-sdk/animation';

export const JUMP_DURATION = 0.3;
export const JUMP_HEIGHT = 10;
export const BOUNCE_DURATION = 0.5;
export const BOUNCE_AMOUNT = 0.2;
export const FLIP_PRE = 0.2;
export const FLIP_POST = 0.2;

/**
 * Mutates a render object's transform (x, y, scaleX, scaleY) for the selected animation.
 * The object must be centered at its local origin for scale animations to look correct.
 * @param duration - overrides the animation speed (seconds); uses built-in default when omitted
 * @param amount - overrides the animation intensity (jump height in px; bounce scale factor); uses built-in default when omitted
 */
export function applyAnimation(
    obj: RenderObject,
    animation: string,
    elapsed: number,
    timeToNext: number | null,
    duration?: number,
    amount?: number
): void {
    if (animation === 'jump') {
        const d = duration ?? JUMP_DURATION;
        const h = amount ?? JUMP_HEIGHT;
        const progress = Math.min(elapsed / d, 1);
        obj.y -= h * (1 - af.easings.easeOutExpo(progress));
        return;
    }

    if (animation === 'bounce') {
        const d = duration ?? BOUNCE_DURATION;
        const a = amount ?? BOUNCE_AMOUNT;
        const progress = Math.min(elapsed / d, 1);
        const s = 1 + a * Math.exp(-progress * 6) * Math.cos(progress * Math.PI * 2.5);
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
