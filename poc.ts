import * as cp from 'child_process';
import * as path from 'path';
import * as rpc from 'vscode-jsonrpc/node';

/**
 * Phase 0: LSP Connection Proof of Concept
 * 目的: typescript-language-server を起動し、initialize リクエストへの応答を確認する。
 */
async function run() {
  console.log('--- Starting Phase 0 PoC ---');

  // 1. サーバー実行パスの解決
  // node_modules 内の typescript-language-server の CLI スクリプトを探す
  let serverPath: string;
  try {
    serverPath = require.resolve('typescript-language-server/lib/cli.mjs');
    console.log(`[Client] Server path resolved: ${serverPath}`);
  } catch (e) {
    console.error(e);
    console.error(
      "[Client] Error: Could not find 'typescript-language-server'. Did you run 'npm install'?",
    );
    process.exit(1);
  }

  // 2. 子プロセス(LSP Server)の起動
  // --stdio フラグが必須。これにより標準入出力でJSON-RPCを話すモードになる。
  console.log('[Client] Spawning server process...');
  const childProcess = cp.spawn('node', [serverPath, '--stdio']);

  // 子プロセスのstderrはデバッグ情報の宝庫なので、親のstderrに流す
  childProcess.stderr.on('data', (data) => {
    console.error(`[Server Log] ${data.toString().trim()}`);
  });

  childProcess.on('exit', (code) => {
    console.log(`[Client] Server exited with code ${code}`);
  });

  // 3. JSON-RPC 通信路の確立
  // StreamMessageReader/Writer が Content-Length ヘッダの処理などを隠蔽してくれる
  const connection = rpc.createMessageConnection(
    new rpc.StreamMessageReader(childProcess.stdout),
    new rpc.StreamMessageWriter(childProcess.stdin),
  );

  connection.listen();
  console.log('[Client] Connection established. Listening...');

  // 4. Initialize リクエストの送信
  // LSPの仕様上、最初に必ず initialize を送らなければならない。
  const rootPath = path.resolve(process.cwd());
  const initParams = {
    processId: process.pid,
    rootUri: `file://${rootPath}`,
    capabilities: {
      // 最低限の capabilities を宣言しないとサーバーがクラッシュする場合がある
      textDocument: {
        definition: { dynamicRegistration: false },
        references: { dynamicRegistration: false },
        documentSymbol: { dynamicRegistration: false },
      },
      workspace: {
        symbol: { dynamicRegistration: false },
      },
    },
    workspaceFolders: [
      {
        uri: `file://${rootPath}`,
        name: 'root',
      },
    ],
  };

  console.log("[Client] Sending 'initialize' request...");

  try {
    const result = await connection.sendRequest('initialize', initParams);

    // 5. 結果の検証
    console.log('\n--- Initialize Result ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('-------------------------');

    if ((result as any).capabilities) {
      console.log('\n[Success] Server responded with capabilities!');
      console.log('[Success] Phase 0 Complete. The Bridge is ready to be built.');
    } else {
      console.error('\n[Failure] Server responded, but capabilities are missing.');
    }
  } catch (error) {
    console.error('\n[Failure] Error during initialize handshake:', error);
  } finally {
    // 終了処理
    connection.dispose();
    childProcess.kill();
  }
}

run().catch(console.error);
