// Pixset Studio — общий клиент аккаунтов.
// Публичный ключ безопасно держать в коде: доступ к данным ограничен
// политиками RLS на стороне базы, а не секретностью ключа.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://zyjhvuhovimorpokiwty.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Страница аккаунта — куда возвращаются письма подтверждения и сброса пароля. */
export const ACCOUNT_URL = new URL('/account/', location.origin).href;

/** Ник: латиница, цифры, _ и -, 3–20 символов. */
export const NICKNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

export async function register({ email, password, nickname }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nickname },
      emailRedirectTo: ACCOUNT_URL,
    },
  });
  if (error) throw error;
  // Если подтверждение почты включено, сессии не будет — это не ошибка.
  return { needsConfirmation: !data.session };
}

export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: ACCOUNT_URL,
  });
  if (error) throw error;
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, avatar_url, created_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

/** Каталог опубликованных игр. Виден и гостям. */
export async function getGames() {
  const { data, error } = await supabase
    .from('games')
    .select('slug, title, tagline, price_rub, is_published')
    .eq('is_published', true)
    .order('created_at');
  if (error) throw error;
  return data;
}

/** Игры, на которые у текущего пользователя есть действующая лицензия. */
export async function getEntitlements() {
  const { data, error } = await supabase
    .from('my_entitlements')
    .select('game_slug, granted_at');
  if (error) throw error;
  return data;
}

export async function getDevices() {
  const { data, error } = await supabase
    .from('devices')
    .select('id, label, platform, last_seen')
    .order('last_seen', { ascending: false });
  if (error) throw error;
  return data;
}

export async function revokeDevice(id) {
  const { error } = await supabase.from('devices').delete().eq('id', id);
  if (error) throw error;
}

/** Человекочитаемые сообщения вместо английских ошибок Supabase. */
export function humanError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Неверная почта или пароль.';
  if (m.includes('email not confirmed'))       return 'Почта не подтверждена — проверь входящие.';
  if (m.includes('user already registered'))   return 'Такая почта уже зарегистрирована.';
  if (m.includes('password should be at least')) return 'Пароль слишком короткий — минимум 6 символов.';
  if (m.includes('duplicate key') && m.includes('nickname')) return 'Этот ник уже занят.';
  if (m.includes('unable to validate email'))  return 'Проверь правильность адреса почты.';
  if (m.includes('for security purposes') || m.includes('rate limit')) {
    return 'Слишком много попыток. Подожди минуту и попробуй снова.';
  }
  if (m.includes('failed to fetch')) return 'Нет связи с сервером. Проверь интернет.';
  return err?.message || 'Неизвестная ошибка.';
}
