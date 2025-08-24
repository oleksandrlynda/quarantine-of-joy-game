import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const server = spawn('python', ['-m', 'http.server', '8080'], {
  stdio: 'inherit'
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const baseUrl = 'http://localhost:8080';

  // Wait until the server responds to requests for index.html
  let indexRes;
  for (let i = 0; i < 10; i++) {
    try {
      indexRes = await fetch(`${baseUrl}/index.html`);
      if (indexRes.ok) break;
    } catch {
      // ignore connection errors while server starts
    }
    await wait(500);
  }
  if (!indexRes || !indexRes.ok) {
    throw new Error('index.html could not be reached');
  }

  // Read HTML to find referenced resources
  const html = await readFile('index.html', 'utf8');
  const resourceUrls = new Set();
  const regex = /(src|href)="([^\"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = match[2];
    if (url.startsWith('http') || url.startsWith('mailto:')) continue;
    resourceUrls.add(url);
  }

  for (const url of resourceUrls) {
    const res = await fetch(`${baseUrl}/${url}`);
    if (!res.ok) {
      throw new Error(`Resource ${url} returned ${res.status}`);
    }
  }

  console.log('All resources loaded successfully.');
}

try {
  await main();
} finally {
  server.kill();
}
