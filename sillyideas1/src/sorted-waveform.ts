import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Arc, Poly, Rectangle, type RenderObject } from '@mvmnt-app/plugin-sdk/render';

const MAX_SAMPLE_COUNT = 8192;

type Channel = 'left' | 'right' | 'mid' | 'side';
type Side = 'both' | 'positive' | 'negative';
type Display = 'line' | 'bar' | 'dot';

function clamp(value: unknown, min: number, max: number, fallback = min): number {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, numeric));
}

function samplesForChannel(left: Float32Array, right: Float32Array, channel: Channel): number[] {
    const length = Math.min(left.length, right.length);
    const values = new Array<number>(length);
    for (let index = 0; index < length; index += 1) {
        const a = left[index] ?? 0;
        const b = right[index] ?? a;
        values[index] = channel === 'right' ? b : channel === 'mid' ? (a + b) / 2 : channel === 'side' ? (a - b) / 2 : a;
    }
    return values;
}

function resample(values: number[], count: number): number[] {
    if (!values.length || count < 1) return [];
    if (count >= values.length) return [...values];
    const result = new Array<number>(count);
    for (let bucket = 0; bucket < count; bucket += 1) {
        const start = Math.floor((bucket * values.length) / count);
        const end = Math.max(start + 1, Math.floor(((bucket + 1) * values.length) / count));
        let total = 0;
        for (let index = start; index < end; index += 1) total += values[index] ?? 0;
        result[bucket] = total / (end - start);
    }
    return result;
}

function damp(values: number[], radius: number): number[] {
    if (!radius) return values;
    return values.map((_, index) => {
        const end = Math.min(values.length, index + radius + 1);
        let total = 0;
        for (let next = index; next < end; next += 1) total += values[next] ?? 0;
        return total / (end - index);
    });
}

function applySide(values: number[], side: Side): number[] {
    if (side === 'both') return values;
    return values.map((value) => (side === 'positive' ? Math.abs(value) : -Math.abs(value)));
}

function pointsFor(values: number[], width: number, height: number): Array<{ x: number; y: number }> {
    const denominator = Math.max(1, values.length - 1);
    return values.map((value, index) => ({ x: (index / denominator) * width, y: height / 2 - value * (height / 2) }));
}

function renderSeries(
    objects: RenderObject[],
    values: number[],
    width: number,
    height: number,
    color: string,
    lineWidth: number,
    display: Display
): void {
    const points = pointsFor(values, width, height);
    if (display === 'line') {
        const line = new Poly(points, { fillColor: null, strokeColor: color, strokeWidth: lineWidth, layoutParticipation: 'exclude' });
        line.setClosed(false).setLineJoin('round').setLineCap('round');
        objects.push(line);
        return;
    }
    if (display === 'bar') {
        const spacing = points.length > 1 ? width / (points.length - 1) : width;
        const barWidth = Math.max(1, Math.min(spacing * 0.8, lineWidth * 4));
        for (const point of points) {
            const y = Math.min(point.y, height / 2);
            objects.push(new Rectangle(point.x - barWidth / 2, y, barWidth, Math.max(1, Math.abs(point.y - height / 2)), { fillColor: color, layoutParticipation: 'exclude' }));
        }
        return;
    }
    for (const point of points) {
        objects.push(new Arc(point.x, point.y, Math.max(0.5, lineWidth / 2), { startAngle: 0, endAngle: Math.PI * 2, anticlockwise: false, fillColor: color, strokeColor: '#FFFFFF00', layoutParticipation: 'exclude' }));
    }
}

