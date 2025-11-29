import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';

export function getDaemonFilePath(projectRoot: string): string {
  const hash = crypto.createHash('md5').update(projectRoot).digest('hex');
  return path.join(os.tmpdir(), `ts-search-daemon-${hash}.json`);
}
