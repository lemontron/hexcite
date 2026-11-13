import { shapes } from './engine.js';
import { xy, bounds } from './geometry.js';
import { svg, svgPolygon } from './svg.js';

export const shapeColors = ['#e53935', '#f3cf32', '#2463dd', '#299447', '#ed76b5', '#935d36', '#70c9f0'];

const icons = shapes.map(({v}) => {
	const vertices = v.map(xy);
	const {minX, minY, width, height} = bounds(vertices);
	return {
		width,
		height,
		points: vertices.map(([x, y]) => [x - minX, y - minY]),
	};
});
const tallest = Math.max(...icons.map(icon => icon.height));
const widest = Math.max(...icons.map(icon => icon.width));
const artworkScale = 30 / tallest;
const gap = .4 * tallest;

function createLayout(vertical) {
	let offset = 0;
	const positions = icons.map(({width, height}) => {
		const position = vertical ? [(widest - width) / 2, offset] : [offset, (tallest - height) / 2];
		offset += (vertical ? height : width) + gap;
		return position;
	});
	const span = offset - gap;
	return {positions, width: vertical ? widest : span, height: vertical ? span : tallest};
}

const row = createLayout(false);
const column = createLayout(true);

export function createPieceDisplay(strip, {onSelect} = {}) {
	const pieces = icons.map(({width, height, points}, type) => {
		const item = svg('g', {class: 'piece'});
		item.style.setProperty('--piece-color', shapeColors[type]);
		item.dataset.type = type;

		const label = svg('text', {
			class: 'count',
			x: width,
			y: height,
			'font-size': 12 / artworkScale,
			'stroke-width': 3 / artworkScale,
			'aria-hidden': 'true',
		});
		item.append(svgPolygon(points), label);

		if (onSelect) {
			item.setAttribute('role', 'button');
			const activate = () => {
				if (item.getAttribute('aria-disabled') === 'false') onSelect(type);
			};
			item.onclick = event => { if (event.detail === 0) activate(); };
			item.onkeydown = event => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				activate();
			};
		}
		return {item, label};
	});
	strip.replaceChildren(...pieces.map(({item}) => item));

	let layout;
	return {
		fit(boardScale) {
			const dock = strip.parentElement;
			const next = matchMedia('(orientation:landscape)').matches ? column : row;
			const {positions, width, height} = next;
			if (layout !== next) {
				layout = next;
				strip.setAttribute('viewBox', `0 0 ${width} ${height}`);
				pieces.forEach(({item}, type) => item.setAttribute('transform', `translate(${positions[type].join(' ')})`));
			}
			const heightCap = Math.min(44, Math.max(30, Math.min(innerWidth, innerHeight) * .09));
			const scale = Math.min(dock.clientWidth / width, dock.clientHeight / height, boardScale, heightCap / tallest);
			strip.setAttribute('width', width * scale);
			strip.setAttribute('height', height * scale);
		},
		render({hand, disabled = false}) {
			pieces.forEach(({item, label}, type) => {
				const count = hand[type];
				item.style.visibility = count ? 'visible' : 'hidden';
				label.textContent = String(count);
				if (onSelect) {
					const unavailable = disabled || !count;
					item.setAttribute('aria-disabled', String(unavailable));
					item.setAttribute('tabindex', unavailable ? '-1' : '0');
					item.setAttribute('aria-label', `${shapes[type].name}, ${count} remaining`);
				}
			});
		},
	};
}
