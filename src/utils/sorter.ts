import { SymbolInfo } from '../domain/entities';
import { SymbolId } from '../domain/SymbolId';

export function compareIds(idA: string, idB: string): number {
  try {
    const symA = SymbolId.parse(idA);
    const symB = SymbolId.parse(idB);
    return symA.compareTo(symB);
  } catch {
    // Fallback for invalid IDs to keep sort stable
    return idA.localeCompare(idB);
  }
}

export function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareIds(a.id, b.id));
}

export function sortSymbolInfo(symbols: SymbolInfo[]): SymbolInfo[] {
  const sorted = sortById(symbols);
  for (const symbol of sorted) {
    if (symbol.children && symbol.children.length > 0) {
      symbol.children = sortSymbolInfo(symbol.children);
    }
  }
  return sorted;
}
