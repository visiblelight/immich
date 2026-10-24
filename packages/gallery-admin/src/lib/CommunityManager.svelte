<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    MemberAvatar,
    SegmentedControl,
    SearchField,
    defaultCommunitySettings,
    type CommunitySettings,
  } from '@gallery/ui';
  import AdminSidebar from '$lib/AdminSidebar.svelte';
  import '$lib/design/admin.css';
  import { invalidateAll } from '$app/navigation';
  import type { GalleryUser } from '@gallery/core';
  import type { AdminCommunityData } from '$lib/community-types';
  let {
    data,
    active,
  }: {
    data: AdminCommunityData & { user: GalleryUser; publicOrigin: string; query: string; filter: string };
    active: string;
  } = $props();
  let filter = $state('pending'),
    query = $state(''),
    notice = $state(''),
    error = $state(''),
    busy = $state(false);
  let settings = $state(defaultCommunitySettings());
  const members = $derived(data.members),
    comments = $derived(data.comments);
  let replyDialog = $state<HTMLDialogElement>(null!),
    replyId = $state(''),
    replyText = $state('');
  $effect(() => {
    filter = data.filter;
    query = data.query;
    settings = { ...data.settings };
  });
  async function mutate(input: Record<string, unknown>, message: string) {
    if (busy) return false;
    busy = true;
    error = '';
    notice = '';
    try {
      const r = await fetch('/api/community', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.message);
      await invalidateAll();
      notice = message;
      return true;
    } catch (e) {
      error = (e as Error).message;
      return false;
    } finally {
      busy = false;
    }
  }
  function search(page = 1, status = filter) {
    const p = new URLSearchParams({ q: query, status, page: String(page) });
    void goto('/' + active + '?' + p);
  }
  const date = (d: string | Date) => new Date(d).toLocaleString('zh-CN');
  const options: { key: keyof CommunitySettings; title: string; help: string }[] = [
    { key: 'registration', title: '允许新用户注册', help: '关闭后隐藏注册入口，已有用户仍可登录。' },
    { key: 'comments', title: '允许发表评论', help: '关闭后暂停接收新评论，已有评论仍可阅读。' },
    { key: 'likes', title: '允许点赞', help: '关闭后不再新增点赞，用户仍可取消自己的点赞。' },
    {
      key: 'showComments',
      title: '展示评论',
      help: '关闭后隐藏评论和入口，同时停止接收新评论；历史数据保留。',
    },
    { key: 'showLikes', title: '展示点赞', help: '关闭后隐藏点赞和数量，同时停止新增点赞；历史数据保留。' },
  ];
  const statusText: Record<string, string> = { pending: '待审核', published: '已公开', hidden: '已隐藏' };
  const filteredComments = $derived(comments);
  function navigate(value: string) {
    void goto('/' + value);
  }
  function setStatus(id: string, status: string) {
    void mutate({ action: 'comment', id, status }, '评论状态已更新。');
  }
</script>

