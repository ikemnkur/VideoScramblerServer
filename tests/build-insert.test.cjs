const test = require('node:test');
const assert = require('node:assert/strict');
const buildInsert = require('../lib/db/build-insert.cjs');

test('builds the exact registration INSERT and ordered bindings', () => {
  const data = {
    id: 'user-123',
    username: 'rookie',
    passwordHash: 'hashed-password',
    credits: 0,
    twoFactorEnabled: false,
    recoveryCodes: JSON.stringify(['code-1']),
    banDate: null
  };

  assert.deepStrictEqual(buildInsert('userData', data), {
    sql: 'INSERT INTO userData (id, username, passwordHash, credits, twoFactorEnabled, recoveryCodes, banDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
    values: ['user-123', 'rookie', 'hashed-password', 0, false, '["code-1"]', null]
  });
});

test('keeps quotes and SQL-like user input in bindings, not SQL', () => {
  const username = "O'Brien'); DROP TABLE userData; --";

  assert.deepStrictEqual(buildInsert('userData', { username }), {
    sql: 'INSERT INTO userData (username) VALUES (?)',
    values: [username]
  });
});

test('passes values through without mutation or serialization', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const metadata = { enabled: true };
  const data = Object.freeze({ createdAt, metadata, optional: undefined, bio: '' });
  const result = buildInsert('userData', data);

  assert.equal(result.sql, 'INSERT INTO userData (createdAt, metadata, optional, bio) VALUES (?, ?, ?, ?)');
  assert.deepStrictEqual(result.values, [createdAt, metadata, undefined, '']);
  assert.strictEqual(result.values[0], createdAt);
  assert.strictEqual(result.values[1], metadata);
});

test('includes only own enumerable columns in matching key/value order', () => {
  const data = Object.create({ inherited: 'not a column' });
  data.username = 'rookie';
  data.id = 'user-123';
  Object.defineProperty(data, 'hidden', { value: 'not a column', enumerable: false });

  assert.deepStrictEqual(buildInsert('userData', data), {
    sql: 'INSERT INTO userData (username, id) VALUES (?, ?)',
    values: ['rookie', 'user-123']
  });
});

test('preserves errors for missing record data', () => {
  assert.throws(() => buildInsert('userData', null), TypeError);
  assert.throws(() => buildInsert('userData', undefined), TypeError);
});
