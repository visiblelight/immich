import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsPage, analyticsReferrer } from '../src/lib/analytics/events.ts';
test('only successful public routes enter page analytics', () => {
  for (const path of ['/albums', '/albums/trip', '/albums/trip/photos/123', '/photos', '/records/a', '/about', '/visited/GE']) assert.equal(analyticsPage(path), path);
  for (const path of ['/design/albums', '/preview/a', '/api/visited/GE', '/media/a/b', '/analytics-preferences', '/login']) assert.equal(analyticsPage(path), null);
  assert.equal(analyticsPage('/albums/private', 404), null);
});
test('referrers never leak query parameters, hashes, or private routes', () => {
  const origin = 'https://example.com';
  assert.equal(analyticsReferrer('https://search.example/find?q=private#token', origin), 'https://search.example');
  assert.equal(analyticsReferrer('/photos?photo=secret#token', origin), '/photos');
  assert.equal(analyticsReferrer('/preview/private?token=x', origin), '');
  assert.equal(analyticsReferrer('javascript:alert(1)', origin), '');
});
