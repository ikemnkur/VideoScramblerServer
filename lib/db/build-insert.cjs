/**
 * Build an INSERT statement and positional bindings without executing it.
 * Table and column names must come from trusted application code; only values
 * are parameterized. Values are passed through without serialization.
 *
 * @param {string} tableName
 * @param {Record<string, unknown>} data A non-empty record of column values.
 * @returns {{ sql: string, values: unknown[] }}
 */
function buildInsert(tableName, data) {
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const values = Object.values(data);

  const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  return { sql, values };
}

module.exports = buildInsert;
