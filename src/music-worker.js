import { tracks } from './music-tracks.js';
import { renderSound } from './sound-synthesis.js';

const channelShapes = ['pulse', 'pulse', 'wave', 'noise'];

function decodeWrites(encoded) {
	const bytes = atob(encoded);
	const writes = [];
	let frame = 0;
	for (let i = 0; i < bytes.length; i += 4) {
		frame += bytes.charCodeAt(i);
		const high = bytes.charCodeAt(i + 2);
		const period = bytes.charCodeAt(i + 1) | ((high & 7) << 8);
		const envelope = bytes.charCodeAt(i + 3);
		writes.push([frame, period, envelope === 255 ? undefined : envelope, Boolean(high & 128)]);
	}
	return writes;
}

self.onmessage = ({data: track}) => {
	const [endFrame, encodedChannels] = tracks[track];
	const channels = encodedChannels.map((data, index) => [channelShapes[index], endFrame, decodeWrites(data)]);
	const sampleRate = 22050;
	const samples = renderSound(channels, sampleRate, true);
	self.postMessage({samples, sampleRate}, [samples.buffer]);
};
