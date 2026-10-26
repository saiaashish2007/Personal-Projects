import fs from 'node:fs';
import path from 'node:path';

/**
 * Versioned storage for the whole session snapshot. `write` succeeds only if the
 * stored version still equals the version that was read, so concurrent requests
 * (three humans plus background agent turns) never overwrite each other.
 */

class FileStore {
  constructor(file) {
    this.file = file;
    this.version = 0;
    this.data = null;
    if (file && fs.existsSync(file)) {
      try {
        ({ version: this.version, data: this.data } = JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch (err) {
        console.error('Could not read saved session, starting fresh:', err.message);
      }
    }
  }

  async read() {
    return { version: this.version, data: this.data && structuredClone(this.data) };
  }

  async write(data, expectedVersion) {
    if (expectedVersion !== this.version) return false;
    this.version += 1;
    this.data = structuredClone(data);
    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ version: this.version, data }));
    }
    return true;
  }
}

class PostgresStore {
  constructor(url) {
    this.url = url;
    this.ready = null;
  }

  async sql() {
    if (!this.ready) {
      this.ready = (async () => {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(this.url);
        await sql`CREATE TABLE IF NOT EXISTS triad_state (
          id text PRIMARY KEY,
          version integer NOT NULL,
          data jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`;
        return sql;
      })();
      this.ready.catch(() => (this.ready = null));
    }
    return this.ready;
  }

  async read() {
    const sql = await this.sql();
    const rows = await sql`SELECT version, data FROM triad_state WHERE id = 'main'`;
    return rows.length ? { version: rows[0].version, data: rows[0].data } : { version: 0, data: null };
  }

  async write(data, expectedVersion) {
    const sql = await this.sql();
    const json = JSON.stringify(data);
    const rows =
      expectedVersion === 0
        ? await sql`INSERT INTO triad_state (id, version, data) VALUES ('main', 1, ${json}::jsonb)
                    ON CONFLICT (id) DO NOTHING RETURNING version`
        : await sql`UPDATE triad_state SET data = ${json}::jsonb, version = version + 1, updated_at = now()
                    WHERE id = 'main' AND version = ${expectedVersion} RETURNING version`;
    return rows.length > 0;
  }
}

export function createStore({ file = null } = {}) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return url ? new PostgresStore(url) : new FileStore(file);
}
