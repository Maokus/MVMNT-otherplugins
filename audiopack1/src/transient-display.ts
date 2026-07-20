import {
    defineRendererElement,
    CallbackElementRenderer,
    prop,
    insertElementConfig,
    tab,
    Rectangle,
    Poly,
    Line,
    type PluginAudioCalculator,
    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';

const TRANSIENT_FEATURE = 'audiopack1.transients';
const TRANSIENT_CALCULATOR_ID = 'us.maok.audiopack1.transients';
const MIN_TRANSIENT_GAP_SECONDS = 0.08;

function clamp(value: number, min: number, max: number): number {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/**
 * Emits transient markers only. Waveform samples stay on the raw PCM path so the display is
 * never limited to the calculator's analysis hop size.
 */
const transientCalculator: PluginAudioCalculator = {
    id: TRANSIENT_CALCULATOR_ID,
    version: 2,
    featureKey: TRANSIENT_FEATURE,
    async calculate(context) {
        const { audioBuffer, hopSeconds, frameCount, signal, reportProgress } = context;
        const sampleRate = audioBuffer.sampleRate || 44100;
        const hopSize = Math.max(1, Math.round(hopSeconds * sampleRate));
        const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
        const channelData = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index));
        const rms = new Float32Array(frameCount);

        for (let frame = 0; frame < frameCount; frame += 1) {
            if (signal?.aborted) throw new Error('Analysis cancelled');
            const start = frame * hopSize;
            const end = Math.min(start + hopSize, audioBuffer.length);
            let sumSquares = 0;
            let count = 0;
            for (let sample = start; sample < end; sample += 1) {
                let value = 0;
                for (const data of channelData) value += data[sample] ?? 0;
                value /= channels;
                sumSquares += value * value;
                count += 1;
            }
            rms[frame] = count ? Math.sqrt(sumSquares / count) : 0;
            if (frame % 128 === 0) {
                reportProgress?.(frame + 1, frameCount);
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
        }

        const values = new Float32Array(frameCount);
        const rollingWindow = Math.max(4, Math.round(0.35 * sampleRate / hopSize));
        const refractoryFrames = Math.max(1, Math.round(MIN_TRANSIENT_GAP_SECONDS * sampleRate / hopSize));
        let lastTransientFrame = -refractoryFrames;
        for (let frame = 0; frame < frameCount; frame += 1) {
            const flux = Math.max(0, (rms[frame] ?? 0) - (rms[frame - 1] ?? 0));
            let averageFlux = 0;
            let averageCount = 0;
            for (let previous = Math.max(0, frame - rollingWindow); previous < frame; previous += 1) {
                averageFlux += Math.max(0, (rms[previous] ?? 0) - (rms[previous - 1] ?? 0));
                averageCount += 1;
            }
            averageFlux /= Math.max(1, averageCount);
            const isLocalPeak = flux >= Math.max(0, (rms[frame + 1] ?? 0) - (rms[frame] ?? 0));
            const isTransient =
                frame - lastTransientFrame >= refractoryFrames &&
                isLocalPeak &&
                rms[frame] > 0.015 &&
                flux > Math.max(0.006, averageFlux * 2.5);
            if (isTransient) lastTransientFrame = frame;
            values[frame] = isTransient ? 1 : 0;
        }

        return {
            frameCount,
            channels: 1,
            format: 'float32',
            data: values,
            channelLayout: { aliases: ['Transient'] },
        };
    },
};

type TimingApi = {
    secondsToTicks(seconds: number): number | null;
    ticksToSeconds(ticks: number): number | null;
    beatsToTicks(beats: number): number;
    ticksToBeats(ticks: number): number;
};

type TransientSample = { time: number; transient: boolean };

type TransientScanCache = {
    trackId: string;
    maxInterval: number;
    start: number;
    end: number;
    transientTimes: number[];
};

function alignDown(value: number, step: number): number {
    return Math.floor((value + step * 1e-6) / step) * step;
}

function alignUp(value: number, step: number): number {
    return Math.ceil((value - step * 1e-6) / step) * step;
}

function containsSignal(samples: ArrayLike<number>, epsilon = 1e-6): boolean {
    for (let index = 0; index < samples.length; index += 1) {
        if (Math.abs(samples[index] ?? 0) > epsilon) return true;
    }
    return false;
}

/** Collapse the interpolated run around each binary calculator frame into one stable marker. */
function extractTransientTimes(samples: TransientSample[]): number[] {
    const times: number[] = [];
    let insideTransient = false;
    for (const sample of samples) {
        if (sample.transient) {
            if (!insideTransient) times.push(sample.time);
            insideTransient = true;
        } else {
            insideTransient = false;
        }
    }
    return times;
}

function buildWaveformPoints(samples: number[], visibleDuration: number, intervalDuration: number, width: number, height: number) {
    if (!samples.length) return [];
    const midpoint = height / 2;
    const scale = height / 2;
    const points: Array<{ x: number; y: number }> = [];
    const bucketCount = Math.min(Math.max(2, Math.round(width)), 1024, samples.length);
    const visibleWidth = clamp(visibleDuration / Math.max(0.001, intervalDuration), 0, 1) * width;
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
        const start = Math.floor((bucket / bucketCount) * samples.length);
        const end = Math.max(start + 1, Math.floor(((bucket + 1) / bucketCount) * samples.length));
        let min = 0;
        let max = 0;
        for (let index = start; index < end; index += 1) {
            const value = samples[index] ?? 0;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        const x = (bucket / Math.max(1, bucketCount - 1)) * visibleWidth;
        points.push({ x, y: midpoint - max * scale });
        points.push({ x, y: midpoint - min * scale });
    }
    return points;
}

function getFallbackWindow(
    targetTime: number,
    fallback: unknown,
    beatsPerBar: number,
    timing: TimingApi
) {
    const targetTick = timing.secondsToTicks(targetTime);
    const targetBeat = targetTick === null ? targetTime * 2 : timing.ticksToBeats(targetTick);
    const spanBeats = fallback === 'bar' ? beatsPerBar : 1;
    const startBeat = Math.floor(targetBeat / spanBeats) * spanBeats;
    const endBeat = startBeat + spanBeats;
    const start = timing.ticksToSeconds(timing.beatsToTicks(startBeat)) ?? targetTime;
    const end = timing.ticksToSeconds(timing.beatsToTicks(endBeat)) ?? targetTime + spanBeats * 0.5;
    return { start, end: Math.max(start + 0.001, end) };
}

function getMinimumIntervalSeconds(
    startTime: number,
    beatsPerBar: number,
    timing: TimingApi
) {
    const startTick = timing.secondsToTicks(startTime);
    if (startTick === null) return 0.03125;
    const startBeat = timing.ticksToBeats(startTick);
    const endTick = timing.beatsToTicks(startBeat + beatsPerBar / 64);
    return Math.max(0.001, (timing.ticksToSeconds(endTick) ?? startTime + 0.03125) - startTime);
}

class TransientDisplayElement extends CallbackElementRenderer {
    static readonly elementType = 'transient-display' as const;
    private transientScanCache: TransientScanCache | null = null;

    constructor(id: string = 'transient-display', config: Record<string, unknown> = {}) {
        super('transient-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Transient Display',
                description: 'A waveform that fills one transient interval at a time.',
                category: 'us.maok.audiopack1',
            },
            [
                tab.content([
                    {
                        id: 'audioSource',
                        label: 'Audio Source',
                        collapsed: false,
                        properties: [prop.audioTrack('audioTrackId', 'Audio Track', { description: 'Audio track to analyze' })],
                    },
                    {
                        id: 'waveform',
                        label: 'Waveform',
                        collapsed: false,
                        properties: [
                            prop.number('width', 'Width (px)', 800, { min: 1, step: 1 }),
                            prop.number('height', 'Height (px)', 240, { min: 1, step: 1 }),
                            prop.number('lineWidth', 'Line Width (px)', 2, { min: 0, step: 0.5 }),
                            prop.number('maxInterval', 'Maximum Interval (sec)', 4, {
                                min: 0.25,
                                max: 16,
                                step: 0.25,
                                description: 'How far to look for the next transient before holding the waveform full.',
                            }),
                            prop.select('fallbackLength', 'No-Transient Fallback', 'beat', [
                                { label: 'One Beat', value: 'beat' },
                                { label: 'One Bar', value: 'bar' },
                            ]),
                            prop.boolean('overwrite', 'Overwrite', false, {
                                description: 'Draw a new transient over the existing trace instead of clearing it immediately.',
                            }),
                            prop.boolean('showPlayhead', 'Show Playhead', true),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'appearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            prop.colorAlpha('shapeColor', 'Color', '#F472B6FF'),
                            prop.colorAlpha('backgroundColor', 'Background Color', '#00000000'),
                            prop.colorAlpha('playheadColor', 'Playhead Color', '#FFFFFFFF'),
                        ],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const width = Math.max(1, Number(props.width) || 800);
        const height = Math.max(1, Number(props.height) || 240);
        const anchor = new Rectangle(0, 0, width, height, { fillColor: '#00000000' });
        const timingFacet = this.context.timing;
        const timing: TimingApi | null = timingFacet
            ? {
                secondsToTicks: (value) => {
                    const result = timingFacet.secondsToTicks(value);
                    return result.ok ? result.value : null;
                },
                ticksToSeconds: (value) => {
                    const result = timingFacet.ticksToSeconds(value);
                    return result.ok ? result.value : null;
                },
                beatsToTicks: (value) => {
                    const result = timingFacet.beatsToTicks(value);
                    return result.ok ? result.value : 0;
                },
                ticksToBeats: (value) => {
                    const result = timingFacet.ticksToBeats(value);
                    return result.ok ? result.value : 0;
                },
            }
            : null;
        const getNoAudioWindow = () => {
            if (timing) return getFallbackWindow(targetTime, 'beat', 4, timing);
            const start = Math.floor(targetTime / 0.5) * 0.5;
            return { start, end: start + 0.5 };
        };
        const renderNoAudioLine = () => {
            const window = getNoAudioWindow();
            const progress = clamp((targetTime - window.start) / (window.end - window.start), 0, 1);
            const background = new Rectangle(0, 0, width, height, {
                fillColor: props.backgroundColor ?? '#00000000',
            }).setLayoutParticipation('exclude');
            const line = new Line(0, height / 2, progress * width, height / 2, {
                color: props.shapeColor ?? '#F472B6FF',
                lineWidth: Math.max(0, Number(props.lineWidth) || 2),
                layoutParticipation: 'exclude',
            });
            return [anchor, background, line];
        };
        if (!props.audioTrackId) return renderNoAudioLine();

        const audio = this.context.audio;
        if (!audio || !timing) return renderNoAudioLine();

        const maxInterval = clamp(Number(props.maxInterval) || 4, 0.25, 16);
        const signature = timingFacet!.getTimeSignature();
        const beatsPerBar = signature.ok ? signature.value.numerator : 4;
        const stepSeconds = 1 / 120;
        const trackId = props.audioTrackId as string;

        // Both feature and PCM APIs deliberately zero-pad timeline gaps and reads beyond a clip.
        // Check the signal at the playhead instead of interpreting a non-empty padded buffer as audio.
        const signalResult = audio.getRawSamples({
            trackId,
            startSeconds: Math.max(0, targetTime),
            endSeconds: Math.max(0, targetTime) + stepSeconds,
            channel: 'mono',
        });
        if (!signalResult.ok || !containsSignal(signalResult.value)) return renderNoAudioLine();

        const scanStart = alignUp(Math.max(0, targetTime - maxInterval), stepSeconds);
        const scanEnd = alignDown(targetTime + maxInterval, stepSeconds);
        const cache = this.transientScanCache;
        const canReuseCache =
            cache !== null &&
            cache.trackId === trackId &&
            cache.maxInterval === maxInterval &&
            cache.start <= scanStart &&
            cache.end >= scanEnd;
        if (!canReuseCache) {
            // Cache a wider, globally aligned window. This avoids thousands of feature lookups on
            // every rendered frame and keeps marker times independent of the moving playhead.
            const cacheStart = alignDown(Math.max(0, targetTime - maxInterval * 2), stepSeconds);
            const cacheEnd = alignUp(targetTime + maxInterval * 2, stepSeconds);
            const rawSamplesResult = audio.sampleFeatureRange({
                trackId,
                feature: TRANSIENT_FEATURE,
                startSeconds: cacheStart,
                endSeconds: cacheEnd,
                stepSeconds,
            });
            const rawSamples = rawSamplesResult.ok ? rawSamplesResult.value : [];
            if (rawSamples.length) {
                const samples: TransientSample[] = rawSamples.map((sample) => {
                    const values = Array.isArray(sample.value) ? sample.value : [Number(sample.value) || 0];
                    return {
                        time: sample.timeSeconds,
                        transient: (values[0] ?? 0) >= 0.5,
                    };
                });
                this.transientScanCache = {
                    trackId,
                    maxInterval,
                    start: cacheStart,
                    end: cacheEnd,
                    transientTimes: extractTransientTimes(samples),
                };
            } else {
                // Do not cache a miss: the requested feature calculation may still be in progress.
                this.transientScanCache = null;
            }
        }
        const transientTimes = (this.transientScanCache?.transientTimes ?? []).filter(
            (time) => time >= scanStart && time <= scanEnd
        );
        const acceptedTransientTimes: number[] = [];
        for (const transientTime of transientTimes) {
            const previous = acceptedTransientTimes[acceptedTransientTimes.length - 1];
            if (previous === undefined || transientTime - previous >= getMinimumIntervalSeconds(previous, beatsPerBar, timing)) {
                acceptedTransientTimes.push(transientTime);
            }
        }
        const elapsedTransients = acceptedTransientTimes.filter((time) => time <= targetTime);
        const previousTransient = elapsedTransients[elapsedTransients.length - 1];
        const priorTransient = previousTransient === undefined
            ? undefined
            : acceptedTransientTimes.filter((time) => time < previousTransient).slice(-1)[0];
        const nextTransient = previousTransient === undefined
            ? undefined
            : acceptedTransientTimes.find((time) => time > previousTransient);
        const fallback = getFallbackWindow(targetTime, props.fallbackLength, beatsPerBar, timing);
        const minimumInterval = previousTransient === undefined
            ? 0
            : getMinimumIntervalSeconds(previousTransient, beatsPerBar, timing);
        const segment = previousTransient !== undefined
            ? {
                start: previousTransient,
                end:
                    previousTransient +
                    Math.max(
                        minimumInterval,
                        Math.min(maxInterval, (nextTransient ?? previousTransient + maxInterval) - previousTransient)
                    ),
            }
            : fallback;
        const readPcm = (start: number, end: number) => {
            const result = audio.getRawSamples({
                trackId,
                startSeconds: start,
                endSeconds: end,
                channel: 'mono',
            });
            return result.ok ? Array.from(result.value) : [];
        };

        const overwrite = props.overwrite === true && previousTransient !== undefined && priorTransient !== undefined;
        const overwriteDuration = overwrite
            ? Math.max(getMinimumIntervalSeconds(previousTransient!, beatsPerBar, timing), segment.end - segment.start)
            : segment.end - segment.start;
        const activeStart = overwrite ? previousTransient! : segment.start;
        // Fill for at most maxInterval, then hold at the right edge until the next accepted marker.
        const activeElapsed = clamp(targetTime - activeStart, 0, overwriteDuration);
        const activeEnd = activeStart + activeElapsed;
        const activePcm = readPcm(activeStart, activeEnd);
        if (activeEnd > activeStart && activePcm.length === 0) return renderNoAudioLine();
        const waveformPoints = buildWaveformPoints(activePcm, activeEnd - activeStart, overwriteDuration, width, height);

        // Overwrite mode reconstructs the retained tail from the preceding trigger each frame.
        // It deliberately does not mutate a waveform buffer, keeping seeks and exports deterministic.
        if (overwrite && activeEnd < activeStart + overwriteDuration) {
            const progress = clamp((activeEnd - activeStart) / overwriteDuration, 0, 1);
            const previousGapDuration = previousTransient! - priorTransient!;
            // Map equal normalized positions together: halfway through a 2 s current gap,
            // retain the second half (0.5 s) of a preceding 1 s gap on the right.
            const retainedStart = priorTransient! + progress * previousGapDuration;
            const retainedEnd = previousTransient!;
            const retainedPcm = readPcm(retainedStart, retainedEnd);
            const retainedPoints = buildWaveformPoints(
                retainedPcm,
                retainedEnd - retainedStart,
                previousGapDuration,
                width,
                height
            );
            for (const point of retainedPoints) {
                waveformPoints.push({ ...point, x: point.x + progress * width });
            }
        }

        const waveform = new Poly(waveformPoints, {
            strokeColor: props.shapeColor ?? '#F472B6FF',
            strokeWidth: Math.max(0, Number(props.lineWidth) || 2),
            layoutParticipation: 'exclude',
        })
            .setClosed(false)
            .setLineJoin('round')
            .setLineCap('round');
        const background = new Rectangle(0, 0, width, height, { fillColor: props.backgroundColor ?? '#00000000' });
        background.setLayoutParticipation('exclude');

        const objects: RenderObject[] = [anchor, background, waveform];
        if (props.showPlayhead !== false) {
            const playheadX = clamp((activeEnd - activeStart) / Math.max(0.001, overwriteDuration), 0, 1) * width;
            objects.push(
                new Line(playheadX, 0, playheadX, height, {
                    color: props.playheadColor ?? '#FFFFFFFF',
                    lineWidth: 1,
                    layoutParticipation: 'exclude',
                })
            );
        }

        return objects;
    }
}

export const transientDisplay = defineRendererElement({
    type: 'transient-display',
    capabilities: { required: ['audio.features.read', 'audio.raw.read', 'timing.conversion', 'timeline.read', 'audio.calculators.register'], optional: [] },
    calculators: [transientCalculator],
    featureRequirements: [{ feature: TRANSIENT_FEATURE, calculatorId: TRANSIENT_CALCULATOR_ID }],
}, TransientDisplayElement);
export default transientDisplay;
