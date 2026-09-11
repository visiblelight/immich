import type { DraftPhoto, PhotoGroup } from './content.ts';

export const photoItemKey = (photo: DraftPhoto) => photo.group || photo.id;
export function albumPhotoItems(photos: DraftPhoto[]): DraftPhoto[] {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    const key = photoItemKey(photo);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Apply an exact permutation of stable item IDs; a group moves as one item. */
export function orderAlbumPhotos(photos: DraftPhoto[], keys: string[], groupId = ''): DraftPhoto[] {
  const current = groupId ? photos.filter((p) => p.group === groupId) : albumPhotoItems(photos);
  const key = groupId ? (p: DraftPhoto) => p.id : photoItemKey;
  const byId = new Map(current.map((p) => [key(p), p]));
  if (keys.length !== current.length || new Set(keys).size !== keys.length || keys.some((id) => !byId.has(id)))
    throw new Error('照片顺序已变化，请重新拖动。');
  if (!groupId)
    return keys.flatMap((id) => {
      const p = byId.get(id)!;
      return p.group ? photos.filter((member) => member.group === p.group) : [p];
    });
  let index = 0;
  return photos.map((p) => (p.group === groupId ? byId.get(keys[index++]!)! : p));
}

/** Selection follows photo identity, never the old or displayed array index. */
export function groupSelectedPhotos(photos: DraftPhoto[], selected: string[], id: string) {
  const chosen = photos.filter((p) => selected.includes(p.id) && !p.group);
  if (chosen.length < 2) throw new Error('请选择至少两张未分组照片。');
  const selectedIds = new Set(chosen.map((p) => p.id));
  const grouped = photos.map((p) => (selectedIds.has(p.id) ? { ...p, group: id } : p));
  const group: PhotoGroup = { id, title: '', description: '', cover: chosen[0]!.id };
  return { group, photos: orderAlbumPhotos(grouped, albumPhotoItems(grouped).map(photoItemKey)) };
}
