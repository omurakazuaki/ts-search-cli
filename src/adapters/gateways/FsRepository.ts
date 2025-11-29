import * as fs from 'fs/promises';
import { IFileRepository } from '../../usecases/ports/IFileRepository';

export class FsRepository implements IFileRepository {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }
}
