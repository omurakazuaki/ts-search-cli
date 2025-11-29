#!/usr/bin/env node
console.log('Starting CLI...');
import cac from 'cac';
import axios from 'axios';

const cli = cac('code-nav');
const BASE_URL = 'http://localhost:3000';

function handleError(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    console.error(`Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error('Unknown error occurred');
  }
  process.exit(1);
}

cli.command('map <file>', 'Map symbols in a file').action(async (file) => {
  try {
    const response = await axios.get(`${BASE_URL}/map`, {
      params: { path: file },
    });
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    handleError(error);
  }
});

cli.command('find <query>', 'Find a symbol by query').action(async (query) => {
  try {
    const response = await axios.get(`${BASE_URL}/find`, {
      params: { query },
    });
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    handleError(error);
  }
});

cli
  .command('inspect <id>', 'Inspect a symbol by ID')
  .option('--expand <mode>', 'Expansion mode (block, file, none)', {
    default: 'block',
  })
  .action(async (id, options) => {
    try {
      const response = await axios.get(`${BASE_URL}/inspect`, {
        params: { id, expand: options.expand },
      });
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

cli.help();
cli.version('0.1.0');

cli.parse();
