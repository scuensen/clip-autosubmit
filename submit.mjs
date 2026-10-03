// Reicht geplante TikTok-Clips bei Whop Content Rewards ein (Fenster: 1–29 Min nach Posting).
// ENV: WHOP_COOKIES (JSON-Array), optional CHROME_PATH, DRY_RUN=1 (nur bis zum Dialog)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APP = 'https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com/c/exp_T1NluLUJL7I2lN';
const CAMPAIGN = `${APP}/campaigns/ecbd7fec-6f39-4081-aa18-1756f0ae73e9`;
const SUBMIT = /^(Clip einreichen|Submit clip|Submit)$/i;

const schedule = JSON.parse(readFileSync('schedule.json', 'utf8'));
const done = existsSync('submitted.json') ? JSON.parse(readFileSync('submitted.json', 'utf8')) : {};
const now = Date.now();
const due = schedule.filter((s) => {
  const age = (now - Date.parse(s.at)) / 60000;
  return !done[s.url] && age >= 1 && age <= 29;
});
if (!due.length && !process.env.DRY_RUN) { console.log('nichts fällig'); process.exit(0); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 1000 } });
await ctx.addCookies(JSON.parse(process.env.WHOP_COOKIES));
const page = await ctx.newPage();

async function openCampaign() {
  await page.goto(`https://whop.com/core/app/launch/?redirect=${encodeURIComponent(CAMPAIGN)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/apps\.whop\.com/, { timeout: 60000 });
  await page.getByRole('button', { name: SUBMIT }).first().click({ timeout: 30000 });
}

let failed = 0;
for (const s of process.env.DRY_RUN ? [{ url: 'DRY', clip: 'dry' }] : due) {
  try {
    await openCampaign();
    // Playwright-Klicks/fill hängen in der Cloud → Wert im Seitenkontext setzen (React-tauglich)
    await page.waitForSelector('input[placeholder*="tiktok.com"]', { timeout: 30000 });
    await page.evaluate((url) => {
      const i = document.querySelector('input[placeholder*="tiktok.com"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, url);
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, s.url);
    if (process.env.DRY_RUN) { console.log('DRY ok, Feld:', await page.locator('input[placeholder*="tiktok.com"]').inputValue()); break; }
    await page.waitForTimeout(3000); // Whop prüft den Link live
    await page.evaluate(() => {
      const cb = document.querySelector('input[type=checkbox]');
      if (!cb.checked) cb.click();
      const b = [...document.querySelectorAll('button')].filter((b) => /^(Clip einreichen|Submit clip|Submit)$/i.test(b.innerText.trim())).pop();
      b.click();
    });
    // Erfolg = Linkfeld verschwindet (Dialog zu); sonst Seitentext als Fehler ausgeben
    const field = page.locator('input[placeholder*="tiktok.com"]');
    await field.waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
    if (await field.count()) throw new Error('Whop: ' + (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(-400));
    done[s.url] = new Date().toISOString();
    console.log(`eingereicht: ${s.clip} ${s.url}`);
  } catch (e) {
    failed++;
    console.error(`FEHLER ${s.clip}: ${e.message}`);
    const inputs = await page.locator('input').evaluateAll((l) => l.map((i) => [i.type, i.placeholder, i.disabled, i.readOnly, i.offsetParent !== null])).catch(() => '?');
    console.error('url:', page.url(), 'frames:', page.frames().length, 'inputs:', JSON.stringify(inputs));
    await page.screenshot({ path: `fehler-${s.clip}.png`, fullPage: true }).catch(() => {});
  }
}
writeFileSync('submitted.json', JSON.stringify(done, null, 2));
await browser.close();
process.exit(failed ? 1 : 0);
