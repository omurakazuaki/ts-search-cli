#!/usr/bin/env node
import axios from 'axios';
import cac from 'cac';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as net from 'net';
import * as path from 'path';
import { CliPresenter } from './adapters/presenters/CliPresenter';
import { getDaemonFilePath } from './utils/daemon';

const cli = cac('ts-search');
const presenter = new CliPresenter();

async function getDaemonInfo(): Promise<{ port: number; pid: number } | null> {
  try {
    const daemonFilePath = getDaemonFilePath(process.cwd());
    const content = await fs.readFile(daemonFilePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function isServerRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function waitForServer(retries = 20, delay = 1000): Promise<number> {
  for (let i = 0; i < retries; i++) {
    const info = await getDaemonInfo();
    if (info) {
      try {
        await axios.get(`http://localhost:${info.port}/health`);
        return info.port;
      } catch {
        // Server might be starting up
      }
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error('Server failed to start within timeout');
}

async function ensureServerRunning(): Promise<number> {
  const info = await getDaemonInfo();
  if (info) {
    if (await isServerRunning(info.port)) {
      return info.port;
    }
    // Stale file, remove it
    try {
      const daemonFilePath = getDaemonFilePath(process.cwd());
      await fs.unlink(daemonFilePath);
    } catch {
      // Ignore
    }
  }

  console.error('Server not running. Starting server...');

  const isTs = __filename.endsWith('.ts');
  const scriptPath = isTs
    ? path.join(__dirname, 'main.ts')
    : path.join(__dirname, '../dist/main.js');

  const command = isTs ? 'npx' : 'node';
  const args = isTs ? ['ts-node', scriptPath] : [scriptPath];

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });

  child.unref();

  // Wait up to 5 minutes for the server to start (large repos take time to index)
  const port = await waitForServer(300);
  console.error(`Server started on port ${port}.`);
  return port;
}

function handleError(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    console.error(`Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error('Unknown error occurred');
  }
  process.exit(1);
}

// Wrap action to ensure server is running
const withServer =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (action: (baseUrl: string, ...args: any[]) => Promise<void>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (...args: any[]) => {
      try {
        const port = await ensureServerRunning();
        const baseUrl = `http://localhost:${port}`;
        await action(baseUrl, ...args);
      } catch (error) {
        handleError(error);
      }
    };

cli
  .command('map <file>', 'Map symbols in a file')
  .option('--table', 'Output in table format')
  .action(
    withServer(async (baseUrl, file, options) => {
      const response = await axios.get(`${baseUrl}/map`, {
        params: { path: file },
      });
      presenter.present(response.data.symbols, options);
    }),
  );

cli
  .command('search <query>', 'Search for symbols by name')
  .option('--table', 'Output in table format')
  .action(
    withServer(async (baseUrl, query, options) => {
      const response = await axios.get(`${baseUrl}/search`, {
        params: { query },
      });
      presenter.present(response.data.candidates, options);
    }),
  );

cli
  .command('find <id>', 'Find definition and references by ID')
  .option('--table', 'Output in table format')
  .action(
    withServer(async (baseUrl, id, options) => {
      const response = await axios.get(`${baseUrl}/find`, {
        params: { id },
      });
      presenter.present(response.data, options);
    }),
  );

cli
  .command('inspect <id>', 'Inspect a symbol by ID')
  .option('--expand <mode>', 'Expansion mode (block, file, none)', {
    default: 'block',
  })
  .option('--table', 'Output in table format')
  .action(
    withServer(async (baseUrl, id, options) => {
      const response = await axios.get(`${baseUrl}/inspect`, {
        params: { id, expand: options.expand },
      });
      presenter.present(response.data.result, options);
    }),
  );

cli.command('stop', 'Stop the background server').action(async () => {
  try {
    const info = await getDaemonInfo();
    if (!info) {
      console.log('Server is not running (no daemon file).');
      return;
    }
    const baseUrl = `http://localhost:${info.port}`;
    await axios.post(`${baseUrl}/shutdown`, {});
    console.log('Server stopping...');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Server is not running or failed to stop.', msg);
  }
});

cli.help();
cli.version('0.1.1');

cli.parse();
