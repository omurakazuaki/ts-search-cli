import * as path from 'path';
import { LspProcessManager } from '../../infrastructure/lsp/LspProcessManager';
import { LspRepository } from './LspRepository';

// Increase timeout for integration tests involving process spawning
jest.setTimeout(10000);

describe('LspRepository Integration', () => {
  let repository: LspRepository;
  let processManager: LspProcessManager;

  beforeAll(async () => {
    processManager = new LspProcessManager();
    repository = new LspRepository(processManager);
    await repository.initialize();
    // Wait for server to initialize and index
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await repository.shutdown();
  });

  it('should get document symbols from a real file', async () => {
    const filePath = path.resolve('src/domain/entities.ts');
    const symbols = await repository.getDocumentSymbols(filePath);

    expect(symbols).toBeDefined();
    expect(symbols.length).toBeGreaterThan(0);

    // Check for known symbols in entities.ts
    const locationRef = symbols.find((s) => s.name === 'LocationRef');
    expect(locationRef).toBeDefined();
    expect(locationRef?.kind).toBe('Interface');
  });

  it('should find workspace symbols', async () => {
    // Search for "LocationRef" which we know exists
    const results = await repository.getWorkspaceSymbols('LocationRef');

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].preview).toContain('LocationRef'); // Wait, LocationRef doesn't have name property directly in my interface?
    // Ah, LocationRef has 'preview' which I mapped to name in LspRepository.ts
    // Let's check the interface again.
    // LocationRef: id, filePath, line, character, kind, preview.
    // In LspRepository.ts: preview: symbol.name

    expect(results[0].preview).toBe('LocationRef');
  });
});
