import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlobStore } from '../src/store.js';
import { mutate } from '../src/runtime.js';

// In-memory stand-in for @vercel/blob that enforces allowOverwrite and ifMatch like the real service.
function fakeBlobSdk() {
  const blobs = new Map();
  let n = 0;
  class BlobPreconditionFailedError extends Error {}
  return {
    blobs,
    async get(pathname) {
      const b = blobs.get(pathname);
      if (!b) return null;
      return { statusCode: 200, stream: new Response(b.body).body, blob: { etag: b.etag } };
    },
    async put(pathname, body, { allowOverwrite, ifMatch }) {
      const cur = blobs.get(pathname);
      if (cur && !allowOverwrite) throw new Error('This blob already exists');
      if (ifMatch && cur?.etag !== ifMatch) throw new BlobPreconditionFailedError('Precondition failed');
      const etag = `"e${++n}"`;
      blobs.set(pathname, { body, etag });
      return { etag };
    },
  };
}

test('blob store: versioned writes round-trip and stale writers are rejected', async () => {
  const sdk = fakeBlobSdk();
  const a = new BlobStore({ token: 't', sdk });
  const b = new BlobStore({ token: 't', sdk });

  assert.deepEqual(await a.read(), { version: 0, data: null });
  assert.equal(await a.write({ n: 1 }, 0), true);
  assert.equal(await b.write({ n: 'dup' }, 0), false, 'second create loses');

  const ra = await a.read();
  const rb = await b.read();
  assert.equal(ra.version, 1);
  assert.equal(await a.write({ n: 2 }, ra.version), true);
  assert.equal(await b.write({ n: 'stale' }, rb.version), false, 'stale etag is rejected');
  assert.deepEqual(await b.read(), { version: 2, data: { n: 2 } });
});

test('blob store: two instances mutating concurrently both land', async () => {
  const sdk = fakeBlobSdk();
  const stores = [new BlobStore({ token: 't', sdk }), new BlobStore({ token: 't', sdk })];
  await Promise.all(
    stores.map((store, i) =>
      mutate(store, (s) => {
        s.addMemory({ pairId: 'A', scope: 'global', type: 'fact', text: `from instance ${i}` });
      })
    )
  );
  const { data, version } = await stores[0].read();
  assert.equal(version, 2);
  const texts = JSON.stringify(data);
  assert.ok(texts.includes('from instance 0') && texts.includes('from instance 1'));
});
