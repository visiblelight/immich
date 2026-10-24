export interface Member {
  id: string;
  name: string;
  email: string;
  avatar: string;
  trusted: boolean;
}
export interface CommunitySettings {
  registration: boolean;
  comments: boolean;
  likes: boolean;
  showComments: boolean;
  showLikes: boolean;
}
export const closedCommunity = (): CommunitySettings => ({
  registration: false,
  comments: false,
  likes: false,
  showComments: false,
  showLikes: false,
});
export interface CommunityTarget {
  kind: 'album' | 'photo' | 'article';
  id: string;
}
export interface CommunityComment {
  id: string;
  member: Pick<Member, 'id' | 'name' | 'avatar'>;
  date: string;
  text: string;
  status: 'pending' | 'published' | 'hidden';
  reply?: string;
}
export interface CommunityThread {
  likes: number;
  liked: boolean;
  total: number;
  comments: CommunityComment[];
  hasMore: boolean;
}
export function avatarGeometry(seed: string) {
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const next = () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return hash >>> 0;
  };
  const colors = ['#537568', '#a18567', '#6f7e99', '#9b756e', '#7b8561', '#6d8490'];
  const color = colors[next() % colors.length]!;
  const shapes = Array.from({ length: 9 }, (_, i) => ({
    x: 9 + (i % 3) * 10,
    y: 9 + Math.floor(i / 3) * 10,
    kind: next() % 4,
    turn: (next() % 4) * 90,
  }));
  // Circles and squares look the same under rotation: deduplicate rendered geometry.
  return {
    color,
    shapes,
    fingerprint: `v1:${color}:${shapes.map((s) => `${s.kind}${s.kind < 2 ? 0 : s.turn / 90}`).join('')}`,
  };
}
