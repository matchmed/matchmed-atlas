const CHUNK_SIZE = 800
const CHUNK_THRESHOLD = 1500

type SingleEntry<T> = { ts: number; records: T[] }
type MetaEntry = { ts: number; chunks: number; total: number }

function cacheMemKey(dbName: string, cacheKey: string) {
  return `${dbName}::${cacheKey}`
}

const memory = new Map<string, SingleEntry<unknown>>()

export function peekAtlasCache<T>(dbName: string, cacheKey: string, ttlMs: number): T[] | null {
  const entry = memory.get(cacheMemKey(dbName, cacheKey))
  if (!entry || Date.now() - entry.ts > ttlMs) return null
  if (!Array.isArray(entry.records)) return null
  return entry.records as T[]
}

function peekAtlasCacheAnyAge<T>(dbName: string, cacheKey: string): T[] | null {
  const entry = memory.get(cacheMemKey(dbName, cacheKey))
  if (!entry || !Array.isArray(entry.records)) return null
  return entry.records as T[]
}

async function loadAtlasCacheAnyAge<T>(
  dbName: string,
  storeName: string,
  cacheKey: string,
): Promise<T[] | null> {
  const mem = peekAtlasCacheAnyAge<T>(dbName, cacheKey)
  if (mem) return mem

  try {
    const db = await openDB(dbName, storeName)
    return await new Promise<T[] | null>(resolve => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(cacheKey)

      req.onsuccess = () => {
        const entry = req.result as SingleEntry<T> | MetaEntry | undefined
        if (!entry || typeof entry.ts !== 'number') {
          resolve(null)
          return
        }

        if ('chunks' in entry && typeof entry.chunks === 'number') {
          loadChunkedRecords(store, cacheKey, entry).then(records => {
            if (!records) {
              resolve(null)
              return
            }
            setMemory(dbName, cacheKey, records)
            resolve(records as T[])
          })
          return
        }

        if ('records' in entry && Array.isArray(entry.records)) {
          setMemory(dbName, cacheKey, entry.records)
          resolve(entry.records)
          return
        }

        resolve(null)
      }

      req.onerror = () => resolve(null)
      tx.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function patchAtlasCacheRecord<T extends { id: string }>(
  dbName: string,
  storeName: string,
  cacheKey: string,
  id: string,
  patch: Partial<T>,
): Promise<boolean> {
  const records = await loadAtlasCacheAnyAge<T>(dbName, storeName, cacheKey)
  if (!records) return false

  const idx = records.findIndex(r => r.id === id)
  if (idx === -1) return false

  const next = [...records]
  next[idx] = { ...next[idx], ...patch }
  return saveAtlasCache(dbName, storeName, cacheKey, next)
}

function setMemory<T>(dbName: string, cacheKey: string, records: T[]) {
  memory.set(cacheMemKey(dbName, cacheKey), { ts: Date.now(), records })
}

function openDB(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Omit version so existing DBs open at their current version (avoids VersionError
    // when an older build already bumped the schema). New DBs are created at version 1
    // and onupgradeneeded creates the object store if missing.
    const req = indexedDB.open(dbName)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
      }
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function chunkKey(cacheKey: string, index: number) {
  return `${cacheKey}__chunk__${index}`
}

function loadChunkedRecords(
  store: IDBObjectStore,
  cacheKey: string,
  meta: MetaEntry,
): Promise<unknown[] | null> {
  return new Promise(resolve => {
    if (meta.chunks === 0) {
      resolve([])
      return
    }

    const chunks: unknown[][] = new Array(meta.chunks)
    let pending = meta.chunks
    let failed = false

    for (let i = 0; i < meta.chunks; i++) {
      const req = store.get(chunkKey(cacheKey, i))
      req.onsuccess = () => {
        if (failed) return
        if (!Array.isArray(req.result)) {
          failed = true
          resolve(null)
          return
        }
        chunks[i] = req.result
        pending -= 1
        if (pending === 0) {
          const records = chunks.flat()
          resolve(records.length === meta.total ? records : null)
        }
      }
      req.onerror = () => {
        if (!failed) {
          failed = true
          resolve(null)
        }
      }
    }
  })
}

function writeChunked(store: IDBObjectStore, cacheKey: string, records: unknown[], ts: number) {
  const chunks = Math.ceil(records.length / CHUNK_SIZE)
  store.put({ ts, chunks, total: records.length } satisfies MetaEntry, cacheKey)
  for (let i = 0; i < chunks; i++) {
    store.put(records.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), chunkKey(cacheKey, i))
  }
}

export async function loadAtlasCache<T>(
  dbName: string,
  storeName: string,
  cacheKey: string,
  ttlMs: number,
): Promise<T[] | null> {
  const mem = peekAtlasCache<T>(dbName, cacheKey, ttlMs)
  if (mem) return mem

  try {
    const db = await openDB(dbName, storeName)
    return await new Promise<T[] | null>(resolve => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(cacheKey)

      req.onsuccess = () => {
        const entry = req.result as SingleEntry<T> | MetaEntry | undefined
        if (!entry || typeof entry.ts !== 'number' || Date.now() - entry.ts > ttlMs) {
          resolve(null)
          return
        }

        if ('chunks' in entry && typeof entry.chunks === 'number') {
          // Fire all chunk reads synchronously before this handler returns.
          loadChunkedRecords(store, cacheKey, entry).then(records => {
            if (!records) {
              resolve(null)
              return
            }
            setMemory(dbName, cacheKey, records)
            resolve(records as T[])
          })
          return
        }

        if ('records' in entry && Array.isArray(entry.records)) {
          setMemory(dbName, cacheKey, entry.records)
          resolve(entry.records)
          return
        }

        resolve(null)
      }

      req.onerror = () => resolve(null)
      tx.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function persistToIndexedDB(
  dbName: string,
  storeName: string,
  cacheKey: string,
  records: unknown[],
  ts: number,
  chunked: boolean,
): Promise<void> {
  const db = await openDB(dbName, storeName)
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  if (chunked) {
    writeChunked(store, cacheKey, records, ts)
  } else {
    store.put({ ts, records }, cacheKey)
  }
  await waitForTransaction(tx)
}

export async function saveAtlasCache<T>(
  dbName: string,
  storeName: string,
  cacheKey: string,
  records: T[],
): Promise<boolean> {
  const ts = Date.now()
  setMemory(dbName, cacheKey, records)

  const useChunks = records.length > CHUNK_THRESHOLD

  try {
    await persistToIndexedDB(dbName, storeName, cacheKey, records, ts, useChunks)
    return true
  } catch (e) {
    if (!useChunks) {
      try {
        await persistToIndexedDB(dbName, storeName, cacheKey, records, ts, true)
        return true
      } catch (e2) {
        console.warn('IndexedDB save failed (chunked fallback)', e2)
        return false
      }
    }
    console.warn('IndexedDB save failed', e)
    return false
  }
}
