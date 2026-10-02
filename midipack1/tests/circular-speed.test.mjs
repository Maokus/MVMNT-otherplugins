import test from 'node:test';
import assert from 'node:assert/strict';
import { angularTravel, visibleDuration, angleAtTime } from '../circular-speed.mjs';

const linearSpeed = (from, to) => ({ ok: true, value: 60 * (to - from) + 15 * (to * to - from * from) });

test('integrated speed produces continuous angles through a ramp and after a seek', () => {
    const travel = (from, to) => angularTravel((_key, range) => linearSpeed(range.startSeconds, range.endSeconds), from, to);
    assert.ok(Math.abs(angleAtTime(1, 2, 0, travel) - (-105 * Math.PI / 180)) < 1e-10);
    assert.ok(Math.abs(angleAtTime(1, 2.1, 0, travel) - (-117.15 * Math.PI / 180)) < 1e-10);
    assert.ok(Math.abs(angleAtTime(1, 1.5, 0, travel) - (-48.75 * Math.PI / 180)) < 1e-10);
    assert.equal(angleAtTime(1, 2, 0, travel), angleAtTime(1, 2, 0, travel));
});

test('visible bounds contain a full arc on both sides and reject invalid speed', () => {
    const travel = (from, to) => angularTravel((_key, range) => linearSpeed(range.startSeconds, range.endSeconds), from, to);
    const past = visibleDuration(2, -1, 180, 1, travel);
    const future = visibleDuration(2, 1, 180, 1, travel);
    assert.ok(past !== null && travel(2 - past, 2) >= 180);
    assert.ok(future !== null && travel(2, 2 + future) >= 180);
    assert.equal(visibleDuration(2, -1, 180, 1, () => null), null);
    assert.equal(angularTravel(() => ({ ok: true, value: -1 }), 0, 1), null);
});
