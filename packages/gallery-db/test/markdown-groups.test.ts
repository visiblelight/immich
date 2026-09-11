import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { renderMarkdown, documentMarkdown, literalMarkdown, emptyAlbum, validateContent } from '@gallery/core';

test('Markdown supports writing while rejecting active HTML, embedded media and unsafe links', () => {
  const html = renderMarkdown('## Journey\n\n**Church** and [guide](https://example.com)\n\n> memory\n\n- one\n- two');
  assert.match(html, /<h2>Journey/);
  assert.match(html, /<strong>Church/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<ul>/);
  for (const input of [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '![private](https://example.com/private.jpg)',
    '[bad](javascript:alert(1))',
    '[bad](jav&#x61;script:alert(1))',
    '[bad](data:text/html,bad)',
  ]) {
    const output = renderMarkdown(input);
    assert.doesNotMatch(output, /<(?:img|script|iframe)\b|href="(?:javascript|data):/i);
  }
  assert.doesNotMatch(renderMarkdown(literalMarkdown('**literal** <tag>')), /<strong>|<tag>/);
  assert.match(
    documentMarkdown(
      {
        blocks: [
          { kind: 'heading', text: 'Old heading' },
          { kind: 'paragraph', text: 'Old body' },
        ],
      },
      'Old intro',
    ),
    /Old intro[\s\S]*## Old heading[\s\S]*Old body/,
  );
});
test('Group membership, cover, order and retained individual text are validated', () => {
  const c = emptyAlbum('Album', 'album'),
    g = randomUUID();
  c.photos = Array.from({ length: 3 }, () => ({
    id: randomUUID(),
    asset: randomUUID(),
    title: '',
    description: 'own words',
    alt: '',
    location: 'inherit' as const,
  }));
  c.photos[0]!.group = g;
  c.photos[2]!.group = g;
  c.groups = [{ id: g, title: 'Church', description: 'Shared story', cover: c.photos[2]!.id }];
  const valid = validateContent(c);
  assert.equal(valid.photos[1]!.id, c.photos[2]!.id);
  assert.equal(valid.photos[0]!.description, 'own words');
  assert.throws(() => validateContent({ ...c, groups: [{ ...c.groups![0], cover: c.photos[1]!.id }] }));
  assert.throws(() => validateContent({ ...c, groups: [] }));
  assert.throws(() => validateContent({ ...c, photos: [c.photos[0]] }));
});
