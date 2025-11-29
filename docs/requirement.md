# エージェント指向コードナビゲーションツール (LSP-Bridge) 実装仕様書

## 1. プロジェクト概要

- 目的: コーディングエージェント（LLM）が、少ないトークン消費で正確にコードベースを把握するための CLI ツールを提供する。
- 核心技術: typescript-language-server をバックエンドに採用し、IDE と同等の解析精度を担保する。
- アーキテクチャ: "LSP Bridge Pattern"（常駐デーモン + 軽量 CLI クライアント）を採用し、レイテンシを最小化する。
- Clean Architecture の原則に従い、CLI, Daemon, LSP Server の責務を明確に分離する。

## 2. システムアーキテクチャ

システムは大きく分けて「命令を出す CLI」と「解析を行うデーモン」の 2 つに分離します。

### 2.1 コンポーネント構成

#### Client (CLI Entrypoint)

ユーザー/エージェントが実行するコマンド（例: cn search User）。

- 役割: 引数のパース、Daemon への JSON リクエスト送信、結果の標準出力への表示。
- 特性: ステートレス。起動 → 通信 → 終了が瞬時に行われる。

#### Daemon (Background Service)

ローカルサーバー（HTTP または Unix Socket）として常駐。

- 役割: LSP サーバー(typescript-language-server)のサブプロセス管理。JSON-RPC による LSP との通信仲介。ファイルシステムからのコード抽出（Snippet extraction）。
- 状態: プロジェクトのインデックス情報をメモリに保持し続ける。

#### LSP Server (Existing Tool)

- 実体: typescript-language-server (node module)。
- 役割: TypeScript コードの解析、定義・参照の計算。

## 3. インターフェイス仕様 (JSON-API)

CLI と Daemon 間の通信、およびエージェントへの出力は以下の JSON フォーマットで統一する。

### 3.1 共通データ型

LocationRef (軽量参照)
検索結果の一覧表示用。コード本体は含まない。

```TypeScript
interface LocationRef {
  id: string; // 一意な ID (例: "ref::src/index.ts::45::10")
  filePath: string; // プロジェクトルート相対パス
  line: number; // 1-based 行番号
  character: number; // 1-based 文字位置
  kind: string; // シンボル種別 (Function, Class, etc.)
  preview: string; // 該当行のトリミング (最大 100 文字)
}
```

CodeContext (詳細コンテキスト)
詳細取得用。

```TypeScript
interface CodeContext {
  filePath: string;
  range: { startLine: number; endLine: number };
  code: string; // 実際のコードブロック
  relatedSymbols: string[]; // コード内に含まれる他の識別子（次の検索候補）
}
```

### 3.2 コマンド一覧

#### A. map_file (ファイル地図)

指定ファイルの構造（アウトライン）を取得する。

- Params:
  - filePath: string (例: "src/user.ts")
- Returns: { "symbols": [{ "name": "User", "kind": "Class", "line": 10 }, ...] }

#### B. find (検索)

シンボル名から定義または参照を探す。

- Params:
  - query: string (検索したいシンボル名)
- Returns: { "definition": LocationRef, "references": LocationRef[] }

#### C. inspect (詳細)

ID を指定してコードを取得する。

- Params:
  - targetId: string (find で取得した ID)
  - expand: "block" (関数全体など) | "surround" (前後 5 行)
- Returns: { "result": CodeContext }

#### D. lifecycle (管理)

- start: デーモン起動・初期化。
- stop: デーモン停止。
- status: 現在の状態確認。

## 4. 内部ロジック仕様 (Mapping to LSP)

Daemon が受け取ったコマンドをどう LSP メソッドに変換するか、ここが実装の肝です。

### 4.1 初期化プロセス (start)

typescript-language-server --stdio を spawn する。
initialize リクエストを送信（rootUri に現在のディレクトリを指定）。
initialized 通知を送信。

これで LSP はバックグラウンドで全ファイルのインデックス作成を開始する。

