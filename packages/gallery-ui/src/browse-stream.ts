import type { DisplayPhoto } from '../../gallery-core/src/content';
export type BrowseWindow = { page: number; total: number; hasMore: boolean; next: string | null };
export type StreamKind = 'albums' | 'photos';
export type BrowseStream = {
  albums?: BrowseWindow; photos?: BrowseWindow;
  loading: Record<StreamKind, boolean>; errors: Record<StreamKind, string>;
  previous: Record<StreamKind, boolean>;
  photoOffset: number;
  load: (kind: StreamKind, previous?: boolean) => Promise<boolean>;
  sort: string; changeSort: (sort: string) => void;
  photoChange: (photo: DisplayPhoto | null) => void;
};
