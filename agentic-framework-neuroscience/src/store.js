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
    this.kind = file ? 'file' : 'memory';
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
    this.kind = 'postgres';
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

/**
 * One private Vercel Blob holds `{ version, data }`. Writes are conditional on
 * the ETag seen by the matching read, so a stale writer gets a precondition
 * failure instead of overwriting newer state.
 */
export class BlobStore {
  constructor({ token, pathname = 'triad/state.json', sdk = null } = {}) {
    this.token = token;
    this.pathname = pathname;
    this.kind = 'blob';
    this.sdk = sdk;
    this.etags = new Map();
  }

  async blob() {
    if (!this.sdk) this.sdk = await import('@vercel/blob');
    return this.sdk;
  }

  async read() {
    const { get } = await this.blob();
    const res = await get(this.pathname, { access: 'private', useCache: false, token: this.token });
    if (!res || res.statusCode !== 200) return { version: 0, data: null };
    const { version, data } = JSON.parse(await new Response(res.stream).text());
    // Compressed reads report a weak ETag (W/"…"), but ifMatch on put only accepts the strong form.
    this.etags.set(version, String(res.blob.etag).replace(/^W\//, ''));
    return { version, data };
  }

  async write(data, expectedVersion) {
    const { put } = await this.blob();
    const body = JSON.stringify({ version: expectedVersion + 1, data });
    const options = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60, token: this.token };
    if (expectedVersion === 0) {
      options.allowOverwrite = false;
    } else {
      const etag = this.etags.get(expectedVersion);
      if (!etag) return false;
      options.allowOverwrite = true;
      options.ifMatch = etag;
    }
    try {
      const res = await put(this.pathname, body, options);
      this.etags.clear();
      this.etags.set(expectedVersion + 1, res.etag);
      return true;
    } catch (err) {
      if (isWriteConflict(err)) return false;
      throw err;
    }
  }
}

function isWriteConflict(err) {
  const name = err?.constructor?.name ?? err?.name ?? '';
  return name === 'BlobPreconditionFailedError' || /precondition|already exists/i.test(String(err?.message));
}

export function createStore({ file = null } = {}) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) return new PostgresStore(url);
  if (process.env.BLOB_READ_WRITE_TOKEN) return new BlobStore({ token: process.env.BLOB_READ_WRITE_TOKEN });
  return new FileStore(file);
}
