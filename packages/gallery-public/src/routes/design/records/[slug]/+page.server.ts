import { error } from '@sveltejs/kit';
import { sampleArticles } from '@gallery/ui/article-design';
export function load({ params }: { params: { slug: string } }) {
  const article = sampleArticles.find((a) => a.id === params.slug);
  if (!article) error(404, '文章不存在');
  return { article };
}
