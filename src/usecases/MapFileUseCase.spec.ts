import { SymbolInfo } from '../domain/entities';
import { MapFileUseCase } from './MapFileUseCase';
import { ILspRepository } from './ports/ILspRepository';

describe('MapFileUseCase', () => {
  let useCase: MapFileUseCase;
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
    useCase = new MapFileUseCase(mockRepo);
  });

  it('should flatten symbol tree', async () => {
    const tree: SymbolInfo[] = [
      {
        id: 'id1',
        name: 'ClassA',
        kind: 'Class',
        line: 1,
        children: [
          {
            id: 'id2',
            name: 'method1',
            kind: 'Method',
            line: 2,
            children: [],
          },
        ],
      },
      {
        id: 'id3',
        name: 'FunctionB',
        kind: 'Function',
        line: 10,
        children: [],
      },
    ];

    mockRepo.getDocumentSymbols.mockResolvedValue(tree);

    const result = await useCase.execute('src/test.ts');

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('ClassA');
    expect(result[1].name).toBe('method1');
    expect(result[2].name).toBe('FunctionB');
    expect(result[0].children).toBeUndefined();
  });
});
