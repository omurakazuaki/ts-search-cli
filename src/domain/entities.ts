export interface LocationRef {
  id: string; // e.g., "ref::src/index.ts::45::10"
  filePath: string;
  line: number; // 1-based
  character: number; // 1-based
  kind: string; // Function, Class, etc.
  preview: string; // Trimmed line content
}

export interface CodeContext {
  filePath: string;
  range: { startLine: number; endLine: number };
  code: string;
  relatedSymbols: string[];
}

export interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  selectionRange?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  children?: SymbolInfo[];
}
