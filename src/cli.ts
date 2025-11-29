#!/usr/bin/env node
import axios from 'axios';
import cac from 'cac';
import { spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';

const cli = cac('code-nav');
const BASE_URL = 'http://localhost:3000';

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

async function waitForServer(retries = 20, delay = 1000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(`${BASE_URL}/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Server failed to start within timeout');
}

async function ensureServerRunning() {
  if (await isServerRunning(3000)) {
    return;
  }

  console.error('Server not running. Starting server...');

  // Determine the path to the main script
  // In dev: src/main.ts (via ts-node)
  // In prod: dist/main.js (via node)
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

  await waitForServer();
  console.error('Server started.');
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
  (action: (...args: any[]) => Promise<void>) =>
  async (...args: any[]) => {
    try {
      await ensureServerRunning();
      await action(...args);
    } catch (error) {
      handleError(error);
    }
  };

cli.command('map <file>', 'Map symbols in a file').action(
  withServer(async (file) => {
    const response = await axios.get(`${BASE_URL}/map`, {
      params: { path: file },
    });
    console.log(JSON.stringify(response.data, null, 2));
  }),
);

cli.command('find <query>', 'Find a symbol by query').action(
  withServer(async (query) => {
    const response = await axios.get(`${BASE_URL}/find`, {
      params: { query },
    });
    console.log(JSON.stringify(response.data, null, 2));
  }),
);

cli
  .command('inspect <id>', 'Inspect a symbol by ID')
  .option('--expand <mode>', 'Expansion mode (block, file, none)', {
    default: 'block',
  })
  .action(
    withServer(async (id, options) => {
      const response = await axios.get(`${BASE_URL}/inspect`, {
        params: { id, expand: options.expand },
      });
      console.log(JSON.stringify(response.data, null, 2));
    }),
  );

cli.help();
cli.version('0.1.0');

cli.parse();
