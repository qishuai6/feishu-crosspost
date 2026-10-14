import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function log(...args) {
  console.log(`[${new Date().toLocaleString('zh-CN', { hour12: false })}]`, ...args);
}

export function record(entry) {
  const dir = path.join(ROOT, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'posted.jsonl'), JSON.stringify(entry) + '\n');
}

// 更新 .env 中的键值并同步到 process.env（用于运行时刷新令牌后持久化）
export function updateEnvFile(updates) {
  const file = path.join(ROOT, '.env');
  let lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  for (const [key, val] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=`);
    const idx = lines.findIndex((l) => re.test(l));
    const line = `${key}=${val}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
    process.env[key] = val;
  }
  fs.writeFileSync(file, lines.join('\n'));
}
