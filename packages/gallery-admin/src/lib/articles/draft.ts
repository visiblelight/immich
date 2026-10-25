import type { ArticleContent } from '@gallery/core';

/** Capture exactly the JSON payload sent to the API, detached from live editor state. */
export function articleDraftSnapshot(article: ArticleContent): ArticleContent {
  const { title, summary, date, document, cover, listed, albums } = article;
  // ProseMirror attributes can have a null prototype and retain reactive colwidth arrays.
  // $state.snapshot does not unwrap those arrays; structuredClone then rejects the proxy.
  return JSON.parse(JSON.stringify({ title, summary, date, document, cover, listed, albums }));
}

export function articleFailure(error: unknown, action: string) {
  const detail = error instanceof Error ? error.message : String(error);
  let reason: string;
  if (error instanceof Error && (error.name === 'DataCloneError' || /structuredClone|could not be cloned/.test(detail)))
    reason = '浏览器未能整理文章数据。请保留当前页面，不要刷新或关闭。';
  else if (error instanceof TypeError && /fetch|network|load failed/i.test(detail))
    reason = '未能连接服务器，请检查网络后重试。';
  else if (/[\u3400-\u9fff]/.test(detail)) reason = detail;
  else reason = '发生了程序错误，请保留当前页面后重试；如仍失败，请提供错误详情。';
  return { message: `${action}失败：${reason}`, detail };
}
