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
  let active = $state('comments');
  let filter = $state('pending');
  let query = $state('');
  let notice = $state('');
  let settings = $state(defaultCommunitySettings());
  let members = $state([
    {
      id: 'visitor1',
      name: '山间来信',
      email: 'mountain@example.invalid',
      avatar: 'gallery-mountain-1',
      date: '2026.10.24',
      comments: 1,
      likes: 4,
      disabled: false,
    },
    {
      id: 'visitor2',
      name: '路过的风',
      email: 'wind@example.invalid',
      avatar: 'visitor-wind-93',
      date: '2026.10.20',
      comments: 3,
      likes: 12,
      disabled: false,
    },
    {
      id: 'visitor3',
      name: '小林',
      email: 'lin@example.invalid',
      avatar: 'visitor-lin-628',
      date: '2026.10.18',
      comments: 2,
      likes: 7,
      disabled: false,
    },
  ]);
  let comments = $state([
    {
      id: 'comment1',
      user: 'visitor1',
      text: '喜欢山谷里的这层薄雾，很安静的一张照片。',
      type: '照片',
      title: '山的另一边',
      image: 'mountains',
      date: '2026.10.24 15:30',
      status: 'pending',
      reply: '',
    },
    {
      id: 'comment2',
      user: 'visitor2',
      text: '喜欢这样的光线，像是又回到了那个安静的下午。',
      type: '相册',
      title: '格鲁吉亚 · 山路与旧城',
      image: 'tbilisi',
      date: '2026.10.22 10:21',
      status: 'published',
      reply: '谢谢你，也希望这些照片能留住一点当时的感觉。',
    },
    {
      id: 'comment3',
      user: 'visitor3',
      text: '读完说明再看照片，多了一层旅途中的感受。',
      type: '文章',
      title: '从第比利斯出发，沿着山路向北',
      image: 'street',
      date: '2026.10.20 09:12',
      status: 'published',
      reply: '',
    },
  ]);
  let replyDialog: HTMLDialogElement;
  let replyId = $state('');
  let replyText = $state('');
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
  const filteredComments = $derived(
    comments.filter(
      (c) =>
        (filter === 'all' || c.status === filter) &&
        `${c.text} ${c.title} ${members.find((m) => m.id === c.user)?.name}`.includes(query.trim()),
    ),
  );
  function navigate(value: string) {
    notice = '';
    query = '';
    if (['members', 'comments', 'community-settings'].includes(value)) {
      active = value;
      window.scrollTo({ top: 0 });
    } else void goto('/' + value);
  }
  function setStatus(id: string, value: string) {
    comments = comments.map((c) => (c.id === id ? { ...c, status: value } : c));
    notice = '评论状态已更新（样稿）。';
  }
</script>

