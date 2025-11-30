import { LocationRef, SymbolInfo } from '../domain/entities';
import { InvalidIdError } from '../domain/errors';
import { ILspRepository } from './ports/ILspRepository';

export type FindSymbolResult = LocationRef[];

export class FindSymbolUseCase {
  constructor(private readonly lspRepo: ILspRepository) {}

  async execute(id: string): Promise<FindSymbolResult> {
    const { filePath, line, character } = this.parseId(id);

    // 1. Get Document Symbols to find the exact symbol range
    // This is important because the ID might point to a slightly different location
    // or we want to ensure we have the correct selectionRange for the identifier.
    // Also, we need to construct the 'definition' object.
    let definition: LocationRef = {
      id,
      filePath,
      line,
      character,
      kind: 'Unknown',
      preview: '',
    };

    let searchLine = line;
    let searchChar = character;

    try {
      const symbols = await this.lspRepo.getDocumentSymbols(filePath);
      const match = this.findSymbolContainingPoint(symbols, line, character);

      if (match) {
        definition = {
          id: match.id,
          filePath,
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
      console.warn(`Failed to get document symbols for ${filePath}:`, e);
    }

    // 2. Find references
    const references = await this.lspRepo.getReferences(filePath, searchLine, searchChar);

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

  private parseId(id: string): { filePath: string; line: number; character: number } {
    const parts = id.split(':');
    if (parts.length !== 3) {
      throw new InvalidIdError(id);
    }
    return {
      filePath: parts[0],
      line: parseInt(parts[1], 10),
      character: parseInt(parts[2], 10),
    };
  }

  private findSymbolContainingPoint(
    symbols: SymbolInfo[],
    line: number,
    character: number,
  ): SymbolInfo | undefined {
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
              return childMatch;
            }
          }
          return symbol;
        }
      }
    }
    return undefined;
  }
}
