import { updateEnvFile } from '../util.js';

export const id = 'jike';
export const label = '即刻';

export function isConfigured(env) {
  return Boolean(env.JIKE_ACCESS_TOKEN);
}

const CREATE_URL = 'https://api.ruguoapp.com/1.0/originalPosts/create';
const REFRESH_URL = 'https://api.ruguoapp.com/app_auth_tokens.refresh';

let refreshing = null;

// access token 约 30 分钟过期；用 refresh token 换新并持久化到 .env
async function refreshTokens(env) {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = env.JIKE_REFRESH_TOKEN;
      if (!rt) throw new Error('缺少 JIKE_REFRESH_TOKEN，无法自动续期，请重新从网页版抓取令牌');
      const res = await fetch(REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Jike-Refresh-Token': rt, 'User-Agent': 'okjike-web' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      const access = data['x-jike-access-token'];
      const refresh = data['x-jike-refresh-token'];
      if (!res.ok || !access) throw new Error(`即刻令牌续期失败: ${JSON.stringify(data).slice(0, 150)}`);
      const updates = { JIKE_ACCESS_TOKEN: access };
      if (refresh) updates.JIKE_REFRESH_TOKEN = refresh;
      updateEnvFile(updates);
      return access;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function headers(env) {
  return {
    'Content-Type': 'application/json',
    'X-Jike-Access-Token': env.JIKE_ACCESS_TOKEN,
    'User-Agent': 'okjike-web',
  };
}

async function fetchWithRefresh(env, doFetch, res) {
  if (res.status !== 401) return res;
  await refreshTokens(env);
  return doFetch();
}

export async function post(text, env) {
  const url = env.JIKE_API || CREATE_URL;
  const doFetch = () => fetch(url, { method: 'POST', headers: headers(env), body: JSON.stringify({ content: text }) });
  let res = await doFetch();
  res = await fetchWithRefresh(env, doFetch, res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`即刻接口 ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const pid =
    data.postId || data.id || data.post?.id || data.data?.id || data.data?.postId || data.data?.post?.id;
  return pid
    ? `https://m.okjike.com/originalPosts/${pid}`
    : `已提交（响应字段: ${Object.keys(data).join(', ') || '空'}）`;
}

// 用「空动态」探测：返回 400 空白动态 = 端点与令牌都有效，且不会真的发布
export async function verify(env) {
  const doFetch = () =>
    fetch(CREATE_URL, {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({}),
    });
  let res = await doFetch();
  res = await fetchWithRefresh(env, doFetch, res);
  const data = await res.json().catch(() => ({}));
  if (res.status === 400) return 'token 有效（端点可达且鉴权通过）';
  if (res.status === 401 || res.status === 403) throw new Error(`token 已失效: ${JSON.stringify(data).slice(0, 150)}`);
  throw new Error(`无法校验（HTTP ${res.status}）: ${JSON.stringify(data).slice(0, 150)}`);
}
