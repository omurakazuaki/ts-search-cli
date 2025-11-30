import * as cp from 'child_process';
import { Readable, Writable } from 'stream';

export class LspProcessManager {
  private process: cp.ChildProcess | null = null;

  constructor(private readonly serverName: string = 'typescript-language-server') { }

  start(): void {
    if (this.process) {
      return;
    }

    const serverPath = this.resolveServerPath();

    this.process = cp.spawn('node', [serverPath, '--stdio']);

    this.process.on('exit', (code) => {
      this.process = null;
    });

    this.process.stderr?.on('data', (data) => {
      // Log server stderr for debugging
      // In production, might want to pipe to a logger
      console.error(`[LSP Stderr] ${data}`);
    });
  }

  protected resolveServerPath(): string {
    try {
      // Resolve the path to the server executable
      // For typescript-language-server, we need to point to the cli.mjs or similar
      // This might need adjustment based on the exact package structure
      return require.resolve(`${this.serverName}/lib/cli.mjs`);
    } catch (e) {
      throw new Error(`Could not resolve server path for ${this.serverName}: ${e}`);
    }
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
