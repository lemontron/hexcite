import { xy } from './geometry.js';

export const BOARD_SCALE = 39;

// Lattice coordinates → board SVG coordinates → viewport pixels.
export const boardPoint = vertex => xy(vertex).map(value => value * BOARD_SCALE);

export function screenPoint([x, y], matrix) {
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}

export const screenScale = matrix => Math.hypot(matrix.a, matrix.b) * BOARD_SCALE;
