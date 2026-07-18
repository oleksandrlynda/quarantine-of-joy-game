const socketUrl = process.argv[2];
const expression = process.argv[3] === 'summary'
  ? `window.__bossReactionDiagnosticDone ? JSON.stringify({
      schemaVersion: window.__bossReactionDiagnosticReport.schemaVersion,
      summary: window.__bossReactionDiagnosticReport.summary,
      errors: window.__bossReactionDiagnosticReport.errors,
      results: window.__bossReactionDiagnosticReport.results.map(result => ({
        bossId: result.bossId,
        scenarioId: result.scenarioId,
        status: result.assessment.status,
        findings: result.assessment.findings,
        distanceTravelled: result.metrics.distanceTravelled,
        damageBySourceKind: result.metrics.damageBySourceKind,
        movementBlockedTicks: result.metrics.movementBlockedTicks,
        selfOwnedBlockTicks: result.metrics.selfOwnedBlockTicks,
        maxConsecutiveSelfOwnedBlockTicks: result.metrics.maxConsecutiveSelfOwnedBlockTicks,
        actionCounts: result.metrics.actionCounts
      }))
    }) : null`
  : (process.argv[3]
    || 'window.__bossReactionDiagnosticDone ? JSON.stringify(window.__bossReactionDiagnosticReport) : null');

if (!socketUrl) throw new Error('Usage: node scripts/read-cdp-report.mjs <webSocketDebuggerUrl> [expression]');

const socket = new WebSocket(socketUrl);
const pending = new Map();
let nextId = 0;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message);
});

socket.addEventListener('open', async () => {
  try {
    for (let attempt = 0; attempt < 1800; attempt++) {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true });
      const value = response.result?.result?.value;
      if (value) {
        process.stdout.write(String(value));
        socket.close();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for the browser diagnostic report');
  } catch (error) {
    console.error(error.message);
    socket.close();
    process.exitCode = 1;
  }
});