<svelte:head><title>用户与评论管理样稿 · Gallery</title></svelte:head>
<div class="workspace live-workspace">
  <AdminSidebar
    {active}
    user={{ id: 'demo-admin', email: 'admin@example.invalid', displayName: 'Vision' }}
    publicOrigin="http://127.0.0.1:3100"
    community
    onNavigate={navigate}
  />
  <main class="main community-admin">
    <div class="topline">
      <span
        >工作台 / {active === 'members' ? '用户管理' : active === 'comments' ? '评论管理' : '互动设置'}</span
      ><a href="http://127.0.0.1:3100/design/community" target="_blank" rel="noreferrer">前台样稿 ↗</a>
    </div>
    <div class="sample-note">交互样稿 · 使用虚构账号和评论，所有修改仅在当前页面演示。</div>
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    {#if active === 'comments'}
      <h1>评论管理</h1>
      <p class="muted">查看访客留下的文字，审核、回复或隐藏评论。</p>
      <div class="toolbar">
        <SegmentedControl
          label="评论状态"
          value={filter}
          options={[
            { value: 'pending', label: `待审核 ${comments.filter((c) => c.status === 'pending').length}` },
            { value: 'published', label: '已公开' },
            { value: 'hidden', label: '已隐藏' },
            { value: 'all', label: '全部' },
          ]}
          onchange={(value) => (filter = value)}
        />
        <div class="search">
          <SearchField label="搜索评论" placeholder="搜索用户、内容或留言" bind:value={query} />
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>评论内容</th><th>所属内容</th><th>状态</th><th>操作</th></tr></thead><tbody>
            {#each filteredComments as comment (comment.id)}{@const member = members.find(
                (m) => m.id === comment.user,
              )!}<tr
                ><td class="message"
                  ><div class="author">
                    <MemberAvatar seed={member.avatar} size={30} /><strong>{member.name}</strong><small
                      >{comment.date}</small
                    >
                  </div>
                  <p>{comment.text}</p>
                  {#if comment.reply}<div class="reply">
                      <span>站长回复</span>
                      <p>{comment.reply}</p>
                    </div>{/if}</td
                ><td
                  ><div class="target">
                    <img src={`http://127.0.0.1:3100/design-assets/${comment.image}-small.jpg`} alt="" />
                    <div>
                      <small>{comment.type}</small><a
                        href={`http://127.0.0.1:3100/design/community?view=${comment.type === '文章' ? 'article' : 'album'}`}
                        target="_blank"
                        rel="noreferrer">{comment.title}</a
                      >
                    </div>
                  </div></td
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
            {#if !filteredComments.length}<tr><td colspan="4" class="empty">没有符合条件的评论。</td></tr
              >{/if}
          </tbody>
        </table>
      </div>
    {:else if active === 'members'}
      <h1>用户管理</h1>
      <p class="muted">{members.length} 位访客 · 邮箱仅在管理后台展示。</p>
      <div class="toolbar">
        <div class="search">
          <SearchField label="搜索用户" placeholder="搜索名称或邮箱" bind:value={query} />
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead
            ><tr><th>用户</th><th>邮箱</th><th>注册时间</th><th>互动</th><th>状态</th><th>操作</th></tr
            ></thead
          ><tbody
            >{#each members.filter( (m) => `${m.name} ${m.email}`.includes(query.trim()) ) as member (member.id)}<tr
                ><td
                  ><div class="author">
                    <MemberAvatar seed={member.avatar} /><strong>{member.name}</strong>
                  </div></td
                ><td>{member.email}</td><td>{member.date}</td><td
                  >{member.comments} 条评论 · {member.likes} 个赞</td
                ><td>{member.disabled ? '已停用' : '正常'}</td><td
                  ><div class="row-actions">
                    <button
                      class="quiet"
                      onclick={() => {
                        member.disabled = !member.disabled;
                        notice = member.disabled
                          ? '账号已停用（样稿），已撤销登录。'
                          : '账号已恢复（样稿）。';
                      }}>{member.disabled ? '恢复' : '停用'}</button
                    ><button class="quiet" onclick={() => (notice = '已撤销该用户的登录会话（样稿）。')}
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
          notice = '互动设置已保存（样稿，不影响真实网站）。';
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
          <button class="primary">保存设置</button><button
            type="button"
            onclick={() => {
              settings.comments = false;
              settings.likes = false;
              notice = '已暂停新增评论和点赞（样稿）。';
            }}>暂停新增互动</button
          >
        </div>
      </form>
    {/if}
  </main>
</div>
<dialog bind:this={replyDialog} aria-labelledby="reply-title">
  <form
    onsubmit={(e) => {
      e.preventDefault();
      comments = comments.map((c) => (c.id === replyId ? { ...c, reply: replyText.trim() } : c));
      replyDialog.close();
      notice = '站长回复已保存（样稿）。';
    }}
  >
    <h2 id="reply-title">回复评论</h2>
    <label>回复内容<textarea bind:value={replyText} rows="5" maxlength="1000" required></textarea></label>
    <div class="settings-actions">
      <button class="primary">保存回复</button><button type="button" onclick={() => replyDialog.close()}
        >取消</button
      >
    </div>
  </form>
</dialog>

<style>
  .community-admin {
    min-width: 0;
  }
  .sample-note {
    font-size: 12px;
    color: #7b847f;
    background: #edf1e9;
    padding: 10px 14px;
    border-radius: 5px;
    margin: 24px 0;
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
  .search {
    width: min(320px, 100%);
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
  .message {
    width: 45%;
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
  .target {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 170px;
  }
  .target img {
    width: 62px;
    height: 48px;
    object-fit: cover;
    border-radius: 3px;
  }
  .target a {
    display: block;
    font-size: 12px;
    text-decoration: none;
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
