import test from 'node:test';
import assert from 'node:assert/strict';
import { englishNames } from '../src/lib/visited/map-language.ts';

test('English map labels fall back to local names without changing road refs', () => {
  const original = ['format', ['get', 'name'], {}, '\n', {}, ['get', 'ref'], {}];
  const result = englishNames(original) as unknown[];
  assert.deepEqual(result[1], [
    'case',
    ['all', ['has', 'name_en'], ['!=', ['get', 'name_en'], '']],
    ['get', 'name_en'],
    ['get', 'name'],
  ]);
  assert.deepEqual(result[5], ['get', 'ref']);
  assert.deepEqual(original[1], ['get', 'name']);
  assert.deepEqual(englishNames('{name}'), result[1]);
  assert.equal(englishNames('{ref}'), '{ref}');
});
