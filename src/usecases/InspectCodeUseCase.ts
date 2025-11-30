import { CodeContext } from '../domain/entities';
import { InvalidIdError } from '../domain/errors';
import { SymbolId } from '../domain/SymbolId';
import { IFileRepository } from './ports/IFileRepository';
import { ILspRepository } from './ports/ILspRepository';

export class InspectCodeUseCase {
  constructor(
    private readonly lspRepo: ILspRepository,
    private readonly fileRepo: IFileRepository,
  ) {}

  async execute(targetId: string, expand: 'block' | 'surround' = 'surround'): Promise<CodeContext> {
    let filePath: string;
    let line: number;

    try {
      const symbolId = SymbolId.parse(targetId);
      filePath = symbolId.filePath;
      line = symbolId.line;
    } catch {
      throw new InvalidIdError(targetId);
    }

    const fileContent = await this.fileRepo.readFile(filePath);
    const lines = fileContent.split('\n');

    let startLine = line;
    let endLine = line;

    if (expand === 'block') {
      const ranges = await this.lspRepo.getFoldingRanges(filePath);
      // Find smallest range containing the line
      // Folding ranges are 0-based usually in LSP, but let's assume repository returns 1-based or we handle it.
      // LSP FoldingRange: startLine, endLine (0-based).
      // My domain entities use 1-based line numbers usually (LocationRef).
      // Let's assume repository converts to 1-based for consistency, or I check the implementation.
      // The requirement says "LocationRef... line: number; // 1-based".
      // So let's assume 1-based everywhere in Domain/UseCase.

      let bestRange: { startLine: number; endLine: number } | null = null;

      for (const range of ranges) {
        if (range.startLine <= line && range.endLine >= line) {
          if (
            !bestRange ||
            range.endLine - range.startLine < bestRange.endLine - bestRange.startLine
          ) {
            bestRange = range;
          }
        }
      }

      if (bestRange) {
        startLine = bestRange.startLine;
        endLine = bestRange.endLine;
      } else {
        // Fallback to surround if no block found
        startLine = Math.max(1, line - 5);
        endLine = Math.min(lines.length, line + 5);
      }
    } else {
      // Surround
      startLine = Math.max(1, line - 5);
      endLine = Math.min(lines.length, line + 5);
    }

    // Extract code
    // lines array is 0-indexed, so line 1 is at index 0.
    const code = lines.slice(startLine - 1, endLine).join('\n');

    return {
      filePath,
      range: { startLine, endLine },
      code,
      relatedSymbols: [], // TODO: Implement related symbols extraction if needed
    };
  }
}
