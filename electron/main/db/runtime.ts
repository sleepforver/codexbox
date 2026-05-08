import type { Database } from 'sql.js'

export function run(db: Database, sql: string, params: unknown[] = []): void {
  db.run(sql, params)
}

export function transaction(db: Database, work: () => void): void {
  db.run('BEGIN')
  try {
    work()
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}

export function readOne<T>(db: Database, sql: string, params: unknown[] = []): T | null {
  const statement = db.prepare(sql)
  statement.bind(params)

  try {
    if (!statement.step()) return null
    return statement.getAsObject() as T
  } finally {
    statement.free()
  }
}

export function readMany<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  const statement = db.prepare(sql)
  statement.bind(params)
  const rows: T[] = []

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }
  } finally {
    statement.free()
  }

  return rows
}
