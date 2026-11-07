import { once } from 'node:events';
import { createServer } from '../output/seeking-light/server.mjs';
import { fixtureVersion } from '../tests/web-fixtures.mjs';

const args = process.argv.slice(2);
if (args.length && !(args.length === 1 && args[0] === '--font-failure')) {
  console.error('未知测试参数；仅支持 --font-failure，未启动测试服务。');
  process.exit(1);
}
const fontFailure = args[0] === '--font-failure';

// A new origin isolates browser storage; it does not copy or back up any diary.
const server = createServer({ fontFailure });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
console.log(`隔离测试入口：http://127.0.0.1:${server.address().port}/`);
console.log(`虚构数据版本：${fixtureVersion}（tests/web-fixtures.mjs）`);
if (fontFailure) console.log('字体故障模式：固定远程字体链接改为 /test-font-unavailable.css（404）；仅准备 fallback 验收，不代表已通过。');
console.log('仅启动静态体验稿，不打开或清理浏览器，不读取或备份私人日记，不调用 Copilot。');
console.log('临时 origin 隔离不是私人数据备份；端口可能被复用，请先确认该 origin 没有私人记录。');
console.log('体验稿自带虚构示例；空白场景是尚未提交用户记录，不是没有示例的页面。');
console.log('按 Ctrl+C 停止；请在同一次运行中完成保存与刷新测试。');

function stop() {
  server.closeAllConnections();
  server.close();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
