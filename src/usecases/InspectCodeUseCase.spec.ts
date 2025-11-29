import { InspectCodeUseCase } from './InspectCodeUseCase';
import { IFileRepository } from './ports/IFileRepository';
import { ILspRepository } from './ports/ILspRepository';

describe('InspectCodeUseCase', () => {
  let useCase: InspectCodeUseCase;
  let mockLspRepo: jest.Mocked<ILspRepository>;
  let mockFileRepo: jest.Mocked<IFileRepository>;

  beforeEach(() => {
    mockLspRepo = {
      initialize: jest.fn(),
      shutdown: jest.fn(),
      getDocumentSymbols: jest.fn(),
      getWorkspaceSymbols: jest.fn(),
      getReferences: jest.fn(),
      getDefinition: jest.fn(),
      getFoldingRanges: jest.fn(),
    };
    mockFileRepo = {
      readFile: jest.fn(),
    };
    useCase = new InspectCodeUseCase(mockLspRepo, mockFileRepo);
  });

  it('should extract code block when expand is block', async () => {
    const filePath = 'src/test.ts';
    const fileContent = `line 1
line 2
function test() {
  console.log("hello");
}
line 6`;

    mockFileRepo.readFile.mockResolvedValue(fileContent);
    mockLspRepo.getFoldingRanges.mockResolvedValue([
      { startLine: 3, endLine: 5 }, // function block
    ]);

    // ID for line 4 (inside function)
    const id = `${filePath}::4::10`;
    const result = await useCase.execute(id, 'block');

    expect(result.filePath).toBe(filePath);
    expect(result.range).toEqual({ startLine: 3, endLine: 5 });
    expect(result.code).toBe(`function test() {
  console.log("hello");
}`);
  });

  it('should fallback to surround when no block found', async () => {
    const filePath = 'src/test.ts';
    const fileContent = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');

    mockFileRepo.readFile.mockResolvedValue(fileContent);
    mockLspRepo.getFoldingRanges.mockResolvedValue([]);

    const id = `${filePath}::10::1`;
    const result = await useCase.execute(id, 'block');

    expect(result.range).toEqual({ startLine: 5, endLine: 15 });
    expect(result.code.split('\n')).toHaveLength(11); // 5 to 15 is 11 lines
  });
});
