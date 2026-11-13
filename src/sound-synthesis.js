const clock = 4194304;
const frameTime = 70224 / clock;
const filterTime = .0057;
const tailTime = .035;

function renderChannel(samples, sampleRate, [shape, endFrame, writes], tailTime) {
	const oversampling = 4;
	const step = 1 / (sampleRate * oversampling);
	const dcDecay = Math.exp(-step / filterTime);
	const noise = shape === 'noise';
	const wave = shape === 'wave';
	const duty = shape === 'pulse12' ? .125 : .5;
	const end = Math.min(samples.length, Math.ceil((endFrame * frameTime + tailTime) * sampleRate));
	let nextWrite = 0;
	let envelope = 0;
	let envelopeStart = 0;
	let period = 0;
	let phase = 0;
	let clocksLeft = 0;
	let lfsr = 0x7fff;
	let dc = 0;

	for (let i = 0; i < end; i++) {
		let sample = 0;
		for (let sub = 0; sub < oversampling; sub++) {
			const time = (i * oversampling + sub) * step;
			const frame = Math.floor(time / frameTime);
			const write = writes[nextWrite];
			if (write && frame >= write[0]) {
				const [, register, newEnvelope, preservePhase] = write;
				if (noise) {
					const divisor = register & 7;
					period = (divisor ? divisor * 16 : 8) << (register >> 4);
				} else {
					period = (2048 - register) * (wave ? 64 : 32);
				}
				if (newEnvelope !== undefined) {
					envelope = newEnvelope;
					envelopeStart = time;
					if (!preservePhase) {
						clocksLeft = period;
						lfsr = 0x7fff;
						if (wave) phase = 0;
					}
				}
				nextWrite++;
			}

			let signal = 0;
			if (frame < endFrame && envelope) {
				const envelopePeriod = envelope & 7;
				const decay = envelopePeriod ? Math.floor((time - envelopeStart) * 64 / envelopePeriod) : 0;
				const volume = Math.min(15, Math.max(0, (envelope >> 4) + ((envelope & 8) ? decay : -decay)));
				if (noise) {
					clocksLeft -= clock * step;
					while (clocksLeft <= 0) {
						const feedback = (lfsr ^ (lfsr >> 1)) & 1;
						lfsr = (lfsr >> 1) | (feedback << 14);
						clocksLeft += period;
					}
					signal = (~lfsr & 1) * volume;
				} else {
					// The ROM uses a descending, 16-level wave table.
					const amplitude = wave ? (15 - Math.floor(phase * 16)) / 15 : Number(phase < duty);
					signal = amplitude * volume;
					phase = (phase + clock * step / period) % 1;
				}
			}
			sample += signal - dc;
			dc = signal + (dc - signal) * dcDecay;
		}
		samples[i] += sample / oversampling;
	}
}

export function renderSound(channels, sampleRate, loop = false) {
	const tail = loop ? 0 : tailTime;
	const endFrame = Math.max(...channels.map(([, frames]) => frames));
	const samples = new Float32Array(Math.round((endFrame * frameTime + tail) * sampleRate));
	for (const channel of channels) renderChannel(samples, sampleRate, channel, tail);

	let peak = 0;
	for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
	if (peak) {
		for (let i = 0; i < samples.length; i++) samples[i] *= .65 / peak;
	}
	// De-click the loop boundary without adding time between repeats.
	if (loop) {
		const fadeSamples = Math.round(.002 * sampleRate);
		for (let i = 0; i < fadeSamples; i++) {
			samples[i] *= i / fadeSamples;
			samples[samples.length - 1 - i] *= i / fadeSamples;
		}
	}
	return samples;
}
