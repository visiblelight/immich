import type { ManagedAlbum, AlbumContent } from './content.ts';
export function albumPhotoCounts(content: Pick<AlbumContent, 'photos'>) {
  return {
    photos: content.photos.length,
    groups: new Set(content.photos.flatMap((p) => (p.group ? [p.group] : []))).size,
  };
}
export function galleryInventory(albums: ManagedAlbum[]) {
  return {
    albums: albums.length,
    photos: new Set(albums.flatMap((a) => a.draft.photos.map((p) => p.asset))).size,
    groups: albums.reduce((n, a) => n + albumPhotoCounts(a.draft).groups, 0),
  };
}
export function albumTreeRows(
  albums: ManagedAlbum[],
  search = '',
  filter = 'all',
  collapsed: ReadonlySet<string> = new Set(),
) {
  const byId = new Map(albums.map((a) => [a.id, a]));
  const matches = new Set(
    albums
      .filter(
        (a) =>
          a.draft.title.toLowerCase().includes(search.trim().toLowerCase()) &&
          (filter === 'all' ||
            (filter === 'draft' ? a.status === 'draft' : filter === 'online' ? a.visible : !a.visible)),
      )
      .map((a) => a.id),
  );
  const included = new Set(matches);
  for (const id of matches) {
    let parent = byId.get(id)?.draft.parent;
    const seen = new Set<string>();
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      included.add(parent);
      parent = byId.get(parent)?.draft.parent;
    }
  }
  const children = new Map<string, ManagedAlbum[]>();
  for (const a of albums) {
    const parent = byId.has(a.draft.parent) ? a.draft.parent : '';
    const list = children.get(parent) ?? [];
    list.push(a);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.draft.position - b.draft.position);
  const rows: { album: ManagedAlbum; depth: number; hasChildren: boolean; expanded: boolean; context: boolean }[] = [],
    seen = new Set<string>();
  const visit = (a: ManagedAlbum, depth: number) => {
    if (seen.has(a.id) || !included.has(a.id)) return;
    seen.add(a.id);
    const descendants = (children.get(a.id) ?? []).filter((c) => included.has(c.id));
    const expanded = !!search.trim() || filter !== 'all' || !collapsed.has(a.id);
    rows.push({ album: a, depth, hasChildren: descendants.length > 0, expanded, context: !matches.has(a.id) });
    if (expanded) for (const child of descendants) visit(child, depth + 1);
  };
  for (const a of children.get('') ?? []) visit(a, 0);
  return rows;
}
