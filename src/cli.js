#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, log } from './util.js';
import { publish, formatResults, PLATFORMS } from './publish.js';

const ALIAS = { wb: 'weibo', jk: 'jike', db: 'douban' };

function help() {
  console.log(`用法:
  node src/cli.js "要发布的内容"            发布到所有已配置平台
  npm run post -- "内容" --only=x,weibo     只发指定平台（x/weibo/jike/douban，别名 twitter/wb/jk/db）
  npm run post -- "内容" --skip=jike        排除某平台
  npm run post -- --file draft.txt          从文件读取长文
  npm run post -- "内容" --dry              试运行，不真正发布
  npm run verify                            校验各平台凭据是否有效`);
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  let only = [];
  let skip = [];
  let verify = false;
  let file = null;
  const parts = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const grab = (name) => {
      if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
      if (a === `--${name}`) return args[++i] ?? '';
      return undefined;
    };
    let v;
    if (a === '--help' || a === '-h') return help();
    else if (a === '--verify') verify = true;
    else if (a === '--dry') process.env.DRY_RUN = '1';
    else if ((v = grab('only')) !== undefined)
      only = v.split(',').map((s) => ALIAS[s.trim()] || s.trim()).filter(Boolean);
    else if ((v = grab('skip')) !== undefined)
      skip = v.split(',').map((s) => ALIAS[s.trim()] || s.trim()).filter(Boolean);
    else if ((v = grab('file')) !== undefined) file = v;
    else parts.push(a);
  }

  let text = parts.join('\n');
  if (file) text = fs.readFileSync(path.resolve(file), 'utf8');
  text = text.trim();

  if (verify) {
    for (const p of PLATFORMS) {
      if (!p.isConfigured(process.env)) {
        console.log(`⬜ ${p.label}：未配置`);
        continue;
      }
      if (!p.verify) {
        console.log(`🟡 ${p.label}：已配置（未联网校验）`);
        continue;
      }
      try {
        console.log(`✅ ${p.label}：${await p.verify(process.env)}`);
      } catch (e) {
        console.log(`❌ ${p.label}：${e.message}`);
      }
    }
    return;
  }

  if (!text) {
    help();
    process.exitCode = 1;
    return;
  }

  const dry = process.env.DRY_RUN === '1';
  log(`${dry ? '[试运行] ' : ''}开始发布：${text.slice(0, 40).replace(/\n/g, ' ')}${text.length > 40 ? '…' : ''}`);
  const results = await publish(text, { only, skip });
  console.log(formatResults(results));
  if (results.some((r) => r.status === 'error')) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
