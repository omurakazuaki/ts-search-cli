import { execSync } from 'child_process';
import * as fs from 'fs';

try {
  console.log('Running CLI test...');
  const output = execSync('npx ts-node src/cli.ts map src/domain/entities.ts', { encoding: 'utf-8' });
  fs.writeFileSync('cli_result.txt', output);
  console.log('Done.');
} catch (e: any) {
  const msg = 'Error: ' + e.message + '\nStdout: ' + e.stdout?.toString() + '\nStderr: ' + e.stderr?.toString();
  fs.writeFileSync('cli_result.txt', msg);
  console.error(msg);
}
