import { waitUntil } from '@vercel/functions';
import { handleApi } from '../src/http.js';
import { createStore } from '../src/store.js';

const store = createStore();

export const handle = (request) => handleApi(request, { store, waitUntil });
