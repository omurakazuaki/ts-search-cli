import { LspProcessManager } from './LspProcessManager';

describe('LspProcessManager', () => {
  let manager: LspProcessManager;

  beforeEach(() => {
    manager = new LspProcessManager();
  });

  afterEach(() => {
    manager.stop();
  });

  it('should start and stop the process', () => {
    manager.start();
    expect(() => manager.stdout).not.toThrow();
    expect(() => manager.stdin).not.toThrow();

    manager.stop();
    expect(() => manager.stdout).toThrow();
  });
});
