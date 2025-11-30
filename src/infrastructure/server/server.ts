import fastify, { FastifyInstance } from 'fastify';
import { NavigationController } from '../../adapters/controllers/NavigationController';

export function createServer(controller: NavigationController): FastifyInstance {
  const server = fastify();

  server.get(
    '/map',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            path: { type: 'string', minLength: 1 },
          },
          required: ['path'],
        },
      },
    },
    controller.mapFile.bind(controller),
  );

  server.get(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 1 },
          },
          required: ['query'],
        },
      },
    },
    controller.search.bind(controller),
  );

  server.get(
    '/find',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^.+:\\d+:\\d+$' },
          },
          required: ['id'],
        },
      },
    },
    controller.find.bind(controller),
  );

  server.get(
    '/inspect',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^.+:\\d+:\\d+$' },
            expand: { type: 'string', enum: ['block', 'surround', 'file', 'none'] },
          },
          required: ['id'],
        },
      },
    },
    controller.inspect.bind(controller),
  );
  server.get('/health', async () => ({ status: 'ok' }));
  server.post('/shutdown', async () => {
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 200);
    return { status: 'shutting down' };
  });

  return server;
}
