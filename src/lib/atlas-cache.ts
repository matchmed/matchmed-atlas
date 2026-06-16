function openDB(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
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

export async function loadAtlasCache<T>(
  dbName: string,
  storeName: string,
  cacheKey: string,
  ttlMs: number,
): Promise<T[] | null> {
  try {
    const db = await openDB(dbName, storeName)
    return await new Promise<T[] | null>(resolve => {
      const tx = db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).get(cacheKey)
      req.onsuccess = () => {
        const entry = req.result as { ts?: number; records?: unknown } | undefined
        if (!entry || typeof entry.ts !== 'number' || Date.now() - entry.ts > ttlMs) {
          resolve(null)
          return
        }
        if (!Array.isArray(entry.records)) {
          resolve(null)
          return
        }
        resolve(entry.records as T[])
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveAtlasCache<T>(
  dbName: string,
  storeName: string,
  cacheKey: string,
  records: T[],
): Promise<boolean> {
  try {
    const db = await openDB(dbName, storeName)
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put({ ts: Date.now(), records }, cacheKey)
    await waitForTransaction(tx)
    return true
  } catch (e) {
    console.warn('IndexedDB save failed', e)
    return false
  }
}
