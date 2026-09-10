import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseConfig } from '../src/config.server.ts';

test('runtime roles cannot accidentally use the Immich database owner', () => {
  for (const role of ['postgres', 'immich', 'gallery_admin', 'gallery_migrator']) {
    assert.throws(() => databaseConfig(`postgresql://${role}:secret@localhost/immich`, 'gallery-public'));
  }
});

test('public and admin connections remain explicit and separately scoped', () => {
  for (const [service, role] of [['gallery-public', 'gallery_public'], ['gallery-admin', 'gallery_admin']] as const) {
    const url = `postgresql://${role}:secret@localhost/immich`;
    const config = databaseConfig(url, service);
    assert.equal(config.connectionString, url);
    assert.equal(config.application_name, service);
    assert.ok(config.statement_timeout > 0);
  }
});

test('connection errors do not echo credentials', () => {
  for (const value of ['', 'invalid-very-secret', 'https://gallery_public:very-secret@localhost/immich', 'postgresql://postgres:very-secret@localhost/immich']) {
    assert.throws(() => databaseConfig(value, 'gallery-public'), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('very-secret'));
      return true;
    });
  }
});

test('query options cannot override the validated role', () => {
  assert.throws(() => databaseConfig('postgresql://gallery_public:secret@localhost/immich?user=postgres', 'gallery-public'));
});

test('missing database and fragments are rejected', () => {
  for (const value of ['postgresql://gallery_public@localhost/', 'postgresql://gallery_public@localhost/immich#ignored']) {
    assert.throws(() => databaseConfig(value, 'gallery-public'));
  }
});
