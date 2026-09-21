/** Structured article content is independent of album/photo Markdown. */
export type ArticleMark = {
  type: 'bold' | 'italic' | 'link' | 'underline' | 'strike' | 'highlight' | 'code';
  attrs?: { href: string };
};
export type ArticleNode = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | number[] | null>;
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
  items?: ArticleImage[];
  caption?: string;
};
export type ArticleImageResolver = (node: ArticleNode) => ArticleImage | null;

export function articleLink(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
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
  if (root?.schemaVersion !== 1 || root.doc?.type !== 'doc') throw new Error('文章格式无效');
  let count = 0;
  const block = new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'blockquote',
    'horizontalRule',
    'galleryImage',
    'galleryImageGroup',
    'imagePlaceholder',
    'codeBlock',
    'taskList',
    'table',
  ]);
  function visit(value: ArticleNode, depth: number, parent: string): ArticleNode {
    if (++count > 10000 || depth > 20 || !value || typeof value !== 'object')
      throw new Error('文章结构过于复杂');
    const type = value.type;
    const inline = ['paragraph', 'heading', 'galleryImage'].includes(parent);
    const valid =
      parent === 'root'
        ? type === 'doc'
        : parent === 'galleryImageGroup'
          ? type === 'galleryImage'
          : parent === 'codeBlock'
            ? type === 'text'
            : inline
              ? ['text', 'hardBreak'].includes(type)
              : ['bulletList', 'orderedList'].includes(parent)
                ? type === 'listItem'
                : parent === 'taskList'
                  ? type === 'taskItem'
                  : parent === 'table'
                    ? type === 'tableRow'
                    : parent === 'tableRow'
                      ? ['tableCell', 'tableHeader'].includes(type)
                      : block.has(type);
    if (!valid) throw new Error('文章包含不支持的内容');
    const out: ArticleNode = { type };
    if (type === 'text') {
      if (typeof value.text !== 'string' || !value.text.length) throw new Error('文字内容无效');
      out.text = value.text;
      if (value.marks)
        out.marks = value.marks.map((mark) => {
          if (['bold', 'italic', 'underline', 'strike', 'highlight', 'code'].includes(mark.type))
            return { type: mark.type };
          const href = mark.type === 'link' && articleLink(mark.attrs?.href);
          if (!href) throw new Error('文章链接无效');
          return { type: 'link', attrs: { href } };
        });
      if (parent === 'codeBlock' && value.marks?.length) throw new Error('代码块不能包含文字样式');
    } else if (type === 'taskItem') {
      if (typeof value.attrs?.checked !== 'boolean') throw new Error('任务完成状态无效');
      out.attrs = { checked: value.attrs.checked };
    } else if (['tableCell', 'tableHeader'].includes(type)) {
      const colspan = value.attrs?.colspan ?? 1,
        rowspan = value.attrs?.rowspan ?? 1;
      if (
        !Number.isInteger(colspan) ||
        Number(colspan) < 1 ||
        Number(colspan) > 20 ||
        !Number.isInteger(rowspan) ||
        Number(rowspan) < 1 ||
        Number(rowspan) > 100
      )
        throw new Error('表格合并范围无效');
      const widths = value.attrs?.colwidth;
      if (
        widths != null &&
        (!Array.isArray(widths) ||
          widths.length !== colspan ||
          widths.some((w) => !Number.isInteger(w) || (w !== 0 && w < 40) || w > 2000))
      )
        throw new Error('表格列宽无效');
      out.attrs = { colspan, rowspan, colwidth: widths ?? null };
    } else if (type === 'imagePlaceholder') {
      out.attrs = {
        alt: typeof value.attrs?.alt === 'string' ? value.attrs.alt.slice(0, 200) : '待补充图片',
      };
    } else if (type === 'codeBlock') {
      const language = value.attrs?.language;
      if (language != null && (typeof language !== 'string' || !/^[a-z0-9_+-]{0,30}$/i.test(language)))
        throw new Error('代码语言无效');
      out.attrs = { language: language ?? null };
    } else if (type === 'heading') {
      if (![2, 3, 4].includes(Number(value.attrs?.level))) throw new Error('标题级别无效');
      out.attrs = { level: Number(value.attrs!.level) };
    } else if (type === 'orderedList') {
      const start = value.attrs?.start ?? 1;
      if (!Number.isInteger(start) || Number(start) < 1 || Number(start) > 10000)
        throw new Error('列表序号无效');
      out.attrs = { start };
    } else if (type === 'galleryImageGroup') {
      const { kind, ref, album, caption = '' } = value.attrs ?? {};
      if (
        !['group', 'temporary'].includes(String(kind)) ||
        typeof caption !== 'string' ||
        caption.length > 10000
      )
        throw new Error('图片组格式无效');
      if (
        kind === 'group' &&
        (typeof ref !== 'string' ||
          !/^[a-zA-Z0-9-]{1,80}$/.test(ref) ||
          typeof album !== 'string' ||
          !/^[a-zA-Z0-9-]{1,80}$/.test(album) ||
          value.content?.length)
      )
        throw new Error('照片组引用无效');
      if (
        kind === 'temporary' &&
        (!Array.isArray(value.content) || value.content.length < 2 || value.content.length > 50)
      )
        throw new Error('临时图片组需要 2–50 张图片');
      out.attrs = {
        kind: String(kind),
        caption,
        ...(kind === 'group' ? { ref: String(ref), album: String(album) } : {}),
      };
    } else if (type === 'galleryImage') {
      const { kind, ref, album } = value.attrs ?? {};
      if (
        !['photo', 'upload'].includes(String(kind)) ||
        typeof ref !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(ref)
      )
        throw new Error('图片引用无效');
      if (kind === 'photo' && (typeof album !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(album)))
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
        ['text', 'hardBreak', 'horizontalRule', 'imagePlaceholder'].includes(type)
      )
        throw new Error('文章结构无效');
      out.content = value.content.map((node) => visit(node, depth + 1, type));
    }
    if (
      [
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'taskList',
        'taskItem',
        'table',
        'tableRow',
        'tableCell',
        'tableHeader',
      ].includes(type) &&
      !out.content?.length
    )
      throw new Error('内容块不能为空');
    if (['listItem', 'taskItem'].includes(type) && out.content?.[0]?.type !== 'paragraph')
      throw new Error('列表项需以段落开始');
    if (type === 'table') validateTable(out);
    return out;
  }
  return { schemaVersion: 1, doc: visit(root.doc, 0, 'root') };
}

