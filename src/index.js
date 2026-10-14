import { loadEnv, log } from './util.js';
import { publish, formatResults, PLATFORMS } from './publish.js';
import * as lark from '@larksuiteoapi/node-sdk';

loadEnv();

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
if (!appId || !appSecret) {
  console.error('缺少 FEISHU_APP_ID / FEISHU_APP_SECRET。请在 .env 中配置，步骤见 README「飞书应用创建」一节。');
  process.exit(1);
}

const client = new lark.Client({ appId, appSecret, domain: lark.Domain.Feishu });

async function replyText(messageId, text) {
  if (!messageId) return;
  try {
    await client.im.message.reply({
      path: { message_id: messageId },
      data: { msg_type: 'text', content: JSON.stringify({ text }) },
    });
  } catch (e) {
    log('回复飞书失败:', e.message);
  }
}

const triggerMode = () => process.env.TRIGGER_MODE || 'all';
const triggerPrefix = () => process.env.TRIGGER_PREFIX || '/发';

const dispatcher = new lark.EventDispatcher({});
dispatcher.register({
  'im.message.receive_v1': async (data) => {
    const msg = data.message;
    // 不同 SDK 版本的事件结构可能不同，兼容多种取值路径
    const messageId =
      msg?.message_id || msg?.messageId || data.message_id || data.messageId || msg?.chat_id || '';
    if (process.env.DEBUG_EVENT === '1') {
      log('事件结构: data keys =', Object.keys(data).join(','), '| msg keys =', Object.keys(msg || {}).join(','));
      log(
        '事件取值: message_id =',
        msg?.message_id,
        '| chat_id =',
        msg?.chat_id,
        '| open_id =',
        data.sender?.sender_id?.open_id
      );
    }
    try {
      // 忽略非用户消息，防止机器人互发造成循环
      if (data.sender?.sender_type && data.sender.sender_type !== 'user') return;

      if (msg?.message_type !== 'text') {
        await replyText(messageId, '目前只支持文字消息。');
        return;
      }

      let text = '';
      try {
        text = JSON.parse(msg.content || '{}').text?.trim() || '';
      } catch {
        text = '';
      }
      // 群聊中 @机器人 会留下 @_user_N 占位符，去掉
      text = text.replace(/@_user_\d+\s*/g, '').trim();
      if (!text) return;

      if (text.startsWith('/')) {
        if (text === '/状态' || text === '/status') {
          const configured = PLATFORMS.filter((p) => p.isConfigured(process.env)).map((p) => p.label);
          await replyText(
            messageId,
            `已配置平台：${configured.join('、') || '（无，请编辑 .env）'}\n触发方式：${triggerMode()}` +
              (triggerMode() === 'prefix' ? `（需以「${triggerPrefix()}」开头）` : '')
          );
        } else if (text === '/帮助' || text === '/help') {
          await replyText(
            messageId,
            '直接发文字即会同步发布到已配置平台。' +
              (triggerMode() === 'prefix' ? `当前为 prefix 模式，消息需以「${triggerPrefix()}」开头。` : '') +
              '\n命令：/状态 查看配置，/帮助 查看用法。'
          );
        } else if (triggerMode() === 'all') {
          await replyText(messageId, '以 / 开头的消息不会发布。发送 /帮助 查看用法。');
        }
        return;
      }

      if (triggerMode() === 'prefix') {
        if (!text.startsWith(triggerPrefix())) return;
        text = text.slice(triggerPrefix().length).trim();
        if (!text) return;
      }

      log(`收到消息，开始发布：${text.slice(0, 40).replace(/\n/g, ' ')}${text.length > 40 ? '…' : ''}`);
      const results = await publish(text);
      const okCount = results.filter((r) => r.status === 'ok').length;
      await replyText(messageId, `发布完成（成功 ${okCount}/${results.length}）\n${formatResults(results)}`);
    } catch (e) {
      log('处理消息出错:', e.message);
      await replyText(messageId, `处理失败：${String(e.message || e).slice(0, 200)}`);
    }
  },
});

const configured = PLATFORMS.filter((p) => p.isConfigured(process.env)).map((p) => p.label);
log(`已配置平台：${configured.join('、') || '（无，请编辑 .env）'}`);
log(`触发方式：${triggerMode()}${triggerMode() === 'prefix' ? `（前缀「${triggerPrefix()}」）` : ''}`);

const ws = new lark.WSClient({ appId, appSecret, loggerLevel: lark.LoggerLevel.info });
ws.start({ eventDispatcher: dispatcher }).catch((e) => {
  console.error('飞书长连接启动失败:', e.message);
  process.exit(1);
});
log('飞书长连接启动中… 连接成功后，在飞书里直接给机器人发消息即可。');

process.on('SIGINT', () => {
  log('已停止');
  process.exit(0);
});
