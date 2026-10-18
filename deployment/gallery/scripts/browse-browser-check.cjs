// Optional browser acceptance launched by gallery:test:db against synthetic, disposable data.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.GALLERY_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.GALLERY_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = process.env.GALLERY_BROWSER_ORIGIN;
    const album = `${origin}/albums/${process.env.GALLERY_BROWSER_ALBUM}`;
    const count = n => page.waitForFunction(n => document.querySelectorAll('button.photo').length === n, n);
    await page.goto(`${origin}/albums?q=Continuous%20test`);
    await page.waitForFunction(() => document.querySelectorAll('.album-card').length === 24);
    await page.locator('.album-card').last().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('.album-card').length === 26);
    await page.getByText('已显示全部相册', { exact: true }).waitFor();
    await page.goto(album);
    await count(48);
    let fail = true;
    await page.route('**/api/browse?**', async route => {
      if (fail) { fail = false; await route.abort(); }
      else await route.continue();
    });
    await page.locator('button.photo').last().scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '重试', exact: true }).waitFor();
    assert.equal(await page.locator('button.photo').count(), 48);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await count(96);
    await page.unroute('**/api/browse?**');
    const ids = await page.locator('button.photo').evaluateAll(nodes => nodes.map(n => n.id));
    assert.equal(new Set(ids).size, 96);

    // Refresh resolves the visible anchor's batch without fetching all preceding pages.
    await page.locator('button.photo').nth(65).scrollIntoViewIfNeeded();
    await page.waitForFunction(() => new URL(location.href).searchParams.has('anchor'));
    const target = ids[65];
    await page.waitForFunction(target => {
      const id = new URL(location.href).searchParams.get('anchor');
      const el = id && document.getElementById(id);
      return el && el.getBoundingClientRect().bottom > 0 && document.getElementById(target).getBoundingClientRect().top < innerHeight;
    }, target);
    await page.reload();
    await page.locator(`#${target}`).waitFor();
    assert.ok(await page.locator(`#${target}`).evaluate(el => el.getBoundingClientRect().top < innerHeight));

    // A click during prefetch waits for that same request, then crosses the batch boundary.
    await page.goto(album);
    await count(48);
    await page.route('**/api/browse?**', async route => {
      await new Promise(resolve => setTimeout(resolve, 450));
      await route.continue();
    });
    await page.locator('button.photo').last().evaluate(el => el.click());
    await page.locator('dialog[open]').waitFor();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Load photo 49'));
    await page.getByRole('button', { name: '关闭大图', exact: true }).click();
    await page.unroute('**/api/browse?**');
    await page.locator('button.photo').nth(65).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await page.getByRole('link', { name: '相册', exact: true }).first().evaluate(el => el.click());
    await page.waitForURL('**/albums');
    await page.goBack();
    await count(96);
    await page.waitForFunction(before => Math.abs(scrollY - before) < 100, before);

    // Photo feed uses the same loader; changing sort discards the old list.
    await page.goto(`${origin}/photos`);
    await count(48);
    await page.locator('button.photo').last().scrollIntoViewIfNeeded();
    await count(96);
    await page.goto(`${origin}/photos?sort=added`);
    await count(48);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button.photo').last().scrollIntoViewIfNeeded();
    await count(96);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: '回到顶部', exact: true }).click();
    await page.waitForFunction(() => scrollY < 2);
    assert.deepEqual(errors, []);
    console.log('Browser acceptance: append, retry, refresh anchor, viewer boundary, back restoration, feed sort, mobile layout passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
