import type { CommunitySettings } from '@gallery/core';
export type AdminCommunityData = {
  settings: CommunitySettings;
  page: number;
  totals: { members: number; comments: number; pending: number };
  members: {
    id: string;
    name: string;
    email: string;
    avatar: string;
    date: string | Date;
    comments: number;
    likes: number;
    disabled: boolean;
    trusted: boolean;
  }[];
  comments: {
    id: string;
    kind: 'album' | 'photo' | 'article';
    targetId: string;
    title: string | null;
    targetPath: string | null;
    targetContext: string | null;
    text: string;
    reply: string;
    status: string;
    date: string | Date;
    member: { id: string; name: string; avatar: string };
  }[];
};
