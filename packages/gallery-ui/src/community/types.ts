export type Member = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  trusted?: boolean;
};
export type Comment = {
  id: string;
  member: Pick<Member, 'id' | 'name' | 'avatar'>;
  text: string;
  date: string;
  status: 'published' | 'pending' | 'hidden';
  reply?: string;
};
export type CommunitySettings = {
  registration: boolean;
  comments: boolean;
  likes: boolean;
  showComments: boolean;
  showLikes: boolean;
};
export const defaultCommunitySettings = (): CommunitySettings => ({
  registration: true,
  comments: true,
  likes: true,
  showComments: true,
  showLikes: true,
});
