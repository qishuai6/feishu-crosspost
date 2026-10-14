import { log, record } from './util.js';
import * as weibo from './platforms/weibo.js';
import * as jike from './platforms/jike.js';
import * as douban from './platforms/douban.js';

export const PLATFORMS = [weibo, jike, douban];

export async function publish(text, { only, skip } = {}) {
  const env = process.env;
  const dry = process.env.DRY_RUN === '1';
  const targets = PLATFORMS.filter((p) => !only?.length || only.includes(p.id)).filter(
    (p) => !skip?.includes(p.id)
  );
  const results = await Promise.all(
    targets.map(async (p) => {
      if (!p.isConfigured(env)) {
        return { platform: p.id, label: p.label, status: 'skipped', message: '未配置凭据，已跳过' };
      }
      if (dry) {
        return { platform: p.id, label: p.label, status: 'dryrun', message: '试运行，未真正发布' };
      }
      try {
        const link = await p.post(text, env);
        return { platform: p.id, label: p.label, status: 'ok', link };
      } catch (e) {
        return { platform: p.id, label: p.label, status: 'error', message: String(e.message || e).slice(0, 300) };
      }
    })
  );
  if (!dry) record({ time: new Date().toISOString(), text, results });
  return results;
}

const ICON = { ok: '✅', error: '❌', skipped: '⏭️', dryrun: '🧪' };

export function formatResults(results) {
  return results
    .map((r) => `${ICON[r.status]} ${r.label}：${r.status === 'ok' ? r.link : r.message}`)
    .join('\n');
}
