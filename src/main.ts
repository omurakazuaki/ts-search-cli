import * as fs from 'fs/promises';
import * as path from 'path';
import * as portfinder from 'portfinder';
import { NavigationController } from './adapters/controllers/NavigationController';
import { FsRepository } from './adapters/gateways/FsRepository';
import { LspRepository } from './adapters/gateways/LspRepository';
import { LspProcessManager } from './infrastructure/lsp/LspProcessManager';
import { createServer } from './infrastructure/server/server';
import { FindSymbolUseCase } from './usecases/FindSymbolUseCase';
import { InspectCodeUseCase } from './usecases/InspectCodeUseCase';
import { MapFileUseCase } from './usecases/MapFileUseCase';
import { SearchSymbolUseCase } from './usecases/SearchSymbolUseCase';

const DAEMON_FILE = '.ts-search-daemon.json';

async function bootstrap() {
  try {
    // 1. Infrastructure (Drivers)
    const lspProcess = new LspProcessManager();

    // 2. Adapters (Interface Adapters)
    const lspRepo = new LspRepository(lspProcess);
    const fsRepo = new FsRepository();

    // Initialize LSP connection
    console.log('Initializing LSP...');
    await lspRepo.initialize();
    console.log('LSP Initialized.');

    // 3. UseCases (Application Business Rules)
    const mapFileUC = new MapFileUseCase(lspRepo);
    const findSymbolUC = new FindSymbolUseCase(lspRepo);
    const inspectCodeUC = new InspectCodeUseCase(lspRepo, fsRepo);
    const searchSymbolUC = new SearchSymbolUseCase(lspRepo);

    // 4. Controllers
    const controller = new NavigationController(
      mapFileUC,
      findSymbolUC,
      inspectCodeUC,
      searchSymbolUC,
    );

    // 5. Server
    const server = createServer(controller);

    // Find a free port
    const port = await portfinder.getPortPromise({ port: 30000 });

    await server.listen({ port, host: '127.0.0.1' });
    console.log(`Server listening on http://localhost:${port}`);

    // Write daemon info
    const daemonInfo = { port, pid: process.pid };
    await fs.writeFile(path.resolve(process.cwd(), DAEMON_FILE), JSON.stringify(daemonInfo));

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down...');
      try {
        await fs.unlink(path.resolve(process.cwd(), DAEMON_FILE));
      } catch {
        // Ignore if file already gone
      }
      await server.close();
      await lspRepo.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
