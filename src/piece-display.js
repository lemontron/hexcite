import { shapes } from './engine.js';
import { xy, bounds } from './geometry.js';

export const shapeColors = ['#e53935', '#f3cf32', '#2463dd', '#299447', '#ed76b5', '#935d36', '#70c9f0'];

const icons = shapes.map(shape => {
	const vertices = shape.v.map(xy);
	const box = bounds(vertices);
	const width = box.width + .6;
	const height = 2.4;
	const x = box.x - width / 2;
	const y = box.y - height / 2;
	return {
		width,
		aspect: `${width} / ${height}`,
		viewBox: `${x} ${y} ${width} ${height}`,
		points: vertices.map(p => p.join(',')).join(' '),
		countX: (box.maxX - x) / width * 100,
		countY: (box.maxY - y) / height * 100,
	};
});
const totalWidth = icons.reduce((sum, icon) => sum + icon.width, 0);

// SVG and label share an aspect-ratio box, so their alignment is known before paint.
export function createPieceDisplay(container, {onSelect} = {}) {
	return {
		render({hand, disabled = false}) {
			const pieces = icons.flatMap((icon, type) => {
				const count = hand[type];
				if (!count) return [];
				const item = document.createElement(onSelect ? 'button' : 'div');
				item.className = 'piece';
				item.style.setProperty('--piece-color', shapeColors[type]);
				item.style.flexBasis = `calc((100% - 12px) * ${icon.width / totalWidth})`;
				item.dataset.type = type;
				item.innerHTML = `<span class="piece-art" style="aspect-ratio:${icon.aspect}"><svg viewBox="${icon.viewBox}"><polygon points="${icon.points}" fill="${shapeColors[type]}"/></svg><span class="count" style="left:${icon.countX}%;top:${icon.countY}%">${count}</span></span>`;
				if (onSelect) {
					item.disabled = disabled;
					item.onclick = event => { if (event.detail === 0) onSelect(type); };
				}
				return [item];
			});
			container.replaceChildren(...pieces);
		},
	};
}
