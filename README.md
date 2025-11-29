# ts-search-cli

**Agent-Oriented Code Navigation Tool**

`ts-search-cli` is a CLI tool designed to act as a bridge between LLM Agents (like GitHub Copilot, ChatGPT, etc.) and the Language Server Protocol (LSP). It allows agents to explore a codebase semantically, finding definitions, references, and inspecting code with the precision of a full-fledged IDE.

## Features

- 🧠 **LSP-Powered**: Leverages `typescript-language-server` for accurate symbol resolution, definition finding, and reference tracking.
- 🤖 **Agent-Friendly**: Outputs structured JSON data, making it easy for AI agents to parse and understand the codebase.
- 🚀 **Lazy Start**: The background daemon server starts automatically when you run a CLI command.
- 🔌 **Dynamic Port**: Automatically finds an available port to avoid conflicts.
- 🏗️ **Clean Architecture**: Built with a modular design (Domain, UseCases, Adapters, Infrastructure) for maintainability.

## Installation

```bash
npm install
npm run build
```

## Usage

The tool exposes a CLI named `ts-search`.

### 1. Map Symbols in a File

Lists all symbols (classes, functions, variables) in a specific file.

```bash
npx ts-search map src/domain/entities.ts
```

### 2. Search Symbols

Search for symbols by name across the entire project. Returns a list of candidates with their IDs.

```bash
npx ts-search search LocationRef
```

### 3. Find Symbol Definition & References

Finds where a symbol is defined and all places where it is referenced using a specific ID.
The ID is obtained from `map` or `search` commands.

```bash
npx ts-search find "src/domain/entities.ts::1::1"
```

### 4. Inspect Code

Reads the code surrounding a specific symbol or location ID.

```bash
# Inspect by ID (returned from map, search, or find)
npx ts-search inspect "src/domain/entities.ts::10::1"

# Options
npx ts-search inspect <id> --expand block    # (Default) Read the containing block
npx ts-search inspect <id> --expand surround # Read surrounding lines
```

### 5. Stop Server

Stops the background daemon process.

```bash
npx ts-search stop
```

## Architecture

This project follows **Clean Architecture** principles:

- **Domain**: Core entities (`SymbolInfo`, `LocationRef`) and errors.
- **UseCases**: Application business rules (`FindSymbol`, `MapFile`, `InspectCode`).
- **Adapters**: Interface adapters (`LspRepository`, `NavigationController`).
- **Infrastructure**: Frameworks and drivers (`Fastify` server, `LspProcessManager`, `CLI`).

### LSP Bridge Pattern

The tool operates using a "Bridge Pattern":

1.  **CLI Client**: Accepts user commands and communicates with the Daemon via HTTP.
2.  **Daemon Server**: A long-running process that maintains a persistent connection to the LSP server.
3.  **LSP Server**: The actual language server (e.g., `typescript-language-server`) that analyzes the code.

## Development

```bash
# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```
