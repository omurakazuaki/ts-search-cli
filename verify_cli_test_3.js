const { execSync } = require('child_process');
const fs = require('fs');

const id = '/home/omura/work/2025/11/29/code-semantic-search/src/adapters/gateways/LspRepository.integration.spec.ts::32::11';

try {
  const output = execSync(`npx ts-node src/cli.ts inspect "${id}"`, { encoding: 'utf-8' });
  fs.writeFileSync('cli_result_inspect.txt', output);
} catch (e) {
  const msg = 'Error: ' + e.message + '\nStdout: ' + (e.stdout ? e.stdout.toString() : '') + '\nStderr: ' + (e.stderr ? e.stderr.toString() : '');
  fs.writeFileSync('cli_result_inspect.txt', msg);
}
