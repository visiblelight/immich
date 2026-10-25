import assert from 'node:assert/strict';
import test from 'node:test';
import { articleDraftSnapshot, articleFailure } from '../src/lib/articles/draft.ts';
import { validateArticleDocument, type ArticleContent, type ArticleNode } from '@gallery/core';

test('reopened table attributes with reactive column widths can be saved without losing content', () => {
  const widths = new Proxy([99, 125], {});
  const attrs = Object.assign(Object.create(null), { colspan: 2, rowspan: 1, colwidth: widths });
  const image: ArticleNode = {
    type: 'galleryImage',
    attrs: { kind: 'photo', ref: 'photo-1', album: 'album-1' },
    content: [{ type: 'text', text: '图注' }],
  };
  const article: ArticleContent = {
    title: '游记', summary: '摘要', date: '2026-10-25', listed: true,
    cover: image, albums: new Proxy(['album-1'], {}),
    document: { schemaVersion: 1, doc: { type: 'doc', content: [
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '行程' }] }],
      }] }] },
      { type: 'galleryImageGroup', attrs: { kind: 'temporary', caption: '合照' }, content: [image, { ...image, attrs: { ...image.attrs, ref: 'photo-2' } }] },
    ] } },
  };
  assert.throws(() => structuredClone(attrs), { name: 'DataCloneError' });
  const snapshot = articleDraftSnapshot(new Proxy(article, {}));
  assert.doesNotThrow(() => structuredClone(snapshot));
  assert.doesNotThrow(() => validateArticleDocument(snapshot.document));
  assert.deepEqual(snapshot, JSON.parse(JSON.stringify(article)));
  widths[0] = 150;
  article.albums.push('album-2');
  image.content![0]!.text = '后续编辑';
  assert.deepEqual(snapshot.document.doc.content![0]!.content![0]!.content![0]!.attrs!.colwidth, [99, 125]);
  assert.deepEqual(snapshot.albums, ['album-1']);
  assert.equal(snapshot.cover?.content?.[0]?.text, '图注');
});

test('draft snapshot excludes article identity and publication metadata', () => {
  const article = {
    title: '', summary: '', date: '', cover: null, listed: false, albums: [],
    document: { schemaVersion: 1 as const, doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
    id: 'article-1', version: '3', status: 'published', publishedAt: '2026-10-24',
  };
  assert.deepEqual(Object.keys(articleDraftSnapshot(article)).sort(), ['albums', 'cover', 'date', 'document', 'listed', 'summary', 'title']);
});

test('save errors explain clone and connection failures while retaining diagnostic details', () => {
  const clone = new DOMException('object could not be cloned', 'DataCloneError');
  assert.match(articleFailure(clone, '保存').message, /保存失败.*不要刷新/);
  assert.equal(articleFailure(clone, '保存').detail, clone.message);
  assert.match(articleFailure(new TypeError('Failed to fetch'), '保存').message, /检查网络后重试/);
  assert.equal(articleFailure(new Error('表格列宽无效'), '保存').message, '保存失败：表格列宽无效');
  assert.match(articleFailure(new Error('unexpected internal error'), '发布').message, /发布失败.*程序错误/);
});
