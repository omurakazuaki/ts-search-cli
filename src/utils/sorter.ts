import { SymbolInfo } from '../domain/entities';

export function compareIds(idA: string, idB: string): number {
  const [fileA, lineA, charA] = parseId(idA);
  const [fileB, lineB, charB] = parseId(idB);

  if (fileA !== fileB) {
    return fileA.localeCompare(fileB);
  }
  if (lineA !== lineB) {
    return lineA - lineB;
  }
  return charA - charB;
}

function parseId(id: string): [string, number, number] {
  const parts = id.split(':');
  // Handle cases where filePath might contain colons (e.g. Windows paths)
  // Assuming the format always ends with :line:character
  if (parts.length < 3) {
    // Fallback if ID format is unexpected
    return [id, 0, 0];
  }

  const charStr = parts.pop()!;
  const lineStr = parts.pop()!;

  const char = parseInt(charStr, 10);
  const line = parseInt(lineStr, 10);

  // If parsing fails, treat as 0
  const safeChar = isNaN(char) ? 0 : char;
  const safeLine = isNaN(line) ? 0 : line;

  const file = parts.join(':');
  return [file, safeLine, safeChar];
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
