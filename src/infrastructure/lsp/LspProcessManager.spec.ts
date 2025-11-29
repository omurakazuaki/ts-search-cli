import * as cp from 'child_process';
import { EventEmitter } from 'events';
import { LspProcessManager } from './LspProcessManager';

jest.mock('child_process');

describe('LspProcessManager', () => {
  let manager: LspProcessManager;
  let mockChildProcess: EventEmitter & {
    stdout: EventEmitter;
    stdin: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };

  beforeEach(() => {
    mockChildProcess = new EventEmitter() as unknown as EventEmitter & {
      stdout: EventEmitter;
      stdin: EventEmitter;
      stderr: EventEmitter;
      kill: jest.Mock;
    };
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stdin = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = jest.fn();

    (cp.spawn as jest.Mock).mockReturnValue(mockChildProcess);

    manager = new LspProcessManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should start process if not started', () => {
    manager.start();
    expect(cp.spawn).toHaveBeenCalled();
  });

  it('should not start process if already started', () => {
    manager.start();
    manager.start();
    expect(cp.spawn).toHaveBeenCalledTimes(1);
  });

  it('should throw error if server path cannot be resolved', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(manager as any, 'resolveServerPath').mockImplementation(() => {
      throw new Error('Mock error');
    });
    expect(() => manager.start()).toThrow('Mock error');
  });

  it('should handle process exit', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    manager.start();
    mockChildProcess.emit('exit', 0);

    expect(consoleSpy).toHaveBeenCalledWith('LSP Server exited with code 0');
    // Check if process is null by trying to access stdout, should throw
    expect(() => manager.stdout).toThrow('Process not started');

    consoleSpy.mockRestore();
  });

  it('should throw if accessing stdout/stdin before start', () => {
    expect(() => manager.stdout).toThrow('Process not started');
    expect(() => manager.stdin).toThrow('Process not started');
  });

  it('should stop process', () => {
    manager.start();
    manager.stop();
    expect(mockChildProcess.kill).toHaveBeenCalled();
    expect(() => manager.stdout).toThrow('Process not started');
  });

  it('should do nothing if stop called when not started', () => {
    manager.stop();
    expect(mockChildProcess.kill).not.toHaveBeenCalled();
  });

  it('should handle stderr data', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    manager.start();
    mockChildProcess.stderr.emit('data', 'some error');
    expect(consoleSpy).toHaveBeenCalledWith('[LSP Stderr] some error');
    consoleSpy.mockRestore();
  });

  it('should throw if stdout is missing', () => {
    (cp.spawn as jest.Mock).mockReturnValue({
      on: jest.fn(),
      stderr: { on: jest.fn() },
      stdout: null,
      stdin: new EventEmitter(),
    });
    manager.start();
    expect(() => manager.stdout).toThrow('Process not started');
  });

  it('should throw if stdin is missing', () => {
    (cp.spawn as jest.Mock).mockReturnValue({
      on: jest.fn(),
      stderr: { on: jest.fn() },
      stdout: new EventEmitter(),
      stdin: null,
    });
    manager.start();
    expect(() => manager.stdin).toThrow('Process not started');
  });
});
