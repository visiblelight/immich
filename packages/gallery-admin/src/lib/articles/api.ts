export async function articleRequest(action: string, input?: unknown) {
  const response = await fetch('/api/' + action, {
    method: input === undefined ? 'GET' : 'POST',
    ...(input === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('服务暂不可用，请保留当前内容后重试。');
  }
  if (!response.ok) {
    const error = new Error(body.message ?? '操作未完成。') as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return body;
}
