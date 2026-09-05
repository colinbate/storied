import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/d1';

// Exercise the real Drizzle D1 queries against disposable SQLite, including atomic batches.
export function database(beforeMigration) {
	const sqlite = new DatabaseSync(':memory:');
	for (const name of readdirSync('migrations')
		.filter((name) => name.endsWith('.sql') && (!beforeMigration || name < beforeMigration))
		.sort())
		sqlite.exec(readFileSync(`migrations/${name}`, 'utf8'));
	sqlite.exec('PRAGMA foreign_keys = ON');
	const binding = {
		prepare(sql) {
			const query = (params = []) => ({
				bind(...values) {
					return query(values);
				},
				async all() {
					const results = sqlite.prepare(sql).all(...params);
					return {
						results,
						success: true,
						meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get().n) }
					};
				},
				async first(column) {
					const row = sqlite.prepare(sql).get(...params);
					return column ? (row?.[column] ?? null) : (row ?? null);
				},
				async raw() {
					const statement = sqlite.prepare(sql);
					statement.setReturnArrays(true);
					return statement.all(...params);
				},
				async run() {
					return this.all();
				}
			});
			return query();
		},
		async batch(statements) {
			sqlite.exec('BEGIN');
			try {
				const result = [];
				for (const statement of statements) result.push(await statement.all());
				sqlite.exec('COMMIT');
				return result;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		}
	};
	return { sqlite, binding, db: drizzle(binding) };
}
