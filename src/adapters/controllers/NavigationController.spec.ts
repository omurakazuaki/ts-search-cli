import { FastifyReply, FastifyRequest } from 'fastify';
import { SymbolNotFoundError } from '../../domain/errors';
import { FindSymbolUseCase } from '../../usecases/FindSymbolUseCase';
import { InspectCodeUseCase } from '../../usecases/InspectCodeUseCase';
import { MapFileUseCase } from '../../usecases/MapFileUseCase';
import { NavigationController } from './NavigationController';

describe('NavigationController', () => {
  let controller: NavigationController;
  let mockMapFileUC: jest.Mocked<MapFileUseCase>;
  let mockFindSymbolUC: jest.Mocked<FindSymbolUseCase>;
  let mockInspectCodeUC: jest.Mocked<InspectCodeUseCase>;
  let mockReply: jest.Mocked<FastifyReply>;

  beforeEach(() => {
    mockMapFileUC = { execute: jest.fn() } as unknown as jest.Mocked<MapFileUseCase>;
    mockFindSymbolUC = { execute: jest.fn() } as unknown as jest.Mocked<FindSymbolUseCase>;
    mockInspectCodeUC = { execute: jest.fn() } as unknown as jest.Mocked<InspectCodeUseCase>;

    controller = new NavigationController(mockMapFileUC, mockFindSymbolUC, mockInspectCodeUC);

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<FastifyReply>;
  });

  describe('mapFile', () => {
    it('should return symbols on success', async () => {
      const req = { query: { path: 'src/test.ts' } } as FastifyRequest<{
        Querystring: { path: string };
      }>;
      const symbols = [{ name: 'Test', kind: 'Class', line: 1 }];
      mockMapFileUC.execute.mockResolvedValue(symbols);

      await controller.mapFile(req, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ symbols });
    });

    it('should return 400 if path is missing', async () => {
      const req = { query: {} } as FastifyRequest<{ Querystring: { path: string } }>;
      await controller.mapFile(req, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('find', () => {
    it('should return 404 if symbol not found', async () => {
      const req = { query: { query: 'Unknown' } } as FastifyRequest<{
        Querystring: { query: string };
      }>;
      mockFindSymbolUC.execute.mockRejectedValue(new SymbolNotFoundError('Unknown'));

      await controller.find(req, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Symbol not found: Unknown' });
    });
  });
});
