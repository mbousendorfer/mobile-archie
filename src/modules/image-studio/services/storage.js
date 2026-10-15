// Image Generator — storageService: CRUD for every entity of the module.
//
// Metadata lives in localStorage, one key per collection, all under
// `imageStudio:v2:`. Pixels (uploads, exported / favourited PNGs) live in the
// IndexedDB database `imageStudio`, store `blobs`. Generated variations are NOT
// stored as pixels: seed + style + palette + format re-render them identically.
//
// Swappable: a real backend only has to honour the same function signatures.

import { createNotifier } from "../state/notifier.js?v=1842";
import { SCHEMA_VERSION } from "../model/schema.js?v=1842";

const PREFIX = "imageStudio:v2:";
// No "brands": the brand is the Playbook. Every entity carries `brandId`, a Playbook id.
const COLLECTIONS = Object.freeze(["styles", "products", "creations", "assets"]);

// v1 kept its own brands; its keys are dropped rather than migrated — they
// only ever held demo data.
try {
  for (const k of Object.keys(window.localStorage))
    // v1 kept its own brands; v2 had campaigns (removed) — both dropped, not migrated.
    if (k.startsWith("imageStudio:v1:") || k === "imageStudio:v2:campaigns") window.localStorage.removeItem(k);
} catch {
  /* storage unavailable */
}

const cache = new Map();
const notifier = createNotifier();

function key(name) {
  return PREFIX + name;
}

function readJson(name, fallback) {
  try {
    const raw = window.localStorage.getItem(key(name));
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`[image-generator] unreadable ${key(name)}; starting empty.`, error);
    return fallback;
  }
}

function writeJson(name, value) {
  try {
    window.localStorage.setItem(key(name), JSON.stringify(value));
    return true;
  } catch (error) {
    // Quota: the metadata is small, so this is almost always a private window.
    console.warn(`[image-generator] could not persist ${key(name)}`, error);
    return false;
  }
}

function load(collection) {
  if (!COLLECTIONS.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
  if (!cache.has(collection)) cache.set(collection, readJson(collection, []));
  return cache.get(collection);
}

function save(collection, items) {
  cache.set(collection, items);
  writeJson(collection, items);
  notifier.notify({ collection });
}

// ── Collections ──────────────────────────────────────────────────────────────

export function list(collection, predicate) {
  const items = load(collection);
  return predicate ? items.filter(predicate) : items.slice();
}

export function get(collection, id) {
  return load(collection).find((item) => item.id === id) || null;
}

/** Insert or replace by id. Stamps updatedAt. Returns the stored entity. */
export function put(collection, entity) {
  const items = load(collection).slice();
  const stored = { ...entity, updatedAt: new Date().toISOString() };
  const index = items.findIndex((item) => item.id === entity.id);
  if (index === -1) items.push(stored);
  else items[index] = stored;
  save(collection, items);
  return stored;
}

function putMany(collection, entities) {
  const items = load(collection).slice();
  for (const entity of entities) {
    const index = items.findIndex((item) => item.id === entity.id);
    if (index === -1) items.push(entity);
    else items[index] = entity;
  }
  save(collection, items);
}

export function remove(collection, id) {
  save(
    collection,
    load(collection).filter((item) => item.id !== id),
  );
}

export function subscribe(fn) {
  return notifier.subscribe(fn);
}

// ── Meta ─────────────────────────────────────────────────────────────────────

export function getMeta() {
  return readJson("meta", { schemaVersion: SCHEMA_VERSION, seededAt: null, activePlaybookId: null });
}

function setMeta(patch) {
  const next = { ...getMeta(), ...patch };
  writeJson("meta", next);
  notifier.notify({ collection: "meta" });
  return next;
}

/** Seeds the demo data once per browser. `seed()` returns { styles, products, … }. */
export function ensureSeeded(seed) {
  const meta = getMeta();
  if (meta.seededAt) return false;
  const data = seed();
  for (const collection of COLLECTIONS) if (data[collection]) putMany(collection, data[collection]);
  setMeta({ schemaVersion: SCHEMA_VERSION, seededAt: new Date().toISOString() });
  return true;
}

// ── Blobs (IndexedDB) ────────────────────────────────────────────────────────

const DB_NAME = "imageStudio";
const STORE = "blobs";
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function putBlob(blobKey, blob) {
  return tx("readwrite", (store) => store.put(blob, blobKey));
}

function getBlob(blobKey) {
  return tx("readonly", (store) => store.get(blobKey));
}

export function deleteBlob(blobKey) {
  return tx("readwrite", (store) => store.delete(blobKey));
}

const objectUrls = new Map();

/** A displayable URL for an asset: inline SVG → data URL, blob → object URL (cached). */
export async function assetUrl(asset) {
  if (!asset) return null;
  if (asset.svg) return svgDataUrl(asset.svg);
  if (!asset.blobKey) return null;
  if (objectUrls.has(asset.blobKey)) return objectUrls.get(asset.blobKey);
  const blob = await getBlob(asset.blobKey).catch(() => null);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(asset.blobKey, url);
  return url;
}

export function svgDataUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
