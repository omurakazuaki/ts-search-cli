import * as path from 'path';
import Table from 'cli-table3';
import { CodeContext, LocationRef, SymbolInfo } from '../../domain/entities';

export class CliPresenter {
  private toRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath);
  }

  public present(data: unknown, options: { table?: boolean }): void {
    if (!options.table) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log('No results found.');
        return;
      }
      const first = data[0];
      if (this.isSymbolInfo(first)) {
        this.renderSymbolTable(data as SymbolInfo[]);
      } else if (this.isLocationRef(first)) {
        this.renderLocationTable(data as LocationRef[]);
      } else {
        console.table(data);
      }
    } else if (typeof data === 'object' && data !== null) {
      if ('definition' in data && 'references' in data) {
        this.renderFindResult(data as { definition: LocationRef; references: LocationRef[] });
      } else if ('code' in data) {
        this.renderInspectResult(data as CodeContext);
      } else {
        console.table([data]);
      }
    } else {
      console.log(data);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isSymbolInfo(item: any): item is SymbolInfo {
    return typeof item === 'object' && item !== null && 'name' in item && 'kind' in item;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isLocationRef(item: any): item is LocationRef {
    return typeof item === 'object' && item !== null && 'filePath' in item && 'line' in item;
  }

  private renderSymbolTable(symbols: SymbolInfo[]): void {
    const table = new Table({
      head: ['Name', 'Kind', 'Line', 'ID'],
      style: { head: ['cyan'] },
    });

    const rows = this.flattenSymbols(symbols);
    rows.forEach((row) => {
      table.push([row.Name, row.Kind, row.Line, row.ID]);
    });

    console.log(table.toString());
  }

  private flattenSymbols(
    symbols: SymbolInfo[],
    depth = 0,
  ): { Name: string; Kind: string; Line: number; ID: string }[] {
    let result: { Name: string; Kind: string; Line: number; ID: string }[] = [];
    for (const s of symbols) {
      const indent = '  '.repeat(depth);
      result.push({
        Name: indent + s.name,
        Kind: s.kind,
        Line: s.line,
        ID: s.id,
      });
      if (s.children) {
        result = result.concat(this.flattenSymbols(s.children, depth + 1));
      }
    }
    return result;
  }

  private renderLocationTable(locations: LocationRef[]): void {
    const table = new Table({
      head: ['File', 'Line', 'Kind', 'Preview', 'ID'],
      style: { head: ['cyan'] },
      wordWrap: true,
    });

    locations.forEach((loc) => {
      table.push([
        this.toRelativePath(loc.filePath),
        loc.line,
        loc.kind,
        loc.preview?.trim().substring(0, 50) || '',
        loc.id,
      ]);
    });

    console.log(table.toString());
  }

  private renderFindResult(result: { definition: LocationRef; references: LocationRef[] }): void {
    console.log('\nDefinition:');
    const defTable = new Table({
      head: ['File', 'Line', 'Kind', 'Preview', 'ID'],
      style: { head: ['cyan'] },
    });
    const def = result.definition;
    defTable.push([
      this.toRelativePath(def.filePath),
      def.line,
      def.kind,
      def.preview?.trim().substring(0, 50) || '',
      def.id,
    ]);
    console.log(defTable.toString());

    console.log('\nReferences:');
    if (result.references.length > 0) {
      this.renderLocationTable(result.references);
    } else {
      console.log('No references found.');
    }
  }

  private renderInspectResult(result: CodeContext): void {
    console.log('\nMetadata:');
    const table = new Table({
      head: ['File', 'Range', 'Related Symbols'],
      style: { head: ['cyan'] },
    });
    table.push([
      this.toRelativePath(result.filePath),
      `${result.range.startLine}-${result.range.endLine}`,
      result.relatedSymbols?.length || 0,
    ]);
    console.log(table.toString());

    console.log('\nCode:');
    console.log('---------------------------------------------------');
    console.log(result.code);
    console.log('---------------------------------------------------');
  }
}
