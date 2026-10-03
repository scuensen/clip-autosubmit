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
  return page.getByRole('dialog');
}

let failed = 0;
for (const s of process.env.DRY_RUN ? [{ url: 'DRY', clip: 'dry' }] : due) {
  try {
    const dlg = await openCampaign();
    await page.locator('input[placeholder*="tiktok.com"]').fill(s.url);
    if (process.env.DRY_RUN) { console.log('DRY ok, Dialog:', (await dlg.innerText()).slice(0, 200)); break; }
    await page.getByText(/Ich habe die Anforderungen gelesen|I have read/).click();
    await dlg.getByRole('button', { name: SUBMIT }).click();
    // Erfolg = Dialog schließt sich; sonst Fehlermeldung ausgeben
    await dlg.waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
    if (await dlg.isVisible()) throw new Error('Whop: ' + (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 300));
    done[s.url] = new Date().toISOString();
    console.log(`eingereicht: ${s.clip} ${s.url}`);
  } catch (e) {
    failed++;
    console.error(`FEHLER ${s.clip}: ${e.message}`);
    await page.screenshot({ path: `fehler-${s.clip}.png`, fullPage: true }).catch(() => {});
  }
}
writeFileSync('submitted.json', JSON.stringify(done, null, 2));
await browser.close();
process.exit(failed ? 1 : 0);
