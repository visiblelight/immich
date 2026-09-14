/** Structured article content is independent of album/photo Markdown. */
export type ArticleMark = {
  type: 'bold' | 'italic' | 'link';
  attrs?: { href: string };
};
export type ArticleNode = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number>;
  marks?: ArticleMark[];
  content?: ArticleNode[];
};
export type ArticleDocument = { schemaVersion: 1; doc: ArticleNode };
export type ArticleImage = {
  src: string;
  preview: string;
  alt: string;
  width?: number;
  height?: number;
};
export type ArticleImageResolver = (node: ArticleNode) => ArticleImage | null;

export function articleLink(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value))
    return null;
  if (/^\/(?!\/)/.test(value) || /^#[a-z0-9_-]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

/** Reject unknown content; never trust pasted HTML or editor-side validation. */
export function validateArticleDocument(input: unknown): ArticleDocument {
  if (new TextEncoder().encode(JSON.stringify(input) ?? '').length > 1_000_000)
    throw new Error('文章内容过大');
  const root = input as ArticleDocument;
  if (root?.schemaVersion !== 1 || root.doc?.type !== 'doc')
    throw new Error('文章格式无效');
  let count = 0;
  const block = new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'blockquote',
    'horizontalRule',
    'galleryImage',
  ]);
  function visit(
    value: ArticleNode,
    depth: number,
    parent: string,
  ): ArticleNode {
    if (++count > 10000 || depth > 20 || !value || typeof value !== 'object')
      throw new Error('文章结构过于复杂');
    const type = value.type;
    const inline = ['paragraph', 'heading', 'galleryImage'].includes(parent);
    const valid =
      parent === 'root'
        ? type === 'doc'
        : inline
          ? ['text', 'hardBreak'].includes(type)
          : ['bulletList', 'orderedList'].includes(parent)
            ? type === 'listItem'
            : block.has(type);
    if (!valid) throw new Error('文章包含不支持的内容');
    const out: ArticleNode = { type };
    if (type === 'text') {
      if (typeof value.text !== 'string' || !value.text.length)
        throw new Error('文字内容无效');
      out.text = value.text;
      if (value.marks)
        out.marks = value.marks.map((mark) => {
          if (mark.type === 'bold' || mark.type === 'italic')
            return { type: mark.type };
          const href = mark.type === 'link' && articleLink(mark.attrs?.href);
          if (!href) throw new Error('文章链接无效');
          return { type: 'link', attrs: { href } };
        });
    } else if (type === 'heading') {
      if (![2, 3].includes(Number(value.attrs?.level)))
        throw new Error('标题级别无效');
      out.attrs = { level: Number(value.attrs!.level) };
    } else if (type === 'orderedList') {
      const start = value.attrs?.start ?? 1;
      if (
        !Number.isInteger(start) ||
        Number(start) < 1 ||
        Number(start) > 10000
      )
        throw new Error('列表序号无效');
      out.attrs = { start };
    } else if (type === 'galleryImage') {
      const { kind, ref, album } = value.attrs ?? {};
      if (
        !['photo', 'upload'].includes(String(kind)) ||
        typeof ref !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(ref)
      )
        throw new Error('图片引用无效');
      if (
        kind === 'photo' &&
        (typeof album !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(album))
      )
        throw new Error('图片缺少来源相册');
      out.attrs = {
        kind: String(kind),
        ref,
        ...(kind === 'photo' ? { album: String(album) } : {}),
      };
    }
    if (value.content !== undefined) {
      if (
        !Array.isArray(value.content) ||
        ['text', 'hardBreak', 'horizontalRule'].includes(type)
      )
        throw new Error('文章结构无效');
      out.content = value.content.map((node) => visit(node, depth + 1, type));
    }
    if (
      ['bulletList', 'orderedList', 'listItem', 'blockquote'].includes(type) &&
      !out.content?.length
    )
      throw new Error('内容块不能为空');
    if (type === 'listItem' && out.content?.[0]?.type !== 'paragraph')
      throw new Error('列表项需以段落开始');
    return out;
  }
  return { schemaVersion: 1, doc: visit(root.doc, 0, 'root') };
}

export function articleText(node: ArticleNode): string {
  return node.text ?? (node.content ?? []).map(articleText).join('');
}
export function articleHeadings(document: ArticleDocument) {
  const headings: { id: string; text: string; level: number }[] = [];
  function visit(node: ArticleNode) {
    if (node.type === 'heading')
      headings.push({
        id: `section-${headings.length + 1}`,
        text: articleText(node),
        level: Number(node.attrs?.level),
      });
    node.content?.forEach(visit);
  }
  visit(document.doc);
  return headings;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/** Resolver must authorize refs first. No URL from persisted image attributes is rendered. */
export function renderArticle(
  document: ArticleDocument,
  resolve: ArticleImageResolver,
): string {
  const clean = validateArticleDocument(document);
  let heading = 0;
  let image = 0;
  function render(node: ArticleNode): string {
    const children = () => (node.content ?? []).map(render).join('');
    if (node.type === 'text') {
      let result = escape(node.text!);
      for (const mark of node.marks ?? [])
        result =
          mark.type === 'bold'
            ? `<strong>${result}</strong>`
            : mark.type === 'italic'
              ? `<em>${result}</em>`
              : `<a href="${escape(mark.attrs!.href)}" rel="noopener noreferrer">${result}</a>`;
      return result;
    }
    if (node.type === 'doc') return children();
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'horizontalRule') return '<hr>';
    if (node.type === 'heading')
      return `<h${node.attrs!.level} id="section-${++heading}">${children()}</h${node.attrs!.level}>`;
    if (node.type === 'galleryImage') {
      const resolved = resolve(node);
      const index = image++;
      const caption = children();
      if (!resolved)
        return `<figure><div class="article-image-unavailable">图片暂不可用</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      // Resolved URLs are server-generated; additionally reject active URL schemes.
      const mediaUrl = (url: string) =>
        !!articleLink(url) || /^blob:https?:\/\//.test(url);
      if (!mediaUrl(resolved.src) || !mediaUrl(resolved.preview))
        return '<figure><div class="article-image-unavailable">图片暂不可用</div></figure>';
      return `<figure><button type="button" class="article-image" data-article-image="${index}" aria-label="沉浸查看：${escape(resolved.alt)}"><img src="${escape(resolved.src)}" alt="${escape(resolved.alt)}" ${resolved.width && resolved.height && Number.isSafeInteger(resolved.width) && Number.isSafeInteger(resolved.height) ? `width="${resolved.width}" height="${resolved.height}"` : ''} loading="lazy" decoding="async"></button>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    const tag = (
      {
        paragraph: 'p',
        bulletList: 'ul',
        orderedList: 'ol',
        listItem: 'li',
        blockquote: 'blockquote',
      } as Record<string, string>
    )[node.type];
    return `<${tag}${node.type === 'orderedList' ? ` start="${node.attrs?.start ?? 1}"` : ''}>${children()}</${tag}>`;
  }
  return render(clean.doc);
}
