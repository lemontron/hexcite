// The Game Boy Color deal uses a shuffled deck of 40 packets. Each packet
// represents nine pieces, including any free picks in its last column.
// Counts are in engine shape order; the original table starts at ROM offset 0xA1CB.
const packets = [
	[1, 2, 2, 1, 1, 1, 1, 0],
	[1, 1, 1, 4, 1, 1, 0, 0],
	[3, 1, 1, 1, 1, 1, 1, 0],
	[1, 1, 2, 1, 3, 1, 0, 0],
	[2, 1, 1, 1, 1, 2, 1, 0],
	[1, 1, 1, 1, 3, 1, 1, 0],
	[2, 1, 2, 1, 1, 1, 1, 0],
	[1, 1, 2, 3, 1, 1, 0, 0],
	[1, 2, 1, 3, 1, 1, 0, 0],
	[2, 1, 1, 3, 1, 1, 0, 0],
	[1, 1, 1, 2, 1, 3, 0, 0],
	[1, 2, 1, 1, 1, 2, 1, 0],
	[2, 1, 1, 2, 1, 1, 1, 0],
	[2, 2, 1, 1, 1, 1, 1, 0],
	[1, 1, 1, 3, 1, 1, 1, 0],
	[1, 1, 1, 3, 2, 1, 0, 0],
	[1, 1, 1, 1, 1, 2, 2, 0],
	[2, 1, 1, 1, 1, 1, 2, 0],
	[2, 1, 1, 1, 1, 3, 0, 0],
	[1, 1, 1, 1, 2, 3, 0, 0],
	[1, 3, 1, 1, 1, 1, 1, 0],
	[1, 1, 1, 2, 3, 1, 0, 0],
	[1, 2, 1, 1, 1, 1, 2, 0],
	[1, 2, 1, 1, 1, 3, 0, 0],
	[1, 1, 1, 1, 3, 2, 0, 0],
	[2, 1, 1, 1, 3, 1, 0, 0],
	[1, 1, 2, 1, 1, 1, 2, 0],
	[1, 1, 1, 2, 1, 1, 2, 0],
	[1, 2, 1, 2, 1, 1, 1, 0],
	[1, 1, 3, 1, 1, 1, 1, 0],
	[1, 1, 2, 1, 2, 1, 1, 0],
	[1, 1, 2, 2, 1, 1, 1, 0],
	[1, 2, 1, 1, 2, 1, 1, 0],
	[2, 1, 1, 1, 2, 1, 1, 0],
	[1, 1, 1, 2, 1, 2, 1, 0],
	[1, 1, 1, 1, 1, 3, 1, 0],
	[1, 1, 1, 2, 1, 0, 1, 2],
	[1, 1, 1, 1, 1, 1, 1, 2],
	[1, 1, 1, 1, 1, 0, 2, 2],
	[1, 1, 1, 0, 1, 1, 2, 2],
];

export function dealStartingHands(random = Math.random) {
	const deck = [...packets];
	const draw = () => deck.splice(Math.floor(random() * deck.length), 1)[0];
	const hands = [Array(7).fill(0), Array(7).fill(0)];
	const freePicks = [0, 0];

	// Deal two packets to each player, alternating from one shared deck.
	for (let i = 0; i < 4; i++) {
		const player = i % hands.length;
		const hand = hands[player];
		const packet = draw();
		for (let type = 0; type < hand.length; type++) hand[type] += packet[type];
		freePicks[player] += packet[hand.length];
	}

	for (const [player, hand] of hands.entries()) {
		for (let i = 0; i < freePicks[player]; i++) hand[Math.floor(random() * hand.length)]++;
	}
	return hands;
}
