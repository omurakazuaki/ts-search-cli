const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('npx ts-node src/cli.ts find LocationRef', { encoding: 'utf-8' });
  fs.writeFileSync('cli_result_find.txt', output);
} catch (e) {
  const msg = 'Error: ' + e.message + '\nStdout: ' + (e.stdout ? e.stdout.toString() : '') + '\nStderr: ' + (e.stderr ? e.stderr.toString() : '');
  fs.writeFileSync('cli_result_find.txt', msg);
}
