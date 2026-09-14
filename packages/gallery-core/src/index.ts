export const GALLERY_VERSION = '0.1.0-dev.0';
export * from './content.ts';

export type GalleryService = 'gallery-public' | 'gallery-admin';
export type UserRole = 'admin' | 'member';
export type AlbumStatus = 'draft' | 'published' | 'offline';
export type LocationMode = 'hidden' | 'approximate' | 'exact';
export type PhotoLocationMode = LocationMode | 'inherit';

// These are shared vocabulary, not a claim that authentication/publication exists yet.
export function liveness(service: GalleryService) {
  return { service, version: GALLERY_VERSION, status: 'alive' } as const;
}
export * from './markdown.ts';
export * from './photo-order.ts';
export * from './album-item.ts';
export * from './capture-time.ts';
export * from './visits.ts';
export * from './visited.ts';
export * from './admin-albums.ts';

export * from './article.ts';
