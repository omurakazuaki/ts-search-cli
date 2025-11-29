export interface IFileRepository {
  readFile(filePath: string): Promise<string>;
}
