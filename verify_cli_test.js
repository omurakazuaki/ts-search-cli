const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('npx ts-node src/cli.ts map src/domain/entities.ts', { encoding: 'utf-8' });
  fs.writeFileSync('cli_result.txt', output);
} catch (e) {
  const msg = 'Error: ' + e.message + '\nStdout: ' + (e.stdout ? e.stdout.toString() : '') + '\nStderr: ' + (e.stderr ? e.stderr.toString() : '');
  fs.writeFileSync('cli_result.txt', msg);
}
