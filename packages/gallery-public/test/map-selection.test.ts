import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapSelection } from '../src/lib/visited/map-selection.ts';

test('expanding a provincial map ignores even a stale visit before loading its overview', () => {
  for (const scope of ['country', 'all']) {
    const state = mapSelection(new URLSearchParams({ scope, visit: 'expired-visit' }), 'region');
    assert.equal(state.scope, scope);
    assert.equal(state.expandedScope, scope);
    assert.equal(state.visitId, null);
  }
});

test('national maps only expand to all countries, preserving their own visit otherwise', () => {
  for (const scope of ['', 'country', 'region', 'unknown']) {
    const state = mapSelection(new URLSearchParams({ scope, visit: 'national-visit' }), 'country');
    assert.equal(state.scope, 'country');
    assert.equal(state.expandedScope, null);
    assert.equal(state.visitId, 'national-visit');
  }
  assert.equal(mapSelection(new URLSearchParams('scope=all&visit=expired'), 'country').visitId, null);
});

test('a provincial visit remains active in its own scope and is optional', () => {
  assert.deepEqual(mapSelection(new URLSearchParams('scope=region&visit=regional-visit'), 'region'), {
    scope: 'region', expandedScope: null, visitId: 'regional-visit',
  });
  assert.equal(mapSelection(new URLSearchParams(), 'region').visitId, null);
});
