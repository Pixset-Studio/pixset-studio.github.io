// Решение по заявке на смену региона + письмо игроку.
//
// Почему одной функцией. Регион меняет база (region_decide), а письмо шлёт
// почта — если делать это двумя вызовами с клиента, рано или поздно получится
// «регион сменили, а игрок не в курсе» или наоборот. Здесь оба шага рядом:
// сперва решение, потом письмо, и в ответе честно сказано, ушло оно или нет.
//
// Права проверяет сама база: region_decide падает с 'forbidden', если вызвавший
// не администратор. Клиентский токен передаётся дальше именно для этого —
// service_role здесь не используется, чтобы функция не могла больше, чем
// вызвавший её человек.
//
// Секреты (Supabase → Edge Functions → Secrets):
//   SMTP_USER — почта студии, от чьего имени уходит письмо;
//   SMTP_PASS — «пароль приложения» Google (обычный пароль не подойдёт);
//   SMTP_FROM — необязательно, имя отправителя: "Pixset Studio <...>".
// Без них решение всё равно сохраняется, а в ответе приходит mailed: false.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Название страны на нужном языке. Список стран полный (ISO 3166-1), поэтому
    свой словарь тут только отставал бы: спрашиваем Intl, как и сайт. */
const countryName = (code: string, ru: boolean) => {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return code;
  try {
    return new Intl.DisplayNames([ru ? 'ru' : 'en'], { type: 'region' }).of(cc) || cc;
  } catch { return cc; }
};

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Письмо в том же стиле, что и остальные письма студии: таблицы и инлайн-стили. */
function letter(opts: {
  nickname: string; approved: boolean; country: string; currency: string; comment: string | null;
}) {
  const { nickname, approved, country, currency, comment } = opts;
  const ruCountry = countryName(country, true);
  const enCountry = countryName(country, false);
  const money = currency === 'RUB' ? 'рублях' : 'долларах';
  const moneyEn = currency === 'RUB' ? 'roubles' : 'dollars';

  const head = approved
    ? 'РЕГИОН ИЗМЕНЁН &nbsp;·&nbsp; REGION CHANGED'
    : 'ЗАЯВКА ОТКЛОНЕНА &nbsp;·&nbsp; REQUEST DECLINED';

  const ruBody = approved
    ? `<p style="margin:0 0 18px;">Здравствуйте, ${esc(nickname)}!</p>
       <p style="margin:0 0 12px;">Регион вашего аккаунта Pixset Studio изменён на
       <b style="color:#00e5ff;">${esc(ruCountry)}</b>. Цены в магазине теперь в ${money}.</p>`
    : `<p style="margin:0 0 18px;">Здравствуйте, ${esc(nickname)}!</p>
       <p style="margin:0 0 12px;">Мы рассмотрели заявку на смену региона на
       <b>${esc(ruCountry)}</b> и не смогли её одобрить. Регион аккаунта остался прежним.</p>`;

  const enBody = approved
    ? `<p style="margin:0 0 12px;">The region of your Pixset Studio account is now
       <b>${esc(enCountry)}</b>. Store prices are shown in ${moneyEn} from now on.</p>`
    : `<p style="margin:0 0 12px;">We reviewed your request to change the region to
       <b>${esc(enCountry)}</b> and could not approve it. Your account region is unchanged.</p>`;

  const note = comment
    ? `<tr><td style="padding:4px 28px 0;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:#0a1420;border-left:3px solid #00e5ff;">
           <tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;
                          font-size:14px;line-height:1.6;color:#d5dde8;">
             <b style="color:#8fa3b8;">Комментарий студии · Note from the studio</b><br>
             ${esc(comment)}
           </td></tr>
         </table>
       </td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#0b0b12;margin:0;padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:520px;background:#12121c;border:1px solid #1f2f4a;border-radius:10px;">
      <tr><td style="padding:26px 28px 8px;text-align:center;">
        <div style="font-family:'Courier New',Consolas,monospace;font-size:20px;font-weight:bold;
                    letter-spacing:4px;color:#00e5ff;">PIXSET STUDIO</div>
        <div style="font-family:'Courier New',Consolas,monospace;font-size:11px;
                    letter-spacing:2px;color:#5f7a99;margin-top:6px;">${head}</div>
      </td></tr>
      <tr><td style="padding:0 28px;">
        <div style="height:1px;background:#1f2f4a;margin:16px 0 20px;"></div>
      </td></tr>
      <tr><td style="padding:0 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
                     line-height:1.65;color:#d5dde8;">${ruBody}</td></tr>
      ${note}
      <tr><td style="padding:0 28px;">
        <div style="height:1px;background:#1f2f4a;margin:22px 0 18px;"></div>
      </td></tr>
      <tr><td style="padding:0 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                     line-height:1.6;color:#a8b8c8;">${enBody}</td></tr>
      <tr><td style="padding:22px 28px 26px;">
        <div style="height:1px;background:#1f2f4a;margin-bottom:14px;"></div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#5f7a99;line-height:1.6;">
          Письмо отправлено автоматически, отвечать на него не нужно.<br>
          This is an automated message — no need to reply.<br>
          <a href="mailto:pixset.studio.offical@gmail.com"
             style="color:#00e5ff;text-decoration:none;">pixset.studio.offical@gmail.com</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

async function sendMail(to: string, subject: string, html: string) {
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  if (!user || !pass) return { mailed: false, reason: 'smtp_not_configured' };

  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
      port: Number(Deno.env.get('SMTP_PORT') ?? 465),
      tls: true,
      auth: { username: user, password: pass },
    },
  });

  try {
    await client.send({
      from: Deno.env.get('SMTP_FROM') ?? `Pixset Studio <${user}>`,
      to,
      subject,
      html,
      // Почтовики охотнее берут письмо, у которого есть текстовая часть.
      content: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    return { mailed: true };
  } catch (e) {
    console.error('smtp failed', e);
    return { mailed: false, reason: 'smtp_failed' };
  } finally {
    try { await client.close(); } catch { /* соединение уже закрыто */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return json({ error: 'not_authenticated' }, 401);

  let body: { id?: string; approve?: boolean; comment?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (!body.id) return json({ error: 'bad_request' }, 400);

  // Токен вызывающего идёт дальше как есть: права администратора проверяет
  // сама функция в базе, и обойти её отсюда невозможно.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data, error } = await supabase.rpc('region_decide', {
    p_id: body.id,
    p_approve: !!body.approve,
    p_comment: body.comment ?? null,
  });
  if (error) return json({ error: error.message }, 400);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) return json({ error: 'request_not_found' }, 404);

  const subject = row.approved
    ? 'Регион аккаунта изменён · Account region changed'
    : 'Заявка на смену региона отклонена · Region change declined';

  const mail = await sendMail(row.email, subject, letter({
    nickname: row.nickname,
    approved: !!row.approved,
    country: row.to_country,
    currency: row.to_currency,
    comment: row.comment ?? null,
  }));

  return json({ ok: true, approved: !!row.approved, ...mail });
});
