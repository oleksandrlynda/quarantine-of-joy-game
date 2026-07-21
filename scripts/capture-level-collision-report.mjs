import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const port = Math.max(1, Number(process.argv[2]) || 9353);
const outputFile = path.resolve(process.argv[3] || '.tmp/level-collision-report.json');
const timeoutMs = Math.max(1000, Number(process.argv[4]) || 180000);
const navigationUrl = process.argv[5] || '';
const startedAt = Date.now();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function findTarget() {
  while (Date.now() - startedAt < 30000) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const target = targets.find(item => item.type === 'page' && (
        navigationUrl || item.url.includes('test-level-collisions.html')
      ));
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Level collision target was not available on CDP port ${port}.`);
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to the level collision browser target.')), { once: true });
  });
  const send = async (method, params = {}) => {
    await opened;
    const id = nextId++;
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  };
  return { socket, send };
}

const target = await findTarget();
const cdp = connect(target.webSocketDebuggerUrl);
await cdp.send('Runtime.enable');
if (navigationUrl) {
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.navigate', { url: navigationUrl });
}
let previousStatus = '';

while (Date.now() - startedAt < timeoutMs) {
  const evaluation = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      done: window.__levelCollisionDiagnosticDone === true,
      status: document.getElementById('status')?.textContent || '',
      elapsed: document.getElementById('elapsed')?.textContent || '',
      report: window.__levelCollisionReport || null
    })`,
    returnByValue: true
  });
  const state = JSON.parse(evaluation.result.value);
  const status = `${state.status} ${state.elapsed}`.trim();
  if (status && status !== previousStatus) {
    console.log(status);
    previousStatus = status;
  }
  if (state.done && state.report) {
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(state.report, null, 2)}\n`, 'utf8');
    console.log(`Level collision report written to ${outputFile}`);
    console.log(JSON.stringify(state.report.summary));
    cdp.socket.close();
    process.exit(0);
  }
  await sleep(500);
}

cdp.socket.close();
throw new Error(`Level collision diagnostic did not finish within ${timeoutMs} ms.`);
