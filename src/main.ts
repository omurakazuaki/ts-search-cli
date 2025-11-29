import { NavigationController } from './adapters/controllers/NavigationController';
import { FsRepository } from './adapters/gateways/FsRepository';
import { LspRepository } from './adapters/gateways/LspRepository';
import { LspProcessManager } from './infrastructure/lsp/LspProcessManager';
import { createServer } from './infrastructure/server/server';
import { FindSymbolUseCase } from './usecases/FindSymbolUseCase';
import { InspectCodeUseCase } from './usecases/InspectCodeUseCase';
import { MapFileUseCase } from './usecases/MapFileUseCase';

async function bootstrap() {
  try {
    // 1. Infrastructure (Drivers)
    const lspProcess = new LspProcessManager();
    // Note: We don't start the process here explicitly if LspRepository handles it,
    // but LspRepository.initialize() calls start().

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

    // 4. Controllers
    const controller = new NavigationController(mapFileUC, findSymbolUC, inspectCodeUC);

    // 5. Server
    const server = createServer(controller);
    const port = 3000;

    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${port}`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down...');
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