<svelte:head><title>用户与评论管理 · Gallery</title></svelte:head>
<div class="workspace live-workspace">
  <AdminSidebar {active} user={data.user} publicOrigin={data.publicOrigin} community onNavigate={navigate} />
  <main class="main community-admin">
    <div class="topline">
      <span
        >工作台 / {active === 'members' ? '用户管理' : active === 'comments' ? '评论管理' : '互动设置'}</span
      ><a href={data.publicOrigin} target="_blank" rel="noreferrer">打开前台 ↗</a>
    </div>
    {#if error}<p class="notice" role="alert">{error}</p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    {#if active === 'comments'}
      <h1>评论管理</h1>
      <p class="muted">查看访客留下的文字，审核、回复或隐藏评论。</p>
      <div class="toolbar">
        <SegmentedControl
          label="评论状态"
          value={filter}
          options={[
            { value: 'pending', label: `待审核 ${data.totals.pending}` },
            { value: 'published', label: '已公开' },
            { value: 'hidden', label: '已隐藏' },
            { value: 'all', label: '全部' },
          ]}
          onchange={(value) => search(1, value)}
        />
        <form
          class="community-search"
          onsubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div class="search-input">
            <SearchField label="搜索评论" placeholder="搜索用户或留言" bind:value={query} />
          </div>
          <button class="search-submit" disabled={busy}>搜索</button>
        </form>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>评论内容</th><th>状态</th><th>操作</th></tr></thead><tbody>
            {#each filteredComments as comment (comment.id)}{@const member = comment.member}<tr
                ><td class="message"
                  ><div class="author">
                    <MemberAvatar seed={member.avatar} size={30} /><strong>{member.name}</strong><small
                      >{date(comment.date)}</small
                    >
                  </div>
                  <div class="comment-target">
                    <span
                      >{{ album: '相册', photo: '照片', article: '文章' }[comment.kind]} · {comment.title ||
                        '未命名内容'}</span
                    >
                    {#if comment.targetPath}<a
                        href={`${data.publicOrigin.replace(/\/$/, '')}${comment.targetPath}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`查看前台：${comment.title || '未命名内容'}`}>查看前台 ↗</a
                      >
                    {:else}<span class="unavailable">内容当前未公开</span>{/if}
                    {#if comment.targetContext}<small>位于「{comment.targetContext}」</small>{/if}
                  </div>
                  <p>{comment.text}</p>
                  {#if comment.reply}<div class="reply">
                      <span>站长回复</span>
                      <p>{comment.reply}</p>
                    </div>{/if}</td
                ><td
                  ><span class="status" class:pending={comment.status === 'pending'}
                    >{statusText[comment.status]}</span
                  ></td
                ><td
                  ><div class="row-actions">
                    {#if comment.status === 'pending'}<button
                        onclick={() => setStatus(comment.id, 'published')}>通过</button
                      >{/if}{#if comment.status === 'hidden'}<button
                        onclick={() => setStatus(comment.id, 'published')}>恢复</button
                      >{:else}<button class="quiet" onclick={() => setStatus(comment.id, 'hidden')}
                        >隐藏</button
                      >{/if}{#if comment.status === 'published'}<button
                        class="quiet"
                        onclick={() => {
                          replyId = comment.id;
                          replyText = comment.reply;
                          replyDialog.showModal();
                        }}>回复</button
                      >{/if}
                  </div></td
                ></tr
              >{/each}
            {#if !filteredComments.length}<tr><td colspan="3" class="empty">没有符合条件的评论。</td></tr
              >{/if}
          </tbody>
        </table>
      </div>
    {:else if active === 'members'}
      <h1>用户管理</h1>
      <p class="muted">{data.totals.members} 位访客 · 邮箱仅在管理后台展示。</p>
      <div class="toolbar">
        <form
          class="community-search"
          onsubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div class="search-input">
            <SearchField label="搜索用户" placeholder="搜索名称或邮箱" bind:value={query} />
          </div>
          <button class="search-submit" disabled={busy}>搜索</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="member-table">
          <thead
            ><tr><th>用户</th><th>邮箱</th><th>注册时间</th><th>互动</th><th>状态</th><th>操作</th></tr
            ></thead
          ><tbody
            >{#each members as member (member.id)}<tr
                ><td
                  ><div class="author member-identity">
                    <MemberAvatar seed={member.avatar} /><strong>{member.name}</strong>
                  </div></td
                ><td>{member.email}</td><td>{date(member.date)}</td><td
                  >{member.comments} 条评论 · {member.likes} 个赞</td
                ><td>{member.disabled ? '已停用' : '正常'}</td><td
                  ><div class="row-actions">
                    <button
                      class="quiet"
                      disabled={busy}
                      onclick={() =>
                        mutate(
                          { action: 'member', id: member.id, disabled: !member.disabled },
                          member.disabled ? '账号已恢复。' : '账号已停用并退出所有设备。',
                        )}>{member.disabled ? '恢复' : '停用'}</button
                    ><button
                      class="quiet"
                      disabled={busy}
                      onclick={() =>
                        mutate({ action: 'member', id: member.id, revoke: true }, '已退出该用户的所有设备。')}
                      >退出所有设备</button
                    >
                  </div></td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
    {:else}
      <h1>互动设置</h1>
      <p class="muted">分别管理参与和展示。关闭功能不会删除已有用户、评论或点赞。</p>
      <form
        class="settings"
        onsubmit={(e) => {
          e.preventDefault();
          void mutate({ action: 'settings', settings }, '互动设置已保存。');
        }}
      >
        {#each options as option}<label class="setting"
            ><span><strong>{option.title}</strong><small>{option.help}</small></span><input
              type="checkbox"
              bind:checked={settings[option.key]}
              role="switch"
            /></label
          >{/each}
        <div class="settings-actions">
          <button class="primary" disabled={busy}>保存设置</button>
        </div>
      </form>
    {/if}
    {#if active !== 'community-settings' && data.totals[active === 'members' ? 'members' : 'comments'] > 50}<nav
        class="settings-actions"
        aria-label="分页"
      >
        <button disabled={data.page === 1} onclick={() => search(data.page - 1)}>上一页</button><span
          >{data.page} / {Math.ceil(data.totals[active === 'members' ? 'members' : 'comments'] / 50)}</span
        ><button
          disabled={data.page * 50 >= data.totals[active === 'members' ? 'members' : 'comments']}
          onclick={() => search(data.page + 1)}>下一页</button
        >
      </nav>{/if}
  </main>
</div>
<dialog bind:this={replyDialog} aria-labelledby="reply-title">
  <form
    onsubmit={async (e) => {
      e.preventDefault();
      if (await mutate({ action: 'comment', id: replyId, reply: replyText.trim() }, '站长回复已保存。'))
        replyDialog.close();
    }}
  >
    <h2 id="reply-title">回复评论</h2>
    <label>回复内容<textarea bind:value={replyText} rows="5" maxlength="1000"></textarea></label>
    <div class="settings-actions">
      <button class="primary" disabled={busy}>保存回复</button><button
        type="button"
        onclick={() => replyDialog.close()}>取消</button
      >
    </div>
  </form>
</dialog>

<style>
  .community-admin {
    min-width: 0;
  }
  .muted {
    color: #7b847f;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 28px 0 20px;
    flex-wrap: wrap;
  }
  .community-search {
    width: min(360px, 100%);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .search-input {
    flex: 1;
    min-width: 0;
  }
  .search-submit {
    flex: none;
    height: 38px;
    padding: 0 16px;
    font-size: 13px;
    white-space: nowrap;
  }
  .table-wrap {
    overflow: auto;
    border: 1px solid #e5e9e4;
    border-radius: 7px;
    background: white;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 760px;
    text-align: left;
    font-size: 13px;
  }
  th {
    font-size: 12px;
    color: #7b847f;
    font-weight: 400;
    background: #f7f8f5;
  }
  td,
  th {
    padding: 18px 20px;
    border-bottom: 1px solid #e5e9e4;
    vertical-align: top;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  .member-table td {
    vertical-align: middle;
  }
  .member-table .member-identity {
    flex-wrap: nowrap;
    min-width: 120px;
  }
  .member-identity strong {
    overflow-wrap: anywhere;
  }
  .message {
    width: 65%;
    min-width: 280px;
  }
  .message p {
    margin: 12px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .author {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  strong {
    font-weight: 550;
  }
  small {
    font-size: 11px;
    color: #7b847f;
  }
  .comment-target {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: baseline;
    margin-top: 12px;
    font-size: 12px;
    color: #65755e;
    overflow-wrap: anywhere;
  }
  .comment-target a {
    color: #36593e;
    white-space: nowrap;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .comment-target .unavailable {
    color: #7b847f;
  }
  .row-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row-actions button {
    font-size: 12px;
    padding: 6px 10px;
    white-space: nowrap;
  }
  .row-actions .quiet {
    background: none;
    border: 0;
    padding: 7px 2px;
    color: #65755e;
  }
  .status {
    white-space: nowrap;
    color: #7b847f;
    font-size: 12px;
  }
  .status.pending {
    color: #9a7949;
  }
  .reply {
    border-left: 2px solid #dce2d6;
    padding-left: 12px;
    margin-top: 16px;
  }
  .reply span {
    font-size: 11px;
    color: #7b847f;
  }
  .reply p {
    margin: 3px 0 0;
    font-size: 12px;
  }
  .empty {
    text-align: center;
    color: #7b847f;
    padding: 50px;
  }
  .settings {
    max-width: 820px;
    margin: 30px 0;
  }
  .setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 30px;
    padding: 23px 0;
    border-bottom: 1px solid #e5e9e4;
  }
  .setting strong {
    display: block;
    font-size: 14px;
  }
  .setting small {
    display: block;
    font-size: 12px;
    margin-top: 6px;
    line-height: 1.7;
  }
  .setting input {
    width: 36px;
    height: 20px;
    flex: none;
    accent-color: #36593e;
  }
  .settings-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 26px;
  }
  .primary {
    background: #36593e;
    color: white;
    border-color: #36593e;
  }
  .notice {
    background: #e7efdf;
    padding: 12px 16px;
    border-radius: 5px;
    font-size: 13px;
  }
  dialog {
    width: min(480px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 30px;
    border: 1px solid #dce2d6;
    border-radius: 8px;
    background: #fafbf9;
  }
  dialog::backdrop {
    background: #1d302c66;
  }
  dialog label {
    font-size: 13px;
  }
  dialog textarea {
    margin-top: 8px;
  }
</style>
