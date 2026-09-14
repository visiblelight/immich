/** Browser-only clipboard normalization. Never fetch URLs from pasted HTML. */
export function normalizeArticlePaste(html: string): { html: string; message: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const notices: string[] = [];
  let images = 0;
  for (const img of doc.querySelectorAll('img')) {
    if (img.closest('figure[data-gallery-kind][data-gallery-ref]')) continue;
    const placeholder = doc.createElement('div');
    placeholder.dataset.articleImagePlaceholder = '';
    placeholder.dataset.alt = (img.getAttribute('alt') || '原文配图').slice(0, 200);
    placeholder.textContent = '图片待补充：' + placeholder.dataset.alt;
    img.replaceWith(placeholder);
    images++;
  }
  if (images) notices.push(`${images} 张图片已保留为占位。点选占位后使用“图片”选片或上传替换。`);
  if (doc.querySelector('h1,h4,h5,h6')) {
    for (const heading of doc.querySelectorAll('h1,h4,h5,h6')) {
      const replacement = doc.createElement(heading.tagName === 'H1' ? 'h2' : 'h3');
      replacement.append(...heading.childNodes);
      heading.replaceWith(replacement);
    }
    notices.push('正文标题已统一为 H2/H3；文章主标题请在标题栏填写。');
  }
  const supported = new Set(
    'html body head meta style p div span br h2 h3 strong b em i u s del strike mark code pre blockquote hr ul ol li label input table thead tbody tfoot tr th td colgroup col a figure figcaption img'.split(
      ' ',
    ),
  );
  if ([...doc.body.querySelectorAll('*')].some((el) => !supported.has(el.tagName.toLowerCase())))
    notices.push('部分嵌入内容不受支持，请检查粘贴结果。');
  if (doc.querySelector('font,[style*="text-align"],[style*="color"],[style*="font-size"]'))
    notices.push('文字已采用 Gallery 的统一字号、配色和对齐方式。');
  for (const unsafe of doc.querySelectorAll('script,style,iframe,object,embed,video,audio')) unsafe.remove();
  return { html: doc.body.innerHTML, message: notices.join(' ') };
}
