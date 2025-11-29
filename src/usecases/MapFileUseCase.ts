import { SymbolInfo } from '../domain/entities';
import { ILspRepository } from './ports/ILspRepository';

export class MapFileUseCase {
  constructor(private readonly lspRepo: ILspRepository) {}

  async execute(filePath: string): Promise<SymbolInfo[]> {
    const tree = await this.lspRepo.getDocumentSymbols(filePath);
    return this.flattenSymbols(tree);
  }

  private flattenSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
    const result: SymbolInfo[] = [];

    for (const symbol of symbols) {
      // Create a copy without children for the flat list
      const { children, ...flatSymbol } = symbol;
      result.push(flatSymbol as SymbolInfo);

      if (children && children.length > 0) {
        result.push(...this.flattenSymbols(children));
      }
    }

    return result;
  }
}