export const sortedWaveform = definePluginElement({
    type: 'sorted-waveform',
    metadata: {
        name: 'Sorted Waveform',
        description: 'A raw PCM waveform frame sorted from low to high amplitude.',
        category: 'us.maok.sillyideas1',
    },
    schema: {
        tabs: [
            tab.content([
                group('source', 'Audio Source', [prop.audioTrack('audioTrackId', 'Audio Track')]),
                group('waveform', 'Sorted Waveform', [
                    prop.number('width', 'Width (px)', 800, { min: 1, step: 1 }),
                    prop.number('height', 'Height (px)', 300, { min: 1, step: 1 }),
                    prop.number('sampleCount', 'Sample Count', 4096, { min: 256, max: MAX_SAMPLE_COUNT, step: 256 }),
                    prop.number('startOffset', 'Start Offset', 0.5, { min: 0, max: 1, step: 0.01 }),
                    prop.number('gain', 'Gain', 1, { min: 0, max: 10, step: 0.1 }),
                    prop.number('density', 'Density', 1, { min: 0.1, max: 1, step: 0.05 }),
                    prop.number('damp', 'Damp', 0, { min: 0, max: 64, step: 1 }),
                    prop.select('channel', 'Channel', 'left', [
                        { label: 'Left', value: 'left' }, { label: 'Right', value: 'right' },
                        { label: 'Mid (L+R)', value: 'mid' }, { label: 'Side (L-R)', value: 'side' },
                    ]),
                    prop.select('side', 'Side', 'both', [
                        { label: 'Both', value: 'both' }, { label: 'Positive', value: 'positive' }, { label: 'Negative', value: 'negative' },
                    ]),
                    prop.select('display', 'Display', 'line', [
                        { label: 'Line', value: 'line' }, { label: 'Bars', value: 'bar' }, { label: 'Dots', value: 'dot' },
                    ]),
                    prop.boolean('showPlayhead', 'Show Playhead', false),
                ]),
            ]),
            tab.appearance([
                group('appearance', 'Appearance', [
                    prop.colorAlpha('color', 'Color', '#22D3EEFF'),
                    prop.colorAlpha('backgroundColor', 'Background', '#0F172A00'),
                    prop.number('lineWidth', 'Line Width (px)', 2, { min: 0, max: 10, step: 0.5 }),
                ]),
            ]),
        ],
    },
    render(props, _state, time, context): readonly RenderObject[] {
        const width = clamp(props.width, 1, 8192, 800);
        const height = clamp(props.height, 1, 8192, 300);
        const objects: RenderObject[] = [new Rectangle(0, 0, width, height, { fillColor: typeof props.backgroundColor === 'string' ? props.backgroundColor : '#0F172A00' })];
        const color = typeof props.color === 'string' ? props.color : '#22D3EEFF';
        const lineWidth = clamp(props.lineWidth, 0, 10, 2);
        const flat = () => renderSeries(objects, [0, 0], width, height, color, Math.max(1, lineWidth), 'line');
        if (typeof props.audioTrackId !== 'string' || !context.audio) {
            flat();
            return objects;
        }
        const metadata = context.audio.getChannelMetadata(props.audioTrackId);
        if (!metadata.ok || !metadata.value.sampleRate) {
            flat();
            return objects;
        }
        const sampleCount = Math.round(clamp(props.sampleCount, 256, MAX_SAMPLE_COUNT, 4096));
        const startOffset = clamp(props.startOffset, 0, 1, 0.5);
        const windowSeconds = sampleCount / metadata.value.sampleRate;
        const startSeconds = time.seconds - windowSeconds * startOffset;
        const endSeconds = startSeconds + windowSeconds;
        const left = context.audio.getRawSamples({ trackId: props.audioTrackId, startSeconds, endSeconds, channel: 'left' });
        if (!left.ok) {
            flat();
            return objects;
        }
        const right = context.audio.getRawSamples({ trackId: props.audioTrackId, startSeconds, endSeconds, channel: 'right' });
        const raw = samplesForChannel(left.value, right.ok ? right.value : left.value, props.channel as Channel);
        // Sorting is deliberately after the channel transform: this is a frame's amplitude distribution, not a timeline waveform.
        const sorted = raw.sort((a, b) => a - b);
        const density = clamp(props.density, 0.1, 1, 1);
        const displayCount = Math.max(2, Math.round(width * density));
        const gain = clamp(props.gain, 0, 10, 1);
        const shaped = applySide(damp(resample(sorted, displayCount).map((value) => Math.max(-1, Math.min(1, value * gain))), Math.round(clamp(props.damp, 0, 64, 0))), props.side as Side);
        renderSeries(objects, shaped, width, height, color, lineWidth, props.display as Display);
        if (props.showPlayhead === true) {
            const x = startOffset * width;
            const playhead = new Poly([{ x, y: 0 }, { x, y: height }], { fillColor: null, strokeColor: color, strokeWidth: Math.max(1, lineWidth), layoutParticipation: 'exclude' });
            playhead.setClosed(false);
            objects.push(playhead);
        }
        return objects;
    },
});

export default sortedWaveform;
