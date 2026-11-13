// Small synthesized cues keep the game self-contained, with no audio downloads.
const cues = {
	select: [[660, 0, .065]],
	rotate: [[440, 0, .045], [550, .035, .055]],
	place: [[220, 0, .09], [440, .045, .12]],
	score: [[880, 0, .07], [1100, .055, .09]],
	bonus: [[523, 0, .12], [659, .09, .12], [784, .18, .12], [1047, .27, .22]],
	start: [[392, 0, .1], [523, .08, .15]],
	hint: [[587, 0, .08], [784, .07, .12]],
	pass: [[392, 0, .09], [294, .08, .12]],
	win: [[523, 0, .14], [659, .12, .14], [784, .24, .14], [1047, .38, .3]],
	lose: [[392, 0, .16], [330, .15, .16], [262, .3, .25]],
	draw: [[440, 0, .13], [523, .13, .13], [440, .26, .2]],
};

export function createSounds() {
	let context;
	let output;
	let track = 0;
	let musicBuffer;
	let musicSource;
	let musicWorker;
	let musicOffset = 0;
	let musicStartedAt = 0;
	const voices = new Set();

	function stopMusic() {
		if (!musicSource) return;
		musicOffset = (musicOffset + context.currentTime - musicStartedAt) % musicBuffer.duration;
		musicSource.stop();
		musicSource.disconnect();
		musicSource = null;
	}

	function playMusic() {
		if (!track || document.hidden || context?.state !== 'running' || musicSource) return;
		try {
			if (!musicBuffer) {
				if (musicWorker) return;
				const worker = new Worker(new URL('./music-worker.js', import.meta.url), {type: 'module'});
				musicWorker = worker;
				worker.onmessage = ({data: {samples, sampleRate}}) => {
					if (worker !== musicWorker) return;
					worker.terminate();
					musicWorker = null;
					musicBuffer = context.createBuffer(1, samples.length, sampleRate);
					musicBuffer.copyToChannel(samples, 0);
					playMusic();
				};
				worker.onerror = () => {
					worker.terminate();
					if (worker === musicWorker) musicWorker = null;
				};
				worker.postMessage(track);
				return;
			}
			const source = context.createBufferSource();
			const volume = context.createGain();
			volume.gain.value = .14;
			volume.connect(context.destination);
			source.buffer = musicBuffer;
			source.loop = true;
			source.connect(volume);
			source.onended = () => volume.disconnect();
			musicStartedAt = context.currentTime;
			source.start(musicStartedAt, musicOffset);
			musicSource = source;
		} catch { /* Audio support must never interrupt play. */ }
	}

	function unlock() {
		try {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!AudioContext) return;
			if (!context) {
				context = new AudioContext();
				output = context.createGain();
				output.gain.value = .12;
				output.connect(context.destination);
			}
			if (context.state !== 'running') context.resume().then(playMusic).catch(() => {});
			else playMusic();
		} catch { /* Audio support must never interrupt play. */ }
	}

	// Unlock synchronously from a gesture, before delayed computer/scoring cues.
	document.addEventListener('pointerdown', unlock, {capture: true, passive: true});
	document.addEventListener('pointerup', unlock, {capture: true, passive: true});
	document.addEventListener('keydown', unlock, {capture: true});
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			playMusic();
			return;
		}
		stopMusic();
		for (const voice of voices) voice.stop();
	});

	return {
		setMusicTrack(number, {playNow = false} = {}) {
			if (track !== number) {
				stopMusic();
				musicWorker?.terminate();
				musicWorker = null;
				musicBuffer = null;
				musicOffset = 0;
				track = number;
			}
			if (playNow && track) unlock();
		},
		play(name) {
			if (document.hidden || !context || context.state !== 'running') return;
			try {
				for (const [frequency, delay, duration] of cues[name] || []) {
					const oscillator = context.createOscillator();
					const envelope = context.createGain();
					const start = context.currentTime + delay;
					oscillator.type = name === 'place' ? 'triangle' : 'sine';
					oscillator.frequency.setValueAtTime(frequency, start);
					envelope.gain.setValueAtTime(0, start);
					envelope.gain.linearRampToValueAtTime(.65, start + .006);
					envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
					oscillator.connect(envelope);
					envelope.connect(output);
					voices.add(oscillator);
					oscillator.onended = () => {
						voices.delete(oscillator);
						oscillator.disconnect();
						envelope.disconnect();
					};
					oscillator.start(start);
					oscillator.stop(start + duration + .01);
				}
			} catch { /* Keep playing when browser audio is unavailable. */ }
		},
	};
}
