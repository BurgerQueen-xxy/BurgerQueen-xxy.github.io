import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBrachioRig } from '../public/modules/pet-rig.js';

// Exercise the shipped official artwork, without a browser or a second SVG parser.
const source = await readFile(new URL('../public/assets/pet-v4/brachio-front.svg', import.meta.url), 'utf8');
const paths = [...source.matchAll(/<path\b([^>]+)>/g)].flatMap(([, attributes]) => {
  const kind = attributes.match(/\bdata-pet-rig="([^"]+)"/)?.[1];
  if (!kind) return [];
  const original = attributes.match(/\bd="([^"]+)"/)?.[1];
  assert(original, `${kind} must have an original outline`);
  return [{
    dataset: { petRig: kind }, original, current: original,
    getAttribute(name) { assert.equal(name, 'd'); return this.current; },
    setAttribute(name, value) { assert.equal(name, 'd'); this.current = value; },
  }];
});
assert.equal(paths.length, 7, 'The body, mouth and both eyes must be present');
assert.match(source, /transform="translate\(272 0\) scale\(-1 1\)"/, 'The artwork must face into the page');
const rig = createBrachioRig({ querySelectorAll: () => paths });
const numbers = value => (value.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
const commands = value => value.match(/[MLCZ]/gi).join('');
const mean = (value, axis) => {
  const coordinates = numbers(value).filter((_, index) => index % 2 === axis);
  return coordinates.reduce((sum, coordinate) => sum + coordinate, 0) / coordinates.length;
};

// Extreme and intermediate turns must preserve path topology and planted legs.
for (const x of [-1, -.35, 0, .35, 1]) {
  for (const y of [-1, -.35, 0, .35, 1]) {
    rig.lookAt(x, y);
    for (const path of paths) {
      const before = numbers(path.original), after = numbers(path.current);
      assert.equal(commands(path.current), commands(path.original), 'A turn cannot split the continuous outline');
      assert.equal(after.length, before.length, 'Every original control point must remain');
      assert(after.every(Number.isFinite), 'No gaze quadrant may create invalid SVG coordinates');
      if (path.dataset.petRig === 'body') {
        for (let index = 0; index < before.length; index += 2) {
          if (before[index + 1] >= 170) {
            assert.equal(after[index], before[index], 'Lower-body x position must remain fixed');
            assert.equal(after[index + 1], before[index + 1], 'Lower-body y position must remain fixed');
          }
        }
      }
    }
    for (const kind of ['mouth', 'eye-near', 'eye-far']) {
      const pair = paths.filter(path => path.dataset.petRig === kind);
      assert.equal(pair[0].current, pair[1].current, `${kind} fill and stroke cannot separate`);
    }
  }
}

const face = paths.filter(path => path.dataset.petRig !== 'body');
for (const direction of [-1, 1]) {
  rig.lookAt(direction, 0);
  for (const path of face) {
    // Mirroring reverses local x, while leaving screen y unchanged.
    const screenShift = mean(path.original, 0) - mean(path.current, 0);
    assert(screenShift * direction > 0, 'The face must turn toward the screen pointer');
  }
  rig.lookAt(0, direction);
  for (const path of face) {
    assert((mean(path.current, 1) - mean(path.original, 1)) * direction > 0, 'The face must follow the pointer vertically');
  }
}

// Eyes can lead a stationary head, then all geometry returns exactly to the source.
rig.lookAt(0, 0, 1, -1);
const eye = paths.find(path => path.dataset.petRig === 'eye-near');
assert(mean(eye.current, 0) < mean(eye.original, 0), 'Leading eyes must look screen-right after mirroring');
assert(mean(eye.current, 1) < mean(eye.original, 1), 'Leading eyes must look upward');
const body = paths.find(path => path.dataset.petRig === 'body');
const stationary = numbers(body.original);
assert(numbers(body.current).every((value, index) => Math.abs(value - stationary[index]) <= .00051), 'Eye motion alone must not deform the body beyond coordinate serialization precision');
rig.lookAt(0, 0, 0, 0);
for (const path of paths) assert.equal(path.current, path.original, 'Reset must restore exact official path strings');

rig.lookAt(1, -1);
const limited = paths.map(path => path.current);
rig.lookAt(4, -4);
assert.deepEqual(paths.map(path => path.current), limited, 'Out-of-range input must stay within the same turn limits');
assert.throws(() => createBrachioRig({ querySelectorAll: () => paths.slice(1) }), /Incomplete/, 'Incomplete artwork must preserve the static fallback');
console.log('Brachio rig: 25 directions, fixed lower body, face direction, exact reset and turn limits passed.');
