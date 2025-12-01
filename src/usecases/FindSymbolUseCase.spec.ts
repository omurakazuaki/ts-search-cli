import { LocationRef, SymbolInfo } from '../domain/entities';
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
      getDefinition: jest.fn().mockResolvedValue([]),
      getFoldingRanges: jest.fn(),
    };
    useCase = new FindSymbolUseCase(mockRepo);
  });

  it('should return definition and references when symbol is found', async () => {
    const references: LocationRef[] = [
      {
        id: 'ref-id',
        filePath: 'src/main.ts',
        line: 20,
        character: 10,
        kind: 'Variable',
        preview: 'const t = new Test();',
      },
      {
        id: 'src/test.ts:10:5',
        filePath: 'src/test.ts',
        line: 10,
        character: 5,
        kind: 'Reference',
        preview: '',
      },
    ];

    // Mock getDocumentSymbols to return a symbol that matches the ID
    mockRepo.getDocumentSymbols.mockResolvedValue([
      {
        id: 'src/test.ts:10:5',
        name: 'Test',
        kind: 'Class',
        line: 10,
        range: {
          start: { line: 10, character: 1 },
          end: { line: 10, character: 20 },
        },
        selectionRange: {
          start: { line: 10, character: 5 },
          end: { line: 10, character: 9 },
        },
      },
    ]);
    mockRepo.getReferences.mockResolvedValue(references);

    const result = await useCase.execute('src/test.ts:10:5');

    expect(result).toHaveLength(2);
    const def = result.find((r) => r.role === 'definition');
    const ref = result.find((r) => r.role === 'reference');

    expect(def).toBeDefined();
    expect(def?.id).toBe('src/test.ts:10:5');
    expect(def?.kind).toBe('Class'); // Should be updated from symbol info

    expect(ref).toBeDefined();
    expect(ref?.id).toBe('ref-id');

    expect(mockRepo.getDocumentSymbols).toHaveBeenCalledWith('src/test.ts');
    expect(mockRepo.getReferences).toHaveBeenCalledWith('src/test.ts', 10, 5);
  });

  it('should throw Error when ID format is invalid', async () => {
    await expect(useCase.execute('InvalidID')).rejects.toThrow('Invalid ID format');
  });

  it('should find nested symbol', async () => {
    const nestedSymbol: SymbolInfo = {
      id: 'nested',
      name: 'Child',
      kind: 'Method',
      line: 12,
      range: { start: { line: 12, character: 1 }, end: { line: 12, character: 20 } },
      selectionRange: { start: { line: 12, character: 5 }, end: { line: 12, character: 10 } },
    };

    mockRepo.getDocumentSymbols.mockResolvedValue([
      {
        id: 'parent',
        name: 'Parent',
        kind: 'Class',
        line: 10,
        range: {
          start: { line: 10, character: 1 },
          end: { line: 20, character: 1 },
        },
        selectionRange: {
          start: { line: 10, character: 5 },
          end: { line: 10, character: 11 },
        },
        children: [nestedSymbol],
      },
    ]);
    mockRepo.getReferences.mockResolvedValue([]);

    const result = await useCase.execute('src/test.ts:12:5');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('nested');
    expect(result[0].role).toBe('definition');
  });

  it('should resolve definition location before finding references', async () => {
    // Input ID points to a usage (reference)
    const inputId = 'src/usage.ts:5:10';

    // getDefinition returns the actual definition
    mockRepo.getDefinition.mockResolvedValue([
      {
        id: 'src/def.ts:10:5',
        filePath: 'src/def.ts',
        line: 10,
        character: 5,
        kind: 'Class',
        preview: 'class Test {}',
      },
    ]);

    // getDocumentSymbols on the definition file returns the symbol info
    mockRepo.getDocumentSymbols.mockResolvedValue([
      {
        id: 'src/def.ts:10:5',
        name: 'Test',
        kind: 'Class',
        line: 10,
        range: { start: { line: 10, character: 1 }, end: { line: 10, character: 20 } },
        selectionRange: { start: { line: 10, character: 5 }, end: { line: 10, character: 9 } },
      },
    ]);

    // getReferences returns both definition and usage
    mockRepo.getReferences.mockResolvedValue([
      {
        id: 'src/def.ts:10:5',
        filePath: 'src/def.ts',
        line: 10,
        character: 5,
        kind: 'Reference',
        preview: '',
      },
      {
        id: 'src/usage.ts:5:10',
        filePath: 'src/usage.ts',
        line: 5,
        character: 10,
        kind: 'Reference',
        preview: '',
      },
    ]);

    const result = await useCase.execute(inputId);

    expect(mockRepo.getDefinition).toHaveBeenCalledWith('src/usage.ts', 5, 10);
    expect(mockRepo.getDocumentSymbols).toHaveBeenCalledWith('src/def.ts');
    expect(mockRepo.getReferences).toHaveBeenCalledWith('src/def.ts', 10, 5);

    const def = result.find((r) => r.role === 'definition');
    const ref = result.find((r) => r.role === 'reference');

    expect(def).toBeDefined();
    expect(def?.id).toBe('src/def.ts:10:5');
    expect(def?.filePath).toBe('src/def.ts');

    expect(ref).toBeDefined();
    expect(ref?.id).toBe('src/usage.ts:5:10');
  });
});
