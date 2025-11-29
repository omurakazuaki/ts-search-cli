import fastify, { FastifyInstance } from 'fastify';
import { NavigationController } from '../../adapters/controllers/NavigationController';

export function createServer(controller: NavigationController): FastifyInstance {
  const server = fastify();

  server.get('/map', controller.mapFile.bind(controller));
  server.get('/find', controller.find.bind(controller));
  server.get('/inspect', controller.inspect.bind(controller));
  server.get('/health', async () => ({ status: 'ok' }));
  server.post('/shutdown', async () => {
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 200);
    return { status: 'shutting down' };
  });

  return server;
}
