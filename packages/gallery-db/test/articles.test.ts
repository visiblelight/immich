import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  articleHeadings,
  articleLink,
  renderArticle,
  validateArticleDocument,
  type ArticleDocument,
  type ArticleNode,
} from '../../gallery-core/src/article.ts';
const doc = (...content: ArticleNode[]): ArticleDocument => ({
  schemaVersion: 1,
  doc: { type: 'doc', content },
});
const paragraph = (text: string): ArticleNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
test('article text and link attributes are escaped; active URL protocols are rejected', () => {
  const html = renderArticle(doc(paragraph('<img src=x onerror=alert(1)>')), () => null);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    '//evil.test',
    '/\\evil.test',
    'java\nscript:alert(1)',
  ])
    assert.equal(articleLink(value), null);
  assert.equal(articleLink('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  const linked = doc({
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: '链接',
        marks: [
          {
            type: 'link',
            attrs: { href: 'https://example.com/"onmouseover="alert(1)' },
          },
        ],
      },
    ],
  });
  assert.ok(renderArticle(linked, () => null).includes('&quot;'));
});
test('image content keeps references, discards client paths, and requires an album for photos', () => {
  const image: ArticleNode = {
    type: 'galleryImage',
    attrs: {
      kind: 'photo',
      ref: 'photo-1',
      album: 'album-1',
      src: 'https://private.test/original',
    },
    content: [{ type: 'text', text: '文章图注' }],
  };
  const clean = validateArticleDocument(doc(image));
  assert.deepEqual(clean.doc.content?.[0]?.attrs, {
    kind: 'photo',
    ref: 'photo-1',
    album: 'album-1',
  });
  const html = renderArticle(clean, () => null);
  assert.ok(html.includes('图片暂不可用'));
  assert.ok(!html.includes('private.test'));
  assert.throws(() => validateArticleDocument(doc({ ...image, attrs: { kind: 'photo', ref: 'photo-1' } })));
  assert.ok(
    renderArticle(clean, () => ({
      src: '/media/authorized',
      preview: '/media/authorized?size=preview',
      alt: '照片',
    })).includes('src="/media/authorized"'),
  );
});
test('headings and pure text have stable reader structure without requiring photos', () => {
  const document = doc(
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '同一个标题' }],
    },
    paragraph('正文'),
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: '同一个标题' }],
    },
  );
  assert.deepEqual(
    articleHeadings(document).map((h) => h.id),
    ['section-1', 'section-2'],
  );
  assert.match(
    renderArticle(document, () => null),
    /<h3 id="section-2">/,
  );
});
test('malformed, oversized and deeply nested rich text is rejected', () => {
  assert.throws(() => validateArticleDocument(doc({ type: 'script', text: 'x' })));
  assert.throws(() => validateArticleDocument(doc({ type: 'heading', attrs: { level: 1 } })));
  assert.throws(() => validateArticleDocument(doc(paragraph('a'.repeat(1_000_001)))));
  assert.throws(() => validateArticleDocument(doc({ type: 'paragraph', content: [paragraph('nested')] })));
  let nested = paragraph('text');
  for (let i = 0; i < 25; i++) nested = { type: 'blockquote', content: [nested] };
  assert.throws(() => validateArticleDocument(doc(nested)));
});

test('tables, nested task state and rich marks survive validation and render safely', () => {
  const cell = (label: string, colspan = 1): ArticleNode => ({
    type: 'tableCell',
    attrs: { colspan, rowspan: 1 },
    content: [paragraph(label)],
  });
  const source = doc(
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('Merged <script>', 2)] },
        { type: 'tableRow', content: [cell('Rome'), cell('€100')] },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            paragraph('Passport'),
            {
              type: 'taskList',
              content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph('Insurance')] }],
            },
          ],
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'html' },
      content: [{ type: 'text', text: '<script>\n  literal code' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Emphasis',
          marks: [{ type: 'highlight' }, { type: 'strike' }, { type: 'underline' }, { type: 'code' }],
        },
      ],
    },
    { type: 'imagePlaceholder', attrs: { alt: 'Missing <photo>', src: 'https://private.example/image' } },
  );
  const clean = validateArticleDocument(source);
  assert.deepEqual(validateArticleDocument(clean), clean);
  const html = renderArticle(clean, () => null);
  for (const fragment of [
    'colspan="2"',
    'data-checked="true"',
    'data-checked="false"',
    '<mark>',
    '<s>',
    '<u>',
    '<code>',
    '&lt;script&gt;\n  literal code',
    '图片待补充',
  ])
    assert.ok(html.includes(fragment), fragment);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('private.example'));
  assert.ok(!html.includes('<input'));
});
test('invalid table spans, ragged rows and task states fail closed', () => {
  const cell = (colspan: number, rowspan = 1): ArticleNode => ({
    type: 'tableCell',
    attrs: { colspan, rowspan },
    content: [paragraph('x')],
  });
  const table = (...rows: ArticleNode[][]) =>
    doc({ type: 'table', content: rows.map((content) => ({ type: 'tableRow', content })) });
  for (const invalid of [
    table([cell(21)]),
    table([cell(1, 2)]),
    table([cell(2)], [cell(1)]),
    table([cell(1), cell(1, 2)], [cell(2)]),
  ])
    assert.throws(() => validateArticleDocument(invalid));
  assert.throws(() =>
    validateArticleDocument(
      doc({
        type: 'taskList',
        content: [{ type: 'taskItem', attrs: { checked: 'false' }, content: [paragraph('x')] }],
      }),
    ),
  );
  assert.throws(() =>
    validateArticleDocument(
      doc({ type: 'codeBlock', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] }),
    ),
  );
});
