export const xy = ([x, y]) => [x + y / 2, y * Math.sqrt(3) / 2];

export function hexagonVertices([x, y], radius = 2) {
  return [[radius, 0], [0, radius], [-radius, radius], [-radius, 0], [0, -radius], [radius, -radius]]
    .map(([a, b]) => [a + x, b + y]);
}

export function bounds(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX, height: maxY - minY,
    x: (minX + maxX) / 2, y: (minY + maxY) / 2,
  };
}
