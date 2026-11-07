import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {penalty, shapes} from '../src/engine.js';

// Exercise the actual scoring functions with immediate browser animations.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const labels = [], landings = [], renders = [], saved = [], cues = [];
const scores = [0, 1].map(player => ({
  getBoundingClientRect: () => ({left: 400, top: player * 100, width: 40, height: 20}),
  animate: () => ({finished: Promise.resolve()}),
  set textContent(value) { landings.push([player, value]); },
}));
let context;
context = vm.createContext({
  shapes, penalty, clearTimeout, computerTimer: undefined,
  state: {over: false, mode: 'practice', practiceNumber: 1,
    scores: [100, 80], hands: [[2, 1, 0, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0, 0]], turn: 0, board: [1]},
  selected: 0, preview: {}, scoring: null, busy: false, legal: [],
  dock: {reset() {}}, moves: () => [],
  docks: [0, 1].map(player => ({querySelector(selector) {
    const type = Number(selector.match(/\d+/)[0]);
    return {getBoundingClientRect: () => ({left: type * 50, top: player * 100, width: 20, height: 40})};
  }})),
  save() { saved.push(structuredClone(context.state)); },
  render() { renders.push({scores: context.state.scores.map((score, p) => score - (context.scoring?.points[p] || 0)), result: context.state.over && !context.scoring}); },
  requestAnimationFrame(callback) { callback(); },
  practiceWon: state => state.over && state.scores[0] > state.scores[1],
  completed: new Set(), progressKey: 'progress', localStorage: {setItem() {}},
  sounds: {play(cue) { cues.push(cue); }},
  document: {
    querySelector: selector => scores[Number(selector.match(/\d+/)[0])],
    createElement() {
      const label = {style: {}, remove() {}, animate(frames, options) {
        labels.push({text: this.textContent, origin: {...this.style}, frames, options});
        return {finished: Promise.resolve()};
      }};
      return label;
    },
    body: {append() {}},
  },
});
vm.runInContext([
  section('function refresh()', 'function computerMove()'),
  section('async function animatePoints(', 'async function animateBonus('),
  section('async function awardPoints(', 'async function commit('),
].join('\n'), context);
vm.runInContext('refresh()', context);
for (let tick = 0; context.scoring && tick < 100; tick++) await Promise.resolve();
assert.equal(context.scoring, null, 'All deductions complete');
assert.deepEqual(labels.filter((_, i) => i % 2 === 0).map(label => label.text), ['-15', '-15', '-20', '-30']);
assert.deepEqual(labels.filter((_, i) => i % 2 === 0).map(label => label.origin), [
  {left: '10px', top: '20px'}, {left: '10px', top: '20px'},
  {left: '60px', top: '20px'}, {left: '160px', top: '120px'},
]);
assert.deepEqual(landings, [[0, 85], [0, 70], [0, 50], [1, 50]]);
assert.deepEqual(renders, [{scores: [100, 80], result: false}, {scores: [50, 50], result: true}]);
assert.deepEqual(saved.map(state => state.scores), [[50, 50]], 'Final scores persist once before playback');
assert.deepEqual(cues, ['score', 'score', 'score', 'score', 'draw']);
vm.runInContext('refresh()', context);
assert.equal(labels.length, 8, 'Refreshing a finished game cannot repeat deductions');

// Positive scores use the very same bounce and flight with a board origin.
context.state.scores = [65, 50];
context.scoring = {points: [15, 0]};
context.$ = () => ({getScreenCTM: () => ({})});
context.cells = [{p: [2, 3]}];
context.boardPoint = p => p;
context.screenPoint = ([x, y]) => ({x, y});
await vm.runInContext('awardPoints([0], 15, 0)', context);
assert.equal(labels[8].text, '+15');
assert.deepEqual(labels[8].frames, labels[0].frames, 'Award and deduction share the bounce');
assert.deepEqual(labels[8].options, labels[0].options);
assert.deepEqual(labels[9].options, labels[1].options, 'Award and deduction share flight timing');
assert.deepEqual(landings.at(-1), [0, 65]);
console.log('Passed per-copy dock deductions, origins, score timing, delayed results, persistence, and shared award animations.');
