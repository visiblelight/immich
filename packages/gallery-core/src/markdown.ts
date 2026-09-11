import { Marked } from 'marked';
import type { TextBlock } from './content.ts';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Parse Markdown normally but never accept author-supplied HTML, images or URL schemes.
const markdown = new Marked({
  async: false,
  gfm: true,
  renderer: {
    html: ({ text }) => escape(text),
    image: ({ text }) => escape(text),
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      try {
        const url = new URL(href);
        if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password) return label;
        return `<a href="${escape(url.href)}" rel="noreferrer noopener">${label}</a>`;
      } catch {
        return label;
      }
    },
  },
});
export const renderMarkdown = (text: string) => markdown.parse(text, { async: false });
export const literalMarkdown = (text: string) => text.replace(/([\\`*_{}\[\]()#+.!<>|~\-])/g, '\\$1');
export function blocksMarkdown(blocks: TextBlock[] = []) {
  return blocks
    .map((b) =>
      b.kind === 'heading'
        ? `## ${literalMarkdown(b.text)}`
        : b.kind === 'quote'
          ? literalMarkdown(b.text)
              .split('\n')
              .map((l) => '> ' + l)
              .join('\n')
          : literalMarkdown(b.text),
    )
    .join('\n\n');
}
export function documentMarkdown(doc: { markdown?: string; blocks?: TextBlock[] }, summary = '') {
  if (typeof doc.markdown === 'string') return doc.markdown;
  return [literalMarkdown(summary), blocksMarkdown(doc.blocks)].filter(Boolean).join('\n\n');
}
export function markdownSummary(text: string, limit = 180) {
  return renderMarkdown(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (s) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[s]!,
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}
