import { ensure, validateContent, type AlbumContent } from './content.ts';

/** A membership edit includes both sides of every affected group, across draft and release. */
export function albumItemScope(target: string, ...versions: AlbumContent[]) {
  const ids = new Set<string>();
  const groups = new Set<string>();
  for (const c of versions) {
    if (c.groups?.some((g) => g.id === target)) groups.add(target);
    if (c.photos.some((p) => p.id === target)) ids.add(target);
  }
  let changed = true;
  while (changed) {
    const size = ids.size + groups.size;
    for (const c of versions)
      for (const p of c.photos) {
        if (ids.has(p.id) && p.group) groups.add(p.group);
        if (p.group && groups.has(p.group)) ids.add(p.id);
      }
    changed = size !== ids.size + groups.size;
  }
  ensure(ids.size, '照片或照片组已不存在，请重新载入。', 409);
  return { ids, groups };
}

export function mergeAlbumItem(
  base: AlbumContent,
  incoming: AlbumContent,
  target: string,
  ...contexts: AlbumContent[]
) {
  const scope = albumItemScope(target, base, incoming, ...contexts);
  for (const c of [base, ...contexts])
    for (const p of c.photos) {
      const next = incoming.photos.find((n) => n.id === p.id);
      ensure(!next || next.asset === p.asset, '照片身份不能更换来源。', 409);
    }
  const replacement = incoming.photos.filter((p) => scope.ids.has(p.id));
  const photos = base.photos.filter((p) => !scope.ids.has(p.id));
  const first = base.photos.findIndex((p) => scope.ids.has(p.id));
  let position = first < 0 ? photos.length : base.photos.slice(0, first).filter((p) => !scope.ids.has(p.id)).length;
  if (first < 0 && replacement.length) {
    const before = incoming.photos.slice(
      0,
      incoming.photos.findIndex((p) => p.id === replacement[0]!.id),
    );
    const anchor = before.findLast((p) => photos.some((x) => x.id === p.id));
    if (anchor) {
      // Insert after the complete anchor group; never split an unrelated group.
      position = photos.findLastIndex((p) => (anchor.group ? p.group === anchor.group : p.id === anchor.id)) + 1;
    } else position = 0;
  }
  photos.splice(position, 0, ...replacement);
  const content = validateContent({
    ...base,
    photos,
    groups: [
      ...(base.groups ?? []).filter((g) => !scope.groups.has(g.id)),
      ...(incoming.groups ?? []).filter((g) => scope.groups.has(g.id)),
    ],
    cover:
      base.cover && base.photos.some((p) => p.asset === base.cover) && !photos.some((p) => p.asset === base.cover)
        ? ''
        : base.cover,
  });
  return { content, ...scope };
}

export function sameAlbumContent(a: AlbumContent, b: AlbumContent) {
  const canonical = (c: AlbumContent) => {
    const value = validateContent(c);
    return JSON.stringify({
      ...value,
      blocks: [],
      photos: value.photos.map(({ photoVersion, ...p }) => p),
      groups: [...(value.groups ?? [])].sort((x, y) => x.id.localeCompare(y.id)),
    });
  };
  return canonical(a) === canonical(b);
}
