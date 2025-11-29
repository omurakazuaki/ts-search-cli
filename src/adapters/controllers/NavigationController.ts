import { FastifyReply, FastifyRequest } from 'fastify';
import { AmbiguousSymbolError, SymbolNotFoundError } from '../../domain/errors';
import { FindSymbolUseCase } from '../../usecases/FindSymbolUseCase';
import { InspectCodeUseCase } from '../../usecases/InspectCodeUseCase';
import { MapFileUseCase } from '../../usecases/MapFileUseCase';
import { SearchSymbolUseCase } from '../../usecases/SearchSymbolUseCase';

export class NavigationController {
  constructor(
    private readonly mapFileUC: MapFileUseCase,
    private readonly findSymbolUC: FindSymbolUseCase,
    private readonly inspectCodeUC: InspectCodeUseCase,
    private readonly searchSymbolUC: SearchSymbolUseCase,
  ) {}

  async mapFile(req: FastifyRequest<{ Querystring: { path: string } }>, reply: FastifyReply) {
    const { path } = req.query;
    if (!path) {
      return reply.status(400).send({ error: 'Missing path parameter' });
    }

    try {
      const symbols = await this.mapFileUC.execute(path);
      return reply.send({ symbols });
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async search(req: FastifyRequest<{ Querystring: { query: string } }>, reply: FastifyReply) {
    const { query } = req.query;
    if (!query) {
      return reply.status(400).send({ error: 'Missing query parameter' });
    }

    try {
      const candidates = await this.searchSymbolUC.execute(query);
      return reply.send({ candidates });
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async find(req: FastifyRequest<{ Querystring: { id: string } }>, reply: FastifyReply) {
    const { id } = req.query;
    if (!id) {
      return reply.status(400).send({ error: 'Missing id parameter' });
    }

    try {
      const result = await this.findSymbolUC.execute(id);
      return reply.send(result);
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  async inspect(
    req: FastifyRequest<{ Querystring: { id: string; expand?: 'block' | 'surround' } }>,
    reply: FastifyReply,
  ) {
    const { id, expand } = req.query;
    if (!id) {
      return reply.status(400).send({ error: 'Missing id parameter' });
    }

    try {
      const result = await this.inspectCodeUC.execute(id, expand);
      return reply.send({ result });
    } catch (error) {
      return this.handleError(error, reply);
    }
  }

  private handleError(error: unknown, reply: FastifyReply) {
    console.error(error);
    if (error instanceof SymbolNotFoundError) {
      return reply.status(404).send({ error: error.message });
    }
    if (error instanceof AmbiguousSymbolError) {
      return reply.status(300).send({ error: error.message, candidates: error.candidates });
    }
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}
