import * as fs from 'fs/promises';
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

  beforeEach(() => {
    mockProcessManager = new LspProcessManager() as jest.Mocked<LspProcessManager>;
    Object.defineProperty(mockProcessManager, 'stdout', {
      get: jest.fn().mockReturnValue({} as any),
    });
    Object.defineProperty(mockProcessManager, 'stdin', {
      get: jest.fn().mockReturnValue({} as any),
    });
    mockProcessManager.start = jest.fn();
    mockProcessManager.stop = jest.fn();

    mockConnection = {
      listen: jest.fn(),
      sendRequest: jest.fn(),
      sendNotification: jest.fn(),
      dispose: jest.fn(),
    } as unknown as jest.Mocked<rpc.MessageConnection>;

    (rpc.createMessageConnection as jest.Mock).mockReturnValue(mockConnection);

    repository = new LspRepository(mockProcessManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should start process and initialize connection', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['test.ts']);
      (fs.readFile as jest.Mock).mockResolvedValue('content');

      await repository.initialize();

      expect(mockProcessManager.start).toHaveBeenCalled();
      expect(rpc.createMessageConnection).toHaveBeenCalled();
      expect(mockConnection.listen).toHaveBeenCalled();
      expect(mockConnection.sendRequest).toHaveBeenCalledWith('initialize', expect.any(Object));
      expect(mockConnection.sendNotification).toHaveBeenCalledWith('initialized', {});
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'textDocument/didOpen',
        expect.any(Object),
      );
    });

    it('should handle errors during file opening', async () => {
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('Error'));
      await repository.initialize();
      // Should not throw
    });

    it('should not open document if no ts file found', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['readme.md']);
      await repository.initialize();
      expect(mockConnection.sendNotification).not.toHaveBeenCalledWith(
        'textDocument/didOpen',
        expect.any(Object),
      );
    });
  });

  describe('shutdown', () => {
    it('should dispose connection and stop process', async () => {
      await repository.initialize();
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
      await repository.initialize();
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
      await repository.initialize();
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
      await repository.initialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getDocumentSymbols('src/test.ts');
      expect(result).toEqual([]);
    });

    it('should return empty array if result is not DocumentSymbol[]', async () => {
      await repository.initialize();
      mockConnection.sendRequest.mockResolvedValue([]); // Empty array
      const result = await repository.getDocumentSymbols('src/test.ts');
      expect(result).toEqual([]);
    });

    it('should throw if not connected', async () => {
      await expect(repository.getDocumentSymbols('src/test.ts')).rejects.toThrow(
        'LSP connection not initialized',
      );
    });
  });

  describe('getWorkspaceSymbols', () => {
    it('should return symbols', async () => {
      await repository.initialize();
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
      await repository.initialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getWorkspaceSymbols('Test');
      expect(result).toEqual([]);
    });
  });

  describe('getReferences', () => {
    it('should return references', async () => {
      await repository.initialize();
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
      await repository.initialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getReferences('src/test.ts', 1, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getDefinition', () => {
    it('should return definition', async () => {
      await repository.initialize();
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
      await repository.initialize();
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
      await repository.initialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getDefinition('src/test.ts', 1, 1);
      expect(result).toEqual([]);
    });
  });

  describe('getFoldingRanges', () => {
    it('should return folding ranges', async () => {
      await repository.initialize();
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
      await repository.initialize();
      mockConnection.sendRequest.mockResolvedValue(null);
      const result = await repository.getFoldingRanges('src/test.ts');
      expect(result).toEqual([]);
    });
  });
});
