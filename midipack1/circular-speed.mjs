/** Angular distance in degrees between two timeline times. */
export function angularTravel(integrate, from, to) {
    if (from === to) return 0;
    const result = integrate('angularSpeed', { startSeconds: from, endSeconds: to });
    return result.ok && Number.isFinite(result.value) && result.value >= 0 ? result.value : null;
}

/** A conservative visible window; doubling avoids repeated inverse searches. */
export function visibleDuration(targetTime, direction, arcSpanDeg, initialDuration, travel) {
    const maximum = arcSpanDeg;
    let duration = Math.min(maximum, initialDuration);
    for (let attempt = 0; attempt < 12; attempt++) {
        const from = direction < 0 ? targetTime - duration : targetTime;
        const to = direction < 0 ? targetTime : targetTime + duration;
        const distance = travel(from, to);
        if (distance === null) return null;
        if (distance >= arcSpanDeg - 1e-7) return duration;
        if (duration >= maximum) return null;
        duration = Math.min(maximum, duration * 2);
    }
    return null;
}

export function angleAtTime(time, targetTime, triggerAngle, travel) {
    const distance = time < targetTime ? travel(time, targetTime) : travel(targetTime, time);
    if (distance === null) return null;
    return triggerAngle + (time < targetTime ? -distance : distance) * Math.PI / 180;
}
