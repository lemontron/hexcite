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
  return { width, viewBox: `${x} ${y} ${width} ${height}`, points: vertices.map(p => p.join(',')).join(' ') };
});
const totalWidth = icons.reduce((sum, icon) => sum + icon.width, 0);

// Both players use the same presentation; onSelect enables interaction only.
export function createPieceDisplay(container, { onSelect } = {}) {
  function positionCounts() {
    for (const item of container.children) {
      const shape = item.querySelector('polygon').getBoundingClientRect();
      const rect = item.getBoundingClientRect();
      const count = item.querySelector('.count');
      count.style.left = `${shape.right - rect.left}px`;
      count.style.top = `${shape.bottom - rect.top}px`;
    }
  }
  const layout = new ResizeObserver(positionCounts);
  layout.observe(container);

  return {
    render({ hand, disabled = false }) {
      container.replaceChildren();
      icons.forEach((icon, type) => {
        const count = hand[type];
        if (!count) return;
        const item = document.createElement(onSelect ? 'button' : 'div');
        item.className = 'piece';
        item.style.setProperty('--piece-color', shapeColors[type]);
        // Preserve scale as exhausted shapes disappear and the row closes up.
        item.style.flexBasis = `calc((100% - 12px) * ${icon.width / totalWidth})`;
        item.dataset.type = type;
        item.innerHTML = `<svg viewBox="${icon.viewBox}"><polygon points="${icon.points}" fill="${shapeColors[type]}"/></svg><span class="count">${count}</span>`;
        if (onSelect) {
          item.disabled = disabled;
          item.onclick = event => { if (event.detail === 0) onSelect(type); };
        }
        container.append(item);
      });
      requestAnimationFrame(positionCounts);
    },
  };
}
