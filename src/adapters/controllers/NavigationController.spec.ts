import { FastifyReply, FastifyRequest } from 'fastify';
import { AmbiguousSymbolError, InvalidIdError, SymbolNotFoundError } from '../../domain/errors';
import { FindSymbolUseCase } from '../../usecases/FindSymbolUseCase';
import { InspectCodeUseCase } from '../../usecases/InspectCodeUseCase';
import { MapFileUseCase } from '../../usecases/MapFileUseCase';
import { SearchSymbolUseCase } from '../../usecases/SearchSymbolUseCase';
import { NavigationController } from './NavigationController';

describe('NavigationController', () => {
  let controller: NavigationController;
  let mockMapFileUC: jest.Mocked<MapFileUseCase>;
  let mockFindSymbolUC: jest.Mocked<FindSymbolUseCase>;
  let mockInspectCodeUC: jest.Mocked<InspectCodeUseCase>;
  let mockSearchSymbolUC: jest.Mocked<SearchSymbolUseCase>;
  let mockReply: jest.Mocked<FastifyReply>;

  beforeEach(() => {
    mockMapFileUC = { execute: jest.fn() } as unknown as jest.Mocked<MapFileUseCase>;
    mockFindSymbolUC = { execute: jest.fn() } as unknown as jest.Mocked<FindSymbolUseCase>;
    mockInspectCodeUC = { execute: jest.fn() } as unknown as jest.Mocked<InspectCodeUseCase>;
    mockSearchSymbolUC = { execute: jest.fn() } as unknown as jest.Mocked<SearchSymbolUseCase>;

    controller = new NavigationController(
      mockMapFileUC,
      mockFindSymbolUC,
      mockInspectCodeUC,
      mockSearchSymbolUC,
    );

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<FastifyReply>;

    // Silence console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('mapFile', () => {
    it('should return symbols on success', async () => {
      const req = { query: { path: 'src/test.ts' } } as FastifyRequest<{
        Querystring: { path: string };
      }>;
      const symbols = [{ id: 'id1', name: 'Test', kind: 'Class', line: 1 }];
      mockMapFileUC.execute.mockResolvedValue(symbols);

      await controller.mapFile(req, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ symbols });
    });

    it('should handle generic errors', async () => {
      const req = { query: { path: 'src/test.ts' } } as FastifyRequest<{
        Querystring: { path: string };
      }>;
      mockMapFileUC.execute.mockRejectedValue(new Error('Something went wrong'));

      await controller.mapFile(req, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Internal Server Error' });
    });
  });

  describe('search', () => {
    it('should return candidates on success', async () => {
      const req = { query: { query: 'Test' } } as FastifyRequest<{
        Querystring: { query: string };
      }>;
      const candidates = [
        {
          id: 'id1',
          name: 'Test',
          kind: 'Class',
          line: 1,
          filePath: 'src/test.ts',
          character: 1,
          preview: 'class Test',
        },
      ];
      mockSearchSymbolUC.execute.mockResolvedValue(candidates);

      await controller.search(req, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ candidates });
    });

    it('should handle errors', async () => {
      const req = { query: { query: 'Test' } } as FastifyRequest<{
        Querystring: { query: string };
      }>;
      mockSearchSymbolUC.execute.mockRejectedValue(new Error('Error'));
      await controller.search(req, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('find', () => {
    it('should return result on success', async () => {
      const req = { query: { id: 'id1' } } as FastifyRequest<{
        Querystring: { id: string };
      }>;
      const result = [
        {
          id: 'id1',
          filePath: 'f',
          line: 1,
          character: 1,
          kind: 'k',
          preview: 'p',
          role: 'definition' as const,
        },
      ];
      mockFindSymbolUC.execute.mockResolvedValue(result);

      await controller.find(req, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(result);
    });

    it('should return 404 if symbol not found', async () => {
      const req = { query: { id: 'Unknown' } } as FastifyRequest<{
        Querystring: { id: string };
      }>;
      mockFindSymbolUC.execute.mockRejectedValue(new SymbolNotFoundError('Unknown'));

      await controller.find(req, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Symbol not found: Unknown' });
    });

    it('should return 300 if symbol is ambiguous', async () => {
      const req = { query: { id: 'Ambiguous' } } as FastifyRequest<{
        Querystring: { id: string };
      }>;
      const candidates = [
        {
          id: 'id1',
          name: 'Test',
          kind: 'Class',
          line: 1,
          filePath: 'src/test.ts',
          character: 1,
          preview: 'class Test',
        },
      ];
      mockFindSymbolUC.execute.mockRejectedValue(new AmbiguousSymbolError('Ambiguous', candidates));

      await controller.find(req, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(300);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Multiple symbols found for: Ambiguous',
        candidates,
      });
    });

    it('should return 400 if id is invalid', async () => {
      const req = { query: { id: 'Invalid' } } as FastifyRequest<{
        Querystring: { id: string };
      }>;
      mockFindSymbolUC.execute.mockRejectedValue(new InvalidIdError('Invalid'));

      await controller.find(req, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid ID format: Invalid' });
    });
  });

  describe('inspect', () => {
    it('should return result on success', async () => {
      const req = { query: { id: 'id1' } } as FastifyRequest<{
        Querystring: { id: string; expand?: 'block' | 'surround' };
      }>;
      const result = {
        filePath: 'f',
        range: { startLine: 1, endLine: 2 },
        code: 'code',
        relatedSymbols: [],
      };
      mockInspectCodeUC.execute.mockResolvedValue(result);

      await controller.inspect(req, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ result });
    });

    it('should handle errors', async () => {
      const req = { query: { id: 'id1' } } as FastifyRequest<{
        Querystring: { id: string };
      }>;
      mockInspectCodeUC.execute.mockRejectedValue(new Error('Error'));
      await controller.inspect(req, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});
