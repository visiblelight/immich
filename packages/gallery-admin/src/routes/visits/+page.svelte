<script lang="ts">
  import Frame from '$lib/MapAdminFrame.svelte';
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();
  type RecordItem = (typeof data.visits.records)[number];
  let selected = $state<string[]>([]),
    editing = $state(false),
    id = $state<string | null>(null),
    version = $state(0),
    replace = $state<{ id: string; version: number }[]>([]),
    photoIds = $state<string[]>([]),
    start = $state(''),
    end = $state(''),
    label = $state(''),
    photoPage = $state(1),
    message = $state(''),
    busy = $state(false),
    failed = $state(false);
  function focusDialog(node: HTMLElement) {
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
        ),
      ];
      const first = list[0],
        last = list.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    node.addEventListener('keydown', trap);
    return {
      destroy() {
        document.body.style.overflow = overflow;
        prior?.focus();
      },
    };
  }
  function open(records: RecordItem[]) {
    id = records.length === 1 && records[0]!.manual ? records[0]!.id : null;
    version = records[0]?.version ?? 0;
    replace = id ? [] : records.filter((v) => v.manual).map((v) => ({ id: v.id, version: v.version }));
    photoIds = [...new Set(records.flatMap((v) => v.photoIds))];
    const dates = records
      .flatMap((v) => [v.start, v.end])
      .filter((d): d is string => !!d)
      .sort();
    start = dates[0] ?? '';
    end = dates.at(-1) ?? '';
    label = records.length === 1 ? records[0]!.label : '';
    photoPage = 1;
    editing = true;
    message = '';
  }
  async function post(action: string, payload: unknown) {
    const response = await fetch(`/api/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    return result;
  }
  async function save() {
    busy = true;
    try {
      await post('visit-save', { country: data.country, id, version, replace, photoIds, start, end, label });
      editing = false;
      selected = [];
      await invalidateAll();
      message = '到访记录已应用到前台。';
      failed = false;
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '保存失败。';
    } finally {
      busy = false;
    }
  }
  async function reset(record: { id: string; version: number }) {
    busy = true;
    try {
      await post('visit-delete', record);
      selected = [];
      await invalidateAll();
      message = '已移除人工校正，按照当前公开照片重新整理。';
      failed = false;
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '操作失败。';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>到访记录 · Gallery 管理</title></svelte:head><Frame
  ><div class="map-admin">
    <h1>到访记录</h1>
    <p>自动汇总公开照片的位置和当地拍摄日期。人工整理可以修改日期、合并记录，或选出部分照片另建一次到访。</p>
    <div class="toolbar">
      <label
        >国家 <select
          value={data.country}
          onchange={(e) => (location.href = `/visits?country=${e.currentTarget.value}`)}
          ><option value="">请选择国家</option>{#each data.visits.countries as c}<option value={c.id}
              >{c.name} · {c.count} 张</option
            >{/each}</select
        ></label
      >{#if data.country}<a href={`${data.publicOrigin}/visited/${data.country}`} target="_blank" rel="noreferrer"
          >查看前台 →</a
        >{/if}
    </div>
    {#if message && !editing}<p class="notice" class:error={failed} role="status">{message}</p>{/if}
    {#if data.visits.unassigned}<p>
        {data.visits.unassigned} 张公开位置照片未能可靠归属国家。请在 Immich 核对 GPS；跨国界的近似位置不会强行归国。
      </p>{/if}
    {#if selected.length > 1}<button onclick={() => open(data.visits.records.filter((v) => selected.includes(v.id)))}
        >合并选中的 {selected.length} 段记录</button
      >{/if}
    <div class="records">
      {#each data.visits.records as v}<article>
          <label
            ><input type="checkbox" bind:group={selected} value={v.id} /><strong
              >{v.label || (v.start ? `${v.start} — ${v.end}` : '拍摄日期待确认')}</strong
            ></label
          >
          <p>
            {v.count} 张照片 · {v.manual ? '人工整理' : '自动推导'}
            {v.needsReview ? '· 有照片失效或位置变化，需要重新核对' : ''}
          </p>
          <div class="thumbs">
            {#each v.photoIds.slice(0, 6) as photoId}{@const photo = data.visits.photos.find(
                (p) => p.id === photoId,
              )}{#if photo}<img
                  src={`${data.publicOrigin}${photo.thumbnail}`}
                  alt="到访照片"
                  loading="lazy"
                />{/if}{/each}
          </div>
          <div class="actions">
            <button onclick={() => open([v])}>编辑 / 拆分</button>{#if v.manual}<button
                disabled={busy}
                onclick={() => void reset(v)}>恢复自动整理</button
              >{/if}
          </div>
        </article>{/each}
    </div>
    {#each data.visits.stale.filter((v) => !data.visits.records.some((r) => r.id === v.id)) as v}<p class="notice">
        一条人工记录已经没有有效公开照片，当前不会在前台显示。<button disabled={busy} onclick={() => void reset(v)}
          >移除失效校正</button
        >
      </p>{/each}
    {#if data.country && !data.visits.records.length}<p>这个国家暂无有效公开记录。</p>{/if}
    {#if editing}<div class="shade">
        <div
          use:focusDialog
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-title"
          tabindex="-1"
          onkeydown={(e) => {
            if (e.key === 'Escape' && !busy) editing = false;
          }}
        >
          <h2 id="edit-title">{id ? '编辑到访' : '整理到访'}</h2>
          <p>所选照片组成一段到访。取消选中的照片将恢复自动推导；不会修改 Immich 的照片信息。</p>
          {#if message}<p class="notice" class:error={failed} role="status">{message}</p>{/if}
          <form
            onsubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label class="field"
              >名称（可选）<input bind:value={label} maxlength="120" placeholder="例如：格鲁吉亚秋日旅行" /></label
            >
            <div class="dates">
              <label class="field">开始日期<input type="date" bind:value={start} /></label><label class="field"
                >结束日期<input type="date" bind:value={end} /></label
              >
            </div>
            <p>日期留空表示尚未确认。已选择 {photoIds.length} 张照片。</p>
            <div class="picker">
              {#each data.visits.photos.slice((photoPage - 1) * 36, photoPage * 36) as photo}<label
                  class:checked={photoIds.includes(photo.id)}
                  ><img src={`${data.publicOrigin}${photo.thumbnail}`} alt="到访照片" loading="lazy" /><span
                    ><input type="checkbox" bind:group={photoIds} value={photo.id} />{photo.date ?? '时间未知'}</span
                  ></label
                >{/each}
            </div>
            {#if data.visits.photos.length > 36}<div class="actions">
                <button type="button" disabled={photoPage === 1} onclick={() => photoPage--}>上一页</button><span
                  >{photoPage} / {Math.ceil(data.visits.photos.length / 36)}</span
                ><button
                  type="button"
                  disabled={photoPage * 36 >= data.visits.photos.length}
                  onclick={() => photoPage++}>下一页</button
                >
              </div>{/if}
            <div class="actions">
              <button disabled={busy || !photoIds.length}>{busy ? '保存中…' : '保存并应用'}</button><button
                type="button"
                disabled={busy}
                onclick={() => (editing = false)}>取消</button
              >
            </div>
          </form>
        </div>
      </div>{/if}
  </div></Frame
>

<style>
  .toolbar {
    display: flex;
    gap: 25px;
    align-items: center;
    margin: 25px 0;
  }
  .toolbar a {
    color: #36593e;
    font-size: 13px;
  }
  .records {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    margin: 24px 0;
  }
  article {
    background: #fff;
    padding: 22px;
    border: 1px solid #dde4d8;
    border-radius: 6px;
  }
  article strong {
    font-weight: 550;
    margin-left: 8px;
  }
  .thumbs {
    display: flex;
    gap: 5px;
    overflow: hidden;
    margin: 18px 0;
  }
  .thumbs img {
    width: 52px;
    height: 52px;
    object-fit: cover;
    border-radius: 3px;
  }
  .actions {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-top: 20px;
  }
  .actions span {
    font-size: 12px;
  }
  .shade {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: #15271570;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }
  .dialog {
    background: #fff;
    max-width: 750px;
    width: 100%;
    max-height: 85dvh;
    overflow: auto;
    border-radius: 8px;
    padding: 28px;
    box-sizing: border-box;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 15px 0;
  }
  .dates {
    display: flex;
    gap: 20px;
  }
  .picker {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .picker label {
    border: 2px solid transparent;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
  }
  .picker label.checked {
    border-color: #547849;
    background: #f0f5e9;
  }
  .picker img {
    width: 100%;
    aspect-ratio: 1.2;
    object-fit: cover;
    display: block;
  }
  .picker span {
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 5px;
  }
  @media (max-width: 700px) {
    .records {
      grid-template-columns: 1fr;
    }
    .dialog {
      padding: 18px;
    }
    .picker {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .dates {
      gap: 10px;
    }
    .dates label {
      min-width: 0;
    }
    .shade {
      padding: 10px;
    }
  }
</style>
