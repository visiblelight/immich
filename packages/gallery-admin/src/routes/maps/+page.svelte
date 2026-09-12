<script lang="ts">
  import { untrack } from 'svelte';
  import Frame from '$lib/MapAdminFrame.svelte';
  let { data } = $props();
  let settings = $state(untrack(() => structuredClone(data.settings)));
  let providers = $state(
    untrack(() => settings.providers.map((p) => ({ ...p, securityCode: '', clearSecret: false }))),
  );
  let message = $state(''),
    busy = $state(false),
    failed = $state(false);
  const names = { osm: 'OpenStreetMap', google: 'Google Maps', amap: '高德地图' };
  async function save() {
    busy = true;
    message = '';
    try {
      const response = await fetch('/api/map-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...settings, providers }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      const fresh = await fetch('/api/map-settings');
      if (!fresh.ok) throw new Error('已保存，请重新载入查看最新状态。');
      settings = await fresh.json();
      providers = settings.providers.map((p) => ({ ...p, securityCode: '', clearSecret: false }));
      failed = false;
      message = '地图设置已应用。请打开前台验证服务 Key 与网络是否可用。';
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '保存失败。';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>地图设置 · Gallery 管理</title></svelte:head><Frame
  ><div class="map-admin">
    <h1>地图设置</h1>
    <p>启用的底图会出现在前台，访客可自行切换。浏览器 Key 需在服务商控制台限制为前台域名和对应地图 API。</p>
    <a href={`${data.publicOrigin}/visited`} target="_blank" rel="noreferrer">打开前台足迹 →</a>
    {#if message}<p class="notice" class:error={failed} role="status">{message}</p>{/if}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section>
        <h2>到访推导</h2>
        <label
          >同一国家照片相隔超过 <input type="number" min="1" max="365" bind:value={settings.gapDays} required /> 天，整理为新的到访</label
        >
        <p>期间出现其他国家的可靠拍摄记录也会拆分。人工整理的记录保留。</p>
      </section>
      {#each providers as p}<section>
          <div class="title">
            <h2>{names[p.provider]}</h2>
            <label><input type="checkbox" bind:checked={p.enabled} disabled={busy} /> 启用</label><label
              ><input
                type="radio"
                name="default"
                checked={p.isDefault}
                disabled={!p.enabled || busy}
                onchange={() =>
                  (providers = providers.map((item) => ({ ...item, isDefault: item.provider === p.provider })))}
              /> 默认</label
            >
          </div>
          {#if p.provider === 'osm'}<label class="field">瓦片地址<input bind:value={p.tileUrl} required /></label><label
              class="field">底图署名<input bind:value={p.attribution} required maxlength="300" /></label
            >
            <p>默认使用 OpenStreetMap 标准瓦片；保留署名，不预取或批量下载地图。</p>{:else}<label class="field"
              >浏览器 API Key<input
                bind:value={p.browserKey}
                autocomplete="off"
                spellcheck="false"
                maxlength="256"
                placeholder="未配置时前台不会显示此服务"
              /></label
            >{/if}
          {#if p.provider === 'amap'}<label class="field"
              >安全密钥<input
                type="password"
                bind:value={p.securityCode}
                autocomplete="new-password"
                disabled={!settings.secretStorageReady}
                placeholder={p.hasSecret ? '已加密保存，留空保留' : '填写 securityJsCode'}
                maxlength="256"
              /></label
            >{#if p.hasSecret}<label><input type="checkbox" bind:checked={p.clearSecret} /> 清除已保存的安全密钥</label
              >{/if}
            <p>
              {settings.secretStorageReady
                ? '安全密钥只在服务器解密，并由受限代理使用。'
                : '当前环境尚未设置 GALLERY_MAP_SECRET_KEY，配置后才可保存安全密钥。'}
            </p>{/if}
          {#if p.provider !== 'osm'}<p>配置状态：{p.browserKey ? '已填写，尚需用真实地图验证授权' : '未填写'}</p>{/if}
        </section>{/each}<button disabled={busy}>{busy ? '正在保存…' : '保存并应用'}</button>
    </form>
  </div></Frame
>

<style>
  section {
    background: #fff;
    border: 1px solid #dfe4da;
    border-radius: 6px;
    padding: 24px;
    margin: 24px 0;
  }
  h2 {
    font-size: 17px;
    font-weight: 550;
  }
  .title {
    display: flex;
    gap: 25px;
    align-items: center;
  }
  .title h2 {
    margin-right: auto;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 20px 0;
  }
  .field input {
    width: 100%;
  }
  input[type='number'] {
    width: 85px;
  }
  a {
    color: #36593e;
    font-size: 13px;
  }
  .title label {
    white-space: nowrap;
  }
  @media (max-width: 600px) {
    section {
      padding: 16px;
    }
    .title {
      flex-wrap: wrap;
      gap: 15px;
    }
  }
</style>
