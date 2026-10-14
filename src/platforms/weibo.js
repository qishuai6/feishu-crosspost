export const id = 'weibo';
export const label = '微博';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

export function isConfigured(env) {
  return Boolean(env.WEIBO_ACCESS_TOKEN || env.WEIBO_COOKIE);
}

function mode(env) {
  return env.WEIBO_MODE || (env.WEIBO_ACCESS_TOKEN ? 'api' : 'cookie');
}

async function postViaApi(text, env) {
  const res = await fetch('https://api.weibo.com/2/statuses/update.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: env.WEIBO_ACCESS_TOKEN, status: text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error_code) throw new Error(`微博 API ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return `https://weibo.com/u/${data.user?.id ?? ''}`;
}

// XSRF-TOKEN 有效期仅约 20 分钟且随浏览不断轮换；每次发布前先访问一次首页取最新值
async function fetchFreshXsrf(cookie) {
  try {
    const res = await fetch('https://m.weibo.cn/', {
      headers: { Cookie: cookie, 'User-Agent': UA },
      redirect: 'follow',
    });
    let xsrf = null;
    for (const c of res.headers.getSetCookie()) {
      const m = c.match(/^XSRF-TOKEN=([^;]+)/);
      if (m && m[1] !== 'deleted') xsrf = decodeURIComponent(m[1]);
    }
    return xsrf;
  } catch {
    return null;
  }
}

function withXsrf(cookie, xsrf) {
  return /XSRF-TOKEN=/.test(cookie)
    ? cookie.replace(/XSRF-TOKEN=[^;]+/, 'XSRF-TOKEN=' + xsrf)
    : cookie + '; XSRF-TOKEN=' + xsrf;
}

async function postViaCookie(text, env) {
  let cookie = env.WEIBO_COOKIE;
  let xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1]?.trim() || env.WEIBO_XSRF || '';
  const fresh = await fetchFreshXsrf(cookie);
  if (fresh) {
    xsrf = fresh;
    cookie = withXsrf(cookie, fresh);
  }
  if (!xsrf) throw new Error('无法获取 XSRF-TOKEN：请检查 WEIBO_COOKIE 是否完整（至少需含 SUB）');

  const doPost = () =>
    fetch('https://m.weibo.cn/api/statuses/update', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'X-XSRF-TOKEN': xsrf,
        Referer: 'https://m.weibo.cn/compose/',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
      },
      body: new URLSearchParams({ content: text }),
    });

  let data = await (await doPost()).json().catch(() => ({}));
  // 100006「请求非法」= 令牌刚过期，强刷一次再试
  if (data.ok !== 1 && String(data.errno) === '100006') {
    const retry = await fetchFreshXsrf(env.WEIBO_COOKIE);
    if (retry && retry !== xsrf) {
      xsrf = retry;
      cookie = withXsrf(env.WEIBO_COOKIE, retry);
      data = await (await doPost()).json().catch(() => ({}));
    }
  }
  if (data.ok !== 1) throw new Error(`微博网页接口: ${JSON.stringify(data).slice(0, 200)}`);
  return `https://m.weibo.cn/status/${data.data?.id ?? ''}`;
}

export async function post(text, env) {
  return mode(env) === 'api' ? postViaApi(text, env) : postViaCookie(text, env);
}

export async function verify(env) {
  if (mode(env) === 'api') {
    const res = await fetch(
      `https://api.weibo.com/2/account/rate_limit_status.json?access_token=${encodeURIComponent(env.WEIBO_ACCESS_TOKEN)}`
    );
    const data = await res.json().catch(() => ({}));
    if (data.error_code) throw new Error(`token 校验失败: ${JSON.stringify(data).slice(0, 150)}`);
    return '官方 API token 有效';
  }
  const res = await fetch('https://m.weibo.cn/api/config', {
    headers: { Cookie: env.WEIBO_COOKIE, 'User-Agent': UA },
  });
  const data = await res.json().catch(() => ({}));
  if (data?.data?.login) return '网页 Cookie 登录有效';
  throw new Error('Cookie 已失效，请重新复制');
}