### 4.2 map_file の処理

LSP Method: textDocument/documentSymbol

処理:

1. textDocument/didOpen を送信（念のためファイルを最新状態として認識させる）。
2. documentSymbol をリクエスト。
3. 返ってきた階層構造（Tree）をフラットなリストに変換して返す。

### 4.3 find の処理 (最重要・高難易度)

LSP の findReferences は「位置（行・列）」引数を要求しますが、ユーザー入力は「名前（文字列）」です。ここを埋めるロジックが必要です。

1. 名前解決
   - LSP Method: workspace/symbol
   - 入力された query 文字列でプロジェクト全体を検索し、候補となる Location を取得する。
   - 候補が複数ある場合（同名のクラスと変数など）、一旦「候補リスト」を返すか、heuristic に一番近いものを選ぶ（v1 ではリストの一番上を採用で良い）。
2. 検索実行
   - Step 1 で特定した uri と position を使う。
   - mode: "definition" → LSP textDocument/definition
   - mode: "reference" → LSP textDocument/references
3. ID 生成
   - 後続の inspect コマンドのために、返ってきた各 Location をシリアライズして ID 化する。
   - Format: filePath::line::character

### 4.4 inspect の処理

LSP は「コードの中身」を返しません。Daemon が自分でファイルを読む必要があります。

処理:

1. ID から filePath, line, character を復元。
2. Smart Block Selection:
   - LSP Method: textDocument/foldingRange (折りたたみ範囲) をリクエスト。
   - 指定された行が含まれる最小の FoldingRange（関数ブロックなど）を探す。
   - その範囲のテキストをファイルシステムから読み込む。
3. 単純な surround 指定の場合は、指定行の前後 N 行を読み込む。

## 5. 技術スタック・推奨ライブラリ

車輪の再発明を避け、信頼性の高いライブラリを選定しました。

- Runtime: Node.js (TypeScript)
- LSP Server: typescript-language-server (npm install typescript-language-server typescript)
- LSP Communication:
  - vscode-jsonrpc: 標準入出力での JSON-RPC 通信用。
  - vscode-languageserver-types: 型定義用。
- Daemon Communication:
  - fastify または express: Daemon をローカル HTTP サーバーとして実装するのが最も簡単でデバッグしやすい（http://localhost:3000 で待ち受け）。
- CLI Framework:
  - cac または commander: CLI 引数のパース用。

## 6. 開発ロードマップ

以下の順序で実装を進めてください。一気に全部作ろうとすると失敗します。

### Phase 0: 疎通確認 (Proof of Concept) [完了]

Node.js スクリプトから typescript-language-server を spawn し、initialize を送ってレスポンスが返ってくることだけを確認する。

### Phase 1: Domain & UseCases (Clean Architecture) [完了]

Clean Architecture に基づき、Domain Entities と UseCase を実装する。
LSP への依存を抽象化し、テスト可能な構造を作る。

### Phase 2: Infrastructure (LSP Integration) [完了]

実際に LSP プロセスと通信する Repository 実装を行う。
`vscode-jsonrpc` を用いて `typescript-language-server` と通信する。

### Phase 3: Web Server (Daemon) [完了]

Fastify を用いて HTTP サーバーを実装し、UseCase を公開する。
`/map`, `/find`, `/inspect` エンドポイントを実装する。

### Phase 4: CLI クライアント [完了]

Daemon に HTTP リクエストを投げる CLI を実装する。
`cac` を使用し、`map`, `find`, `inspect` コマンドを提供する。

### Phase 5: Lazy Start & Dynamic Port [完了]

- **Lazy Start**: CLI 実行時にサーバーが起動していなければ自動的に起動する。
- **Dynamic Port**: `portfinder` を用いて空きポートを動的に割り当て、`.ts-search-daemon.json` でポート番号を共有する。
- **Lifecycle**: `stop` コマンドおよび `/shutdown` エンドポイントによるグレースフルシャットダウン。
