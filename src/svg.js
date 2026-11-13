const namespace = 'http://www.w3.org/2000/svg';

export function svg(tag, attributes = {}) {
	const element = document.createElementNS(namespace, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	return element;
}

export const polygonPoints = points => points.map(point => point.join(',')).join(' ');

export function svgPolygon(points, attributes) {
	return svg('polygon', {...attributes, points: polygonPoints(points)});
}
