import assert from 'node:assert/strict';
import { bounds, hexagonVertices } from './src/geometry.js';
import { BOARD_SCALE, boardPoint, svgPoints, screenPoint, screenScale } from './src/board-coordinates.js';

// Asymmetric geometry catches confusing a bounding center with a vertex mean.
assert.deepEqual(bounds([[0, 0], [4, 0], [1, 2]]), {
  minX: 0, maxX: 4, minY: 0, maxY: 2, width: 4, height: 2, x: 2, y: 1,
});
assert.deepEqual(hexagonVertices([3, -2]), [[5, -2], [3, 0], [1, 0], [1, -2], [3, -4], [5, -4]]);
assert.deepEqual(boardPoint([2, 0]), [BOARD_SCALE * 2, 0]);
assert.deepEqual(boardPoint([0, 2]), [BOARD_SCALE, BOARD_SCALE * Math.sqrt(3)]);
assert.equal(svgPoints([[0, 0], [2, 0]]), `0,0 ${BOARD_SCALE * 2},0`);

// Screen projection includes translation, nonuniform scaling, and shear.
assert.deepEqual(screenPoint([10, 20], {a: 2, b: .5, c: -.25, d: 3, e: 100, f: -50}), {x: 115, y: 15});
assert.equal(screenScale({a: 0, b: 2}), BOARD_SCALE * 2, 'Rotated board scale');
assert.deepEqual(screenPoint(boardPoint([2, 0]), {a: 2, b: 0, c: 0, d: 2, e: 100, f: 50}), {
  x: BOARD_SCALE * 4 + 100, y: 50,
});
console.log('Passed shared bounds, hexagons, board coordinates, and screen transforms.');
