// Gibt aus, wie viele Sekunden bis zum nächsten Einreich-Versuch zu warten sind.
// 0 = jetzt fällig · Zahl = warten · "none" = nichts mehr offen
import { readFileSync } from 'node:fs';

const schedule = JSON.parse(readFileSync('schedule.json', 'utf8'));
const done = JSON.parse(readFileSync('submitted.json', 'utf8'));
const now = Date.now();
const open = schedule
  .filter((s) => !done[s.url] && now - Date.parse(s.at) <= 29 * 60000)
  .map((s) => Date.parse(s.at) + 90000); // 1,5 Min nach Posting, dann ist das Video sicher online
if (!open.length) console.log('none');
else console.log(Math.max(0, Math.ceil((Math.min(...open) - now) / 1000)));