/** Bound cell spans and reject ragged/overlapping tables before rendering. */
function validateTable(table: ArticleNode) {
  const rows = table.content!;
  if (rows.length > 100) throw new Error('表格最多 100 行');
  const grid: boolean[][] = rows.map(() => []);
  for (const [y, row] of rows.entries()) {
    let x = 0;
    for (const cell of row.content!) {
      while (grid[y]![x]) x++;
      const width = Number(cell.attrs!.colspan),
        height = Number(cell.attrs!.rowspan);
      if (x + width > 20 || y + height > rows.length) throw new Error('表格范围无效');
      for (let dy = 0; dy < height; dy++)
        for (let dx = 0; dx < width; dx++) {
          if (grid[y + dy]![x + dx]) throw new Error('表格单元格重叠');
          grid[y + dy]![x + dx] = true;
        }
      x += width;
    }
  }
  const width = grid[0]!.length;
  if (
    !width ||
    grid.some(
      (row) => row.length !== width || Array.from({ length: width }, (_, i) => row[i]).some((v) => !v),
    )
  )
    throw new Error('表格行列不完整');
}

export function articleTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
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
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Resolver must authorize refs first. No URL from persisted image attributes is rendered. */
export function renderArticle(document: ArticleDocument, resolve: ArticleImageResolver): string {
  const clean = validateArticleDocument(document);
  let heading = 0;
  let image = 0;
  function render(node: ArticleNode): string {
    const children = () => (node.content ?? []).map(render).join('');
    if (node.type === 'text') {
      let result = escape(node.text!);
      for (const mark of node.marks ?? []) {
        const tag = {
          bold: 'strong',
          italic: 'em',
          underline: 'u',
          strike: 's',
          highlight: 'mark',
          code: 'code',
        }[mark.type as 'bold'];
        result =
          mark.type === 'link'
            ? `<a href="${escape(mark.attrs!.href)}" rel="noopener noreferrer">${result}</a>`
            : `<${tag}>${result}</${tag}>`;
      }
      return result;
    }
    if (node.type === 'doc') return children();
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'horizontalRule') return '<hr>';
    if (node.type === 'heading')
      return `<h${node.attrs!.level} id="section-${++heading}">${children()}</h${node.attrs!.level}>`;
    if (node.type === 'codeBlock') return `<pre><code>${escape(articleText(node))}</code></pre>`;
    if (node.type === 'imagePlaceholder')
      return `<div class="article-image-unavailable">图片待补充：${escape(String(node.attrs?.alt ?? ''))}</div>`;
    if (node.type === 'table') {
      const columns = node
        .content![0]!.content!.flatMap((cell) =>
          Array.from({ length: Number(cell.attrs!.colspan) }, (_, i) => {
            const width = (cell.attrs!.colwidth as number[] | null)?.[i];
            return width ? `<col style="width:${width}px">` : '<col>';
          }),
        )
        .join('');
      return `<div class="article-table-scroll" role="region" aria-label="文章表格" tabindex="0"><table><colgroup>${columns}</colgroup><tbody>${children()}</tbody></table></div>`;
    }
    if (node.type === 'tableRow') return `<tr>${children()}</tr>`;
    if (['tableCell', 'tableHeader'].includes(node.type)) {
      const tag = node.type === 'tableHeader' ? 'th' : 'td';
      return `<${tag} colspan="${node.attrs!.colspan}" rowspan="${node.attrs!.rowspan}">${children()}</${tag}>`;
    }
    if (node.type === 'taskList') return `<ul data-type="taskList">${children()}</ul>`;
    if (node.type === 'taskItem')
      return `<li data-type="taskItem" data-checked="${node.attrs!.checked}"><span class="article-task-check" role="img" aria-label="${node.attrs!.checked ? '已完成' : '未完成'}">${node.attrs!.checked ? '☑' : '☐'}</span><div>${children()}</div></li>`;
    if (node.type === 'galleryImageGroup') {
      const resolved = node.attrs!.kind === 'group' ? resolve(node) : null;
      const items =
        node.attrs!.kind === 'group' ? (resolved?.items ?? []) : (node.content ?? []).map(resolve);
      if (!items.length)
        return '<figure><div class="article-image-unavailable">图片组暂不可用</div></figure>';
      const start = image;
      const slides = items
        .map((item) => {
          const index = image++;
          return item && articleLink(item.src) && articleLink(item.preview)
            ? `<button type="button" class="article-image" data-article-image="${index}" data-group-start="${start}" data-group-size="${items.length}" aria-label="沉浸查看：${escape(item.alt)}"><img src="${escape(item.src)}" alt="${escape(item.alt)}" loading="lazy" decoding="async"></button>`
            : '<div class="article-image-unavailable">图片暂不可用</div>';
        })
        .join('');
      // Source group descriptions belong to the gallery, not the article's narrative.
      const caption = node.attrs!.caption ? escape(String(node.attrs!.caption)).replaceAll('\n', '<br>') : '';
      const first = items.find((item) => item && item.width && item.height);
      const ratio =
        first &&
        Number.isSafeInteger(first.width) &&
        Number.isSafeInteger(first.height) &&
        first.width! > 0 &&
        first.height! > 0
          ? `${first.width}/${first.height}`
          : '3/2';
      const arrow = (direction: number) =>
        `<button type="button" class="article-media-control" data-carousel-step="${direction}" aria-label="图片组${direction < 0 ? '上一张' : '下一张'}" ${direction < 0 || items.length < 2 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction < 0 ? 'm14 5-7 7 7 7' : 'm10 5 7 7-7 7'}"/></svg></button>`;
      return `<figure class="article-carousel" aria-label="图片组"><div class="article-media-stage"><div class="article-carousel-track" style="aspect-ratio:${ratio}" tabindex="0" role="region" aria-label="图片组，可用左右方向键切换">${slides}</div>${items.length > 1 ? arrow(-1) + arrow(1) : ''}</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    if (node.type === 'galleryImage') {
      const resolved = resolve(node);
      const index = image++;
      const caption = children();
      if (!resolved)
        return `<figure><div class="article-image-unavailable">图片暂不可用</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      // Resolved URLs are server-generated; additionally reject active URL schemes.
      const mediaUrl = (url: string) => !!articleLink(url) || /^blob:https?:\/\//.test(url);
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

export interface ArticleContent {
  title: string;
  summary: string;
  date: string;
  document: ArticleDocument;
  cover: ArticleNode | null;
  listed: boolean;
  albums: string[];
}
export interface ManagedArticle extends ArticleContent {
  id: string;
  slug: string;
  version: string;
  status: 'draft' | 'published' | 'offline';
  hasChanges: boolean;
  updatedAt?: string | null;
  firstPublishedAt?: string | null;
  publishedAt?: string | null;
}
export interface ArticleMediaOption extends ArticleImage {
  id: string;
  ref: string;
  kind: 'photo' | 'upload' | 'group';
  hidden?: boolean;
  items?: ArticleMediaOption[];
  album?: string;
  albumTitle?: string;
  usage?: number;
  title: string;
}
export const articleImageKey = (node: ArticleNode) =>
  `${node.attrs?.kind}:${node.attrs?.album ?? ''}:${node.attrs?.ref}`;
export function articleImages(content: ArticleContent): { key: string; node: ArticleNode }[] {
  const result: { key: string; node: ArticleNode }[] = [];
  function visit(node: ArticleNode, key: string) {
    if (node.type === 'galleryImage') result.push({ key, node });
    node.content?.forEach((child, index) => visit(child, `${key}.${index}`));
  }
  visit(content.document.doc, 'body');
  if (content.cover) result.push({ key: 'cover', node: content.cover });
  return result;
}

/** Direct group refs are resolved against the source album's current published version. */
export function articleGroups(content: ArticleContent): { key: string; node: ArticleNode }[] {
  const result: { key: string; node: ArticleNode }[] = [];
  function visit(node: ArticleNode, key: string) {
    if (node.type === 'galleryImageGroup' && node.attrs?.kind === 'group') result.push({ key, node });
    node.content?.forEach((child, index) => visit(child, `${key}.${index}`));
  }
  visit(content.document.doc, 'body');
  return result;
}

/** Shares traversal order with renderArticle, including unavailable slots. */
export function articleDisplayImages(
  document: ArticleDocument,
  resolve: ArticleImageResolver,
): (ArticleImage | null)[] {
  const result: (ArticleImage | null)[] = [];
  function visit(node: ArticleNode) {
    if (node.type === 'galleryImageGroup' && node.attrs?.kind === 'group') {
      result.push(...(resolve(node)?.items ?? []));
      return;
    }
    if (node.type === 'galleryImage') result.push(resolve(node));
    else node.content?.forEach(visit);
  }
  visit(document.doc);
  return result;
}
