import * as fs from 'fs/promises';
import { PassThrough } from 'stream';
import * as rpc from 'vscode-jsonrpc/node';
import * as lsp from 'vscode-languageserver-protocol';
import { LspProcessManager } from '../../infrastructure/lsp/LspProcessManager';
import { LspRepository } from './LspRepository';

jest.mock('fs/promises');
jest.mock('vscode-jsonrpc/node');
jest.mock('../../infrastructure/lsp/LspProcessManager');

describe('LspRepository', () => {
  let repository: LspRepository;
  let mockProcessManager: jest.Mocked<LspProcessManager>;
  let mockConnection: jest.Mocked<rpc.MessageConnection>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let notificationHandlers: Map<string, (params: any) => void>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    notificationHandlers = new Map();
    mockProcessManager = new LspProcessManager() as jest.Mocked<LspProcessManager>;
    Object.defineProperty(mockProcessManager, 'stdout', {
      get: jest.fn().mockReturnValue(new PassThrough()),
    });
    Object.defineProperty(mockProcessManager, 'stdin', {
      get: jest.fn().mockReturnValue(new PassThrough()),
    });
    mockProcessManager.start = jest.fn();
    mockProcessManager.stop = jest.fn();

    mockConnection = {
      listen: jest.fn(),
      sendRequest: jest.fn().mockResolvedValue(undefined),
      sendNotification: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      onRequest: jest.fn(),
      onNotification: jest.fn(),
    } as unknown as jest.Mocked<rpc.MessageConnection>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockConnection.onNotification as jest.Mock).mockImplementation((method: any, handler: any) => {
      if (typeof method === 'string') {
        notificationHandlers.set(method, handler);
      }
    });

    mockConnection.sendNotification.mockImplementation((method, params) => {
      if (method === 'textDocument/didOpen') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uri = (params as any).textDocument.uri;
        const handler = notificationHandlers.get('textDocument/publishDiagnostics');
        if (handler) {
          handler({ uri, diagnostics: [] });
        } else {
          console.log('Handler for publishDiagnostics not found!');
        }
      }
      return Promise.resolve();
    });

    (rpc.createMessageConnection as jest.Mock).mockReturnValue(mockConnection);

    repository = new LspRepository(mockProcessManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const fastInitialize = async () => {
    const initPromise = repository.initialize();

    // Yield multiple times to allow initialize to reach the setTimeout
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    jest.advanceTimersByTime(10000);

    await initPromise;
  };

  describe('initialize', () => {
    // Remove local beforeEach/afterEach for timers since it's global now

    it('should start process and initialize connection', async () => {
      const initPromise = repository.initialize();

      // Allow async operations to proceed to the point of setTimeout
      // We need to flush promises multiple times to get past all the awaits in initialize
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Fast-forward through the waitForStart (5000ms timeout if not started)
      jest.advanceTimersByTime(5000);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Fast-forward through the buffer (1000ms)
      jest.advanceTimersByTime(1000);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      await initPromise;

      expect(mockProcessManager.start).toHaveBeenCalled();
      expect(rpc.createMessageConnection).toHaveBeenCalled();
      expect(mockConnection.listen).toHaveBeenCalled();
      expect(mockConnection.onRequest).toHaveBeenCalledWith(
        'window/workDoneProgress/create',
        expect.any(Function),
      );
      expect(mockConnection.sendRequest).toHaveBeenCalledWith('initialize', expect.any(Object));
      expect(mockConnection.sendNotification).toHaveBeenCalledWith('initialized', {});
    });

    it('should wait for indexing to complete if progress notification is received', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let progressCallback: ((params: any) => void) | undefined;
      (mockConnection.onNotification as jest.Mock).mockImplementation((method, handler) => {
        if (method === '$/progress') {
          progressCallback = handler;
        }
      });

      const initPromise = repository.initialize();

      // Wait for handler registration
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Trigger 'begin' notification
      if (progressCallback) {
        progressCallback({
          token: '123',
          value: { kind: 'begin', title: 'Initializing JS/TS language features' },
        });
      }

      // Advance time to finish the waitForStart (it checks interval every 100ms)
      jest.advanceTimersByTime(200);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Now it should be waiting for the 'end' notification or 300s timeout.
      // Trigger 'end' notification
      if (progressCallback) {
        progressCallback({
          token: '123',
          value: { kind: 'end' },
        });
      }

      // Advance time for the buffer after indexing (1000ms)
      jest.advanceTimersByTime(1000);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // It should resolve now
      await initPromise;

      expect(mockConnection.onNotification).toHaveBeenCalledWith(
        '$/progress',
        expect.any(Function),
      );
    });

    it('should timeout if indexing takes too long', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let progressCallback: ((params: any) => void) | undefined;
      (mockConnection.onNotification as jest.Mock).mockImplementation((method, handler) => {
        if (method === '$/progress') {
          progressCallback = handler;
        }
      });

      const initPromise = repository.initialize();

      // Trigger 'begin' notification immediately while initialize is paused at first await
      if (progressCallback) {
        progressCallback({
          token: '123',
          value: { kind: 'begin', title: 'Initializing JS/TS language features' },
        });
      }

      // Wait for initialize to reach the timeout check
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Advance time past the 300s timeout
      jest.advanceTimersByTime(300000);

      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Advance buffer
      jest.advanceTimersByTime(1000);

      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      await initPromise;
    });

    it('should not open any documents during initialization', async () => {
      const initPromise = repository.initialize();

      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      jest.advanceTimersByTime(5000);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(1000);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      await initPromise;
      expect(mockConnection.sendNotification).not.toHaveBeenCalledWith(
        'textDocument/didOpen',
        expect.any(Object),
      );
    });
  });

  describe('shutdown', () => {
    it('should dispose connection and stop process', async () => {
      await fastInitialize();
      await repository.shutdown();

      expect(mockConnection.dispose).toHaveBeenCalled();
      expect(mockProcessManager.stop).toHaveBeenCalled();
    });

    it('should handle shutdown when not initialized', async () => {
      await repository.shutdown();
      expect(mockProcessManager.stop).toHaveBeenCalled();
    });
  });

  describe('getDocumentSymbols', () => {
    it('should return symbols', async () => {
      await fastInitialize();
      (fs.readFile as jest.Mock).mockResolvedValue('content');

      const mockSymbols: lsp.DocumentSymbol[] = [
        {
          name: 'Test',
          kind: lsp.SymbolKind.Class,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 0 },
          },
          selectionRange: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 9 },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockSymbols);

      const result = await repository.getDocumentSymbols('src/test.ts');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test');
      expect(result[0].kind).toBe('Class');
    });

    it('should handle nested symbols', async () => {
      await fastInitialize();
      (fs.readFile as jest.Mock).mockResolvedValue('content');

      const mockSymbols: lsp.DocumentSymbol[] = [
        {
          name: 'Parent',
          kind: lsp.SymbolKind.Class,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 0 },
          },
          selectionRange: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 9 },
          },
          children: [
            {
              name: 'Child',
              kind: lsp.SymbolKind.Method,
              range: {
                start: { line: 1, character: 0 },
                end: { line: 2, character: 0 },
              },
              selectionRange: {
                start: { line: 1, character: 5 },
                end: { line: 1, character: 9 },
              },
            },
          ],
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockSymbols);

      const result = await repository.getDocumentSymbols('src/test.ts');

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children![0].name).toBe('Child');
    });

    it('should return empty array if no result', async () => {
      await fastInitialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getDocumentSymbols('src/test.ts');
      expect(result).toEqual([]);
    });

    it('should return empty array if result is not DocumentSymbol[]', async () => {
      await fastInitialize();
      mockConnection.sendRequest.mockResolvedValue([]); // Empty array
      const result = await repository.getDocumentSymbols('src/test.ts');
      expect(result).toEqual([]);
    });

    it('should throw if not connected', async () => {
      await expect(repository.getDocumentSymbols('src/test.ts')).rejects.toThrow(
        'LSP connection not initialized',
      );
    });

    it('should return imports and instantiations from source file', async () => {
      await fastInitialize();
      const fileContent = `
        import { Foo } from './foo';
        import * as Bar from './bar';
        const f = new Foo();
        const b = new Bar.Baz();
      `;
      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);

      mockConnection.sendRequest.mockResolvedValue([]);

      const result = await repository.getDocumentSymbols('src/test.ts');

      expect(result.some((s) => s.name === 'Foo' && s.kind === 'Variable')).toBe(true);
      expect(result.some((s) => s.name === 'Bar' && s.kind === 'Module')).toBe(true);
      expect(result.some((s) => s.name === 'Foo' && s.kind === 'Class')).toBe(true);
      expect(result.some((s) => s.name === 'Bar.Baz' && s.kind === 'Class')).toBe(true);
    });

    it('should proceed if diagnostics are not received within timeout', async () => {
      await fastInitialize();
      (fs.readFile as jest.Mock).mockResolvedValue('content');
      mockConnection.sendRequest.mockResolvedValue([]);

      // Override sendNotification to NOT trigger diagnostics
      mockConnection.sendNotification.mockImplementation(() => Promise.resolve());

      const promise = repository.getDocumentSymbols('src/test.ts');

      // Yield to let openDocument reach setTimeout
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Advance past the 5000ms timeout in openDocument
      jest.advanceTimersByTime(5000);

      await promise;

      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'textDocument/didOpen',
        expect.any(Object),
      );
    });
  });

  describe('getWorkspaceSymbols', () => {
    it('should return symbols', async () => {
      await fastInitialize();
      const mockSymbols: lsp.SymbolInformation[] = [
        {
          name: 'Test',
          kind: lsp.SymbolKind.Class,
          location: {
            uri: 'file:///src/test.ts',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 10, character: 0 },
            },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockSymbols);

      const result = await repository.getWorkspaceSymbols('Test');

      expect(result).toHaveLength(1);
      expect(result[0].preview).toBe('Test');
    });

    it('should return empty array if no result', async () => {
      await fastInitialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getWorkspaceSymbols('Test');
      expect(result).toEqual([]);
    });
  });

  describe('getReferences', () => {
    it('should return references', async () => {
      await fastInitialize();
      const mockLocations: lsp.Location[] = [
        {
          uri: 'file:///src/test.ts',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockLocations);

      const result = await repository.getReferences('src/test.ts', 1, 1);

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe('/src/test.ts');
    });

    it('should return empty array if no result', async () => {
      await fastInitialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getReferences('src/test.ts', 1, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getDefinition', () => {
    it('should return definition', async () => {
      await fastInitialize();
      const mockLocation: lsp.Location = {
        uri: 'file:///src/test.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
      };
      mockConnection.sendRequest.mockResolvedValue(mockLocation);

      const result = await repository.getDefinition('src/test.ts', 1, 1);

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe('/src/test.ts');
    });

    it('should handle array of locations', async () => {
      await fastInitialize();
      const mockLocations: lsp.Location[] = [
        {
          uri: 'file:///src/test.ts',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockLocations);

      const result = await repository.getDefinition('src/test.ts', 1, 1);

      expect(result).toHaveLength(1);
    });

    it('should return empty array if no result', async () => {
      await fastInitialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getDefinition('src/test.ts', 1, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getFoldingRanges', () => {
    it('should return folding ranges', async () => {
      await fastInitialize();
      (fs.readFile as jest.Mock).mockResolvedValue('content');
      const mockRanges: lsp.FoldingRange[] = [
        {
          startLine: 0,
          endLine: 10,
        },
      ];
      mockConnection.sendRequest.mockResolvedValue(mockRanges);

      const result = await repository.getFoldingRanges('src/test.ts');

      expect(result).toHaveLength(1);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(11);
    });

    it('should return empty array if no result', async () => {
      await fastInitialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getFoldingRanges('src/test.ts');
      expect(result).toEqual([]);
    });
  });
});
