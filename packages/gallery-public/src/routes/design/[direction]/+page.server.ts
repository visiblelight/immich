import { error } from '@sveltejs/kit';
export function load({ params }: { params: { direction: string } }) {
  if (params.direction !== 'a' && params.direction !== 'b') error(404, '方案不存在');
  return { direction: params.direction as 'a' | 'b' };
}
