export const id = 'douban';
export const label = '豆瓣';

export function isConfigured(env) {
  return Boolean(env.DOUBAN_COOKIE);
}

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export function getCookie(env) {
  return env.DOUBAN_COOKIE;
}

export function getCk(env) {
  return env.DOUBAN_CK || env.DOUBAN_COOKIE.match(/(?:^|;\s*)ck=([^;]+)/)?.[1] || '';
}

function baseHeaders(env) {
  return {
    Cookie: getCookie(env),
    Referer: env.DOUBAN_REFERER || 'https://www.douban.com/',
    'User-Agent': UA,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

// 发广播：网页版发布框同款接口（2026-10 抓包确认）
// 注意三个坑：① body 必须是 JSON 而非表单；② 必须带 ck 字段（CSRF），缺失会被伪装成 need_login；
// ③ content 是 DraftJS blocks 格式
export async function post(text, env) {
  const url = env.DOUBAN_API || 'https://m.douban.com/rexxar/api/v2/topic/post';
  const ck = getCk(env);
  if (!ck) throw new Error('DOUBAN_COOKIE 中缺少 ck 字段，请重新复制完整 Cookie');
  const content = JSON.stringify({
    blocks: [{ key: Math.random().toString(36).slice(2, 7), text, type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: { align: '' } }],
    entityMap: {},
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...baseHeaders(env),
      'Content-Type': 'application/json',
      Referer: 'https://www.douban.com/',
      Origin: 'https://www.douban.com',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      group_id: '0',
      content,
      image_ids: '',
      interest_tags: '',
      subtype: 'personal',
      accessible: 'public',
      explanation_types: '',
      send_status: true,
      original: false,
      ck,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`豆瓣接口 ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const sid = data.id || data.status?.id || data.sid;
  return sid ? `https://www.douban.com/topic/${sid}/` : '已发布（接口未返回广播 ID）';
}

export async function verify(env) {
  const ck = getCk(env);
  const res = await fetch(`https://m.douban.com/rexxar/api/v2/user/self?ck=${encodeURIComponent(ck)}`, {
    headers: baseHeaders(env),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Cookie 已失效，请重新登录豆瓣');
    throw new Error(`无法校验（HTTP ${res.status}）`);
  }
  const data = await res.json().catch(() => ({}));
  return data.name ? `已登录：${data.name}` : 'Cookie 有效';
}
