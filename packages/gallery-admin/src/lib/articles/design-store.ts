import type { ArticleSample } from '@gallery/ui/article-design';
export type LocalImage = { id: string; name: string; file: Blob };
export type ArticleDesignState = {
  articles: ArticleSample[];
  images: LocalImage[];
  published: Record<string, ArticleSample>;
  about: string;
};
// Design-only IndexedDB. No formal article endpoint may read or trust these records.
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gallery-article-design-v1', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadDesign(): Promise<ArticleDesignState | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace');
    const req = tx.objectStore('workspace').get('draft');
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function saveDesign(state: ArticleDesignState) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite');
    tx.objectStore('workspace').put(state, 'draft');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
