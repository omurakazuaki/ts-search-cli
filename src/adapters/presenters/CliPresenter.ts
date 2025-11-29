import Table from 'cli-table3';
import * as path from 'path';
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
      if ('code' in data) {
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
    const hasRole = locations.some((l) => l.role);
    const head = ['File', 'Line', 'Kind', 'Preview', 'ID'];
    if (hasRole) {
      head.unshift('Role');
    }

    const table = new Table({
      head,
      style: { head: ['cyan'] },
      wordWrap: true,
    });

    locations.forEach((loc) => {
      const row = [
        this.toRelativePath(loc.filePath),
        loc.line,
        loc.kind,
        loc.preview?.trim().substring(0, 50) || '',
        loc.id,
      ];
      if (hasRole) {
        row.unshift(loc.role || '');
      }
      table.push(row);
    });

    console.log(table.toString());
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
