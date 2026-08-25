// Резервная копия базы Pixset Studio.
//
// На бесплатном тарифе Supabase автоматических бэкапов нет: если проект
// удалят или что-то пойдёт не так, лицензии и заказы восстановить будет
// неоткуда. Скрипт выгружает важные таблицы в JSON — этого достаточно,
// чтобы вернуть игрокам покупки даже на новом проекте.
//
// Запуск (ключ берётся из переменной окружения, в код не попадает):
//   set SUPABASE_SERVICE_KEY=...   &&  node tools/backup.mjs
//   SUPABASE_SERVICE_KEY=... node tools/backup.mjs        (bash)
//
// Ключ — service_role из настроек проекта. Он даёт полный доступ к базе,
// поэтому хранить его в файлах репозитория нельзя.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL_BASE = 'https://zyjhvuhovimorpokiwty.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;

// Порядок важен при восстановлении: сначала то, на что ссылаются остальные.
const TABLES = [
  'games',
  'profiles',
  'admin_emails',
  'app_settings',
  'orders',
  'licenses',
  'devices',
  'releases',
  'payment_events',
  'download_log',
];

if (!KEY) {
  console.error('Не задан SUPABASE_SERVICE_KEY.');
  console.error('Возьмите service_role в настройках проекта и передайте через переменную окружения.');
  process.exit(1);
}

async function fetchAll(table) {
  const rows = [];
  const step = 1000;

  // Постранично: таблицы вырастут, а PostgREST по умолчанию отдаёт ограниченный кусок.
  for (let from = 0; ; from += step) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + step - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);

    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < step) break;
  }
  return rows;
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const dir = join(process.cwd(), 'backups', stamp);
mkdirSync(dir, { recursive: true });

let total = 0;
const summary = {};

for (const table of TABLES) {
  try {
    const rows = await fetchAll(table);
    writeFileSync(join(dir, table + '.json'), JSON.stringify(rows, null, 1), 'utf8');
    summary[table] = rows.length;
    total += rows.length;
    console.log(`  ${table}: ${rows.length}`);
  } catch (err) {
    summary[table] = 'ошибка: ' + err.message;
    console.error(`  ${table}: ${err.message}`);
  }
}

writeFileSync(join(dir, '_summary.json'),
  JSON.stringify({ made_at: new Date().toISOString(), tables: summary }, null, 1), 'utf8');

console.log(`\nГотово: ${total} записей → ${dir}`);
console.log('Храните копию вне компьютера — на диске рядом с проектом она не спасёт.');
