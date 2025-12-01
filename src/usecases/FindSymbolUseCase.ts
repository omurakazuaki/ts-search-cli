import { LocationRef, SymbolInfo } from '../domain/entities';
import { InvalidIdError } from '../domain/errors';
import { SymbolId } from '../domain/SymbolId';
import { ILspRepository } from './ports/ILspRepository';

export type FindSymbolResult = LocationRef[];

export class FindSymbolUseCase {
  constructor(private readonly lspRepo: ILspRepository) {}

  async execute(id: string): Promise<FindSymbolResult> {
    let filePath: string;
    let line: number;
    let character: number;

    try {
      const symbolId = SymbolId.parse(id);
      filePath = symbolId.filePath;
      line = symbolId.line;
      character = symbolId.character;
    } catch {
      throw new InvalidIdError(id);
    }

    // 0. Try to resolve the actual definition location
    let targetFilePath = filePath;
    let targetLine = line;
    let targetChar = character;
    let definitionId = id;

    try {
      const definitions = await this.lspRepo.getDefinition(filePath, line, character);
      if (definitions.length > 0) {
        const def = definitions[0];
        targetFilePath = def.filePath;
        targetLine = def.line;
        targetChar = def.character;
        definitionId = def.id;
      }
    } catch (e) {
      console.warn(`Failed to get definition for ${id}:`, e);
    }

    // 1. Get Document Symbols to find the exact symbol range
    // This is important because the ID might point to a slightly different location
    // or we want to ensure we have the correct selectionRange for the identifier.
    // Also, we need to construct the 'definition' object.
    let definition: LocationRef = {
      id: definitionId,
      filePath: targetFilePath,
      line: targetLine,
      character: targetChar,
      kind: 'Unknown',
      preview: '',
    };

    let searchLine = targetLine;
    let searchChar = targetChar;

    try {
      const symbols = await this.lspRepo.getDocumentSymbols(targetFilePath);
      const match = this.findSymbolContainingPoint(symbols, targetLine, targetChar);

      if (match) {
        definition = {
          id: match.id,
          filePath: targetFilePath,
          line: match.selectionRange?.start.line || match.line,
          character: match.selectionRange?.start.character || 1,
          kind: match.kind,
          preview: match.name,
        };
        // Use the precise selection range for finding references
        if (match.selectionRange) {
          searchLine = match.selectionRange.start.line;
          searchChar = match.selectionRange.start.character;
        }
      }
    } catch (e) {
      // Fallback to using the ID coordinates directly
      console.warn(`Failed to get document symbols for ${targetFilePath}:`, e);
    }

    // 2. Find references
    const references = await this.lspRepo.getReferences(targetFilePath, searchLine, searchChar);

    // 3. Merge definition info into references
    let definitionFound = false;
    const results = references.map((ref) => {
      if (ref.id === definition.id) {
        definitionFound = true;
        return {
          ...ref,
          kind: definition.kind,
          preview: definition.preview,
          role: 'definition' as const,
        };
      }
      return {
        ...ref,
        role: 'reference' as const,
      };
    });

    // If definition was not found in references (should not happen with includeDeclaration: true),
    // we prepend it.
    if (!definitionFound) {
      results.unshift({
        ...definition,
        role: 'definition',
      });
    }

    return results;
  }

  private findSymbolContainingPoint(
    symbols: SymbolInfo[],
    line: number,
    character: number,
  ): SymbolInfo | undefined {
    let bestMatch: SymbolInfo | undefined;
    let minRangeSize = Number.MAX_VALUE;

    for (const symbol of symbols) {
      // Check if the point is within the symbol's range
      if (symbol.range) {
        const start = symbol.range.start;
        const end = symbol.range.end;

        const isAfterStart =
          line > start.line || (line === start.line && character >= start.character);
        const isBeforeEnd = line < end.line || (line === end.line && character <= end.character);

        if (isAfterStart && isBeforeEnd) {
          // Check children first (more specific)
          if (symbol.children) {
            const childMatch = this.findSymbolContainingPoint(symbol.children, line, character);
            if (childMatch) {
              // If a child matches, it's definitely smaller/more specific than the parent
              // But we need to compare it with the current bestMatch from other siblings
              const childSize = this.getRangeSize(childMatch);
              if (childSize < minRangeSize) {
                minRangeSize = childSize;
                bestMatch = childMatch;
              }
              // We found a match in this branch, but we continue to check other siblings
              // in case there's an overlapping sibling with a smaller range (unlikely in proper tree, but possible with our mixed sources)
              continue;
            }
          }

          // If no child matched, check the symbol itself
          const size = this.getRangeSize(symbol);
          if (size < minRangeSize) {
            minRangeSize = size;
            bestMatch = symbol;
          }
        }
      }
    }
    return bestMatch;
  }

  private getRangeSize(symbol: SymbolInfo): number {
    if (!symbol.range) return Number.MAX_VALUE;
    const lines = symbol.range.end.line - symbol.range.start.line;
    const chars = symbol.range.end.character - symbol.range.start.character;
    // Simple heuristic: lines * 10000 + chars
    return lines * 10000 + chars;
  }
}
