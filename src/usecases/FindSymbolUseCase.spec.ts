import { LocationRef } from '../domain/entities';
import { SymbolNotFoundError } from '../domain/errors';
import { FindSymbolUseCase } from './FindSymbolUseCase';
import { ILspRepository } from './ports/ILspRepository';

describe('FindSymbolUseCase', () => {
  let useCase: FindSymbolUseCase;
  let mockRepo: jest.Mocked<ILspRepository>;

  beforeEach(() => {
    mockRepo = {
      initialize: jest.fn(),
      shutdown: jest.fn(),
      getDocumentSymbols: jest.fn(),
      getWorkspaceSymbols: jest.fn(),
      getReferences: jest.fn(),
      getDefinition: jest.fn(),
      getFoldingRanges: jest.fn(),
    };
    useCase = new FindSymbolUseCase(mockRepo);
  });

  it('should return definition and references when symbol is found', async () => {
    const definition: LocationRef = {
      id: 'def-id',
      filePath: 'src/test.ts',
      line: 10,
      character: 5,
      kind: 'Class',
      preview: 'class Test {}',
    };

    const references: LocationRef[] = [
      {
        id: 'ref-id',
        filePath: 'src/main.ts',
        line: 20,
        character: 10,
        kind: 'Variable',
        preview: 'const t = new Test();',
      },
    ];

    mockRepo.getWorkspaceSymbols.mockResolvedValue([definition]);
    mockRepo.getReferences.mockResolvedValue(references);

    const result = await useCase.execute('Test');

    expect(result.definition).toBe(definition);
    expect(result.references).toBe(references);
    expect(mockRepo.getWorkspaceSymbols).toHaveBeenCalledWith('Test');
    expect(mockRepo.getReferences).toHaveBeenCalledWith('src/test.ts', 10, 5);
  });

  it('should throw SymbolNotFoundError when no symbol is found', async () => {
    mockRepo.getWorkspaceSymbols.mockResolvedValue([]);

    await expect(useCase.execute('Unknown')).rejects.toThrow(SymbolNotFoundError);
  });
});
