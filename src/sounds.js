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
	const voices = new Set();

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
			if (context.state === 'suspended') context.resume().catch(() => {});
		} catch { /* Audio support must never interrupt play. */ }
	}

	// Unlock synchronously from a gesture, before delayed computer/scoring cues.
	document.addEventListener('pointerdown', unlock, {capture: true, passive: true});
	document.addEventListener('keydown', unlock, {capture: true});
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) return;
		for (const voice of voices) voice.stop();
	});

	return {
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
