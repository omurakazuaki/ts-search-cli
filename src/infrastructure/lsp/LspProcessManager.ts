import * as cp from 'child_process';
import { Readable, Writable } from 'stream';

export class LspProcessManager {
  private process: cp.ChildProcess | null = null;

  constructor(private readonly serverName: string = 'typescript-language-server') {}

  start(): void {
    if (this.process) {
      return;
    }

    let serverPath: string;
    try {
      // Resolve the path to the server executable
      // For typescript-language-server, we need to point to the cli.mjs or similar
      // This might need adjustment based on the exact package structure
      serverPath = require.resolve(`${this.serverName}/lib/cli.mjs`);
    } catch (e) {
      throw new Error(`Could not resolve server path for ${this.serverName}: ${e}`);
    }

    this.process = cp.spawn('node', [serverPath, '--stdio']);

    this.process.on('exit', (code) => {
      console.log(`LSP Server exited with code ${code}`);
      this.process = null;
    });

    this.process.stderr?.on('data', () => {
      // Log server stderr for debugging
      // In production, might want to pipe to a logger
      // console.error(`[LSP Stderr] ${data}`);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  get stdout(): Readable {
    if (!this.process || !this.process.stdout) {
      throw new Error('Process not started');
    }
    return this.process.stdout;
  }

  get stdin(): Writable {
    if (!this.process || !this.process.stdin) {
      throw new Error('Process not started');
    }
    return this.process.stdin;
  }
}
