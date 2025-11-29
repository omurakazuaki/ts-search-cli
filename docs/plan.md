# Project Execution Plan: Agent Code Navigator

## Strategy

This plan follows Clean Architecture and Test-Driven Development (TDD) principles to ensure robustness and maintainability.
We will strictly adhere to the "Dependency Rule" where dependencies point inwards.

## Phase 0: Preparation & PoC (Completed)

- [x] ESLint & Prettier Setup
- [x] **Task 0.1**: Setup Testing Framework (Jest)
  - Install `jest`, `ts-jest`, `@types/jest`.
  - Configure `jest.config.js`.
- [x] **Task 0.2**: Verify PoC
  - Run `npm start` to verify `poc.ts` interacts correctly with `typescript-language-server`.

## Phase 1: Domain & Ports (Design First) (Completed)

_Goal: Define the core language of the system without implementation details._

- [x] **Task 1.1**: Define Domain Entities
  - Create `src/domain/entities.ts` (`LocationRef`, `CodeContext`, `SymbolInfo`).
  - Create `src/domain/errors.ts` (`SymbolNotFoundError`, `AmbiguousSymbolError`).
- [x] **Task 1.2**: Define UseCase Ports (Interfaces)
  - Create `src/usecases/ports/ILspRepository.ts`.
  - **Verification**: Review interfaces to ensure they meet UseCase requirements without leaking implementation details.

## Phase 2: UseCase Logic (Pure Business Logic) (Completed)

_Goal: Implement application logic with Mock repositories. 100% Unit Test coverage._

- [x] **Task 2.1**: MapFileUseCase
  - Create `src/usecases/MapFileUseCase.ts`.
  - Create `src/usecases/MapFileUseCase.spec.ts` (Mock `ILspRepository`).
- [x] **Task 2.2**: FindSymbolUseCase
  - Create `src/usecases/FindSymbolUseCase.ts`.
  - Create `src/usecases/FindSymbolUseCase.spec.ts`.
- [x] **Task 2.3**: InspectCodeUseCase
  - Create `src/usecases/InspectCodeUseCase.ts`.
  - Create `src/usecases/InspectCodeUseCase.spec.ts`.

## Phase 3: Infrastructure - LSP Integration (The Bridge) (Completed)

_Goal: Implement the actual communication with `typescript-language-server`._

- [x] **Task 3.1**: LSP Process Manager
  - Create `src/infrastructure/lsp/LspProcessManager.ts` (Spawn, IPC).
  - Test: Verify process start/stop and stdio communication.
- [x] **Task 3.2**: LspRepository Implementation (Gateway)
  - Create `src/adapters/gateways/LspRepository.ts` implementing `ILspRepository`.
  - Implement JSON-RPC handling.
  - Implement error translation (LSP Error -> Domain Error).
- [x] **Task 3.3**: Integration Test
  - Verify `LspRepository` against a real `typescript-language-server` instance.

## Phase 4: Web Server & Adapters

_Goal: Expose UseCases via HTTP._

- [ ] **Task 4.1**: Controllers
  - Create `src/adapters/controllers/NavigationController.ts`.
  - Unit Test: Verify HTTP input/output conversion.
- [ ] **Task 4.2**: Server Setup (Fastify)
  - Create `src/infrastructure/server/server.ts`.
  - Setup DI in `src/main.ts`.
- [ ] **Task 4.3**: E2E Smoke Test
  - Start server and hit endpoints with `curl` or test script.

## Phase 5: CLI Client

_Goal: User-friendly command line interface._

- [ ] **Task 5.1**: CLI Implementation
  - Create `src/cli.ts` using `cac` or `commander`.
  - Implement commands: `map`, `find`, `inspect`, `start`, `stop`.
- [ ] **Task 5.2**: Final System Verification
  - Verify full flow: CLI -> Daemon -> LSP -> Response.
