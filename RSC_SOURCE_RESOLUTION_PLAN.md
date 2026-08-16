# RSC Source Resolution Plan

## Architecture Decisions

- Replace the package API; upstream compatibility is not required.
- Return `definition` and ordered `invocations` separately.
- Resolve a complete context in one trusted server call.
- Keep input filesystem authorization with package mechanics; Frontman validates
  every returned path against its narrower source root.
- Build browser and server entries separately so Turbopack does not trace Node
  source-map internals into browser code.
- Make the repository installable through an exact Git commit with `prepack`.
- Keep Frontman's persisted recursive source-location schema for this migration;
  adapt only at its package boundary.

## Task 1: Browser Context Contract

**Acceptance criteria:**

- `getElementSourceContext` returns an explicit definition and invocation array.
- Fiber and owner traversal remain bounded by `maxDepth`.
- RSC virtual locations never trigger browser fetches.
- Synthetic tests cover server definitions, client definitions under server
  owners, invocation order, encoded paths, and ordinary browser locations.

**Files:** `src/types.ts`, `src/sourceLocationResolver.ts`,
`src/getElementSourceLocation.ts`, `src/browser.ts`,
`tests/getElementSourceContext.test.ts`.

**Verify:** `yarn vitest run tests/getElementSourceContext.test.ts` and
`yarn type-check`.

## Task 2: Structured Server Context Resolution

**Dependencies:** Task 1.

**Acceptance criteria:**

- `resolveElementSourceContext` resolves definition and all invocations.
- Missing files, maps, positions, and malformed URLs return documented codes.
- Turbopack, webpack, file, and map-relative sources resolve against
  `projectRoot`.
- Generated paths cannot escape `projectRoot`.

**Files:** `src/types.ts`, `src/resolveSourceLocationInServer.ts`,
`src/server.ts`, `tests/resolveSourceLocationInServer.test.ts`, source-map
fixture files.

**Verify:** `yarn vitest run tests/resolveSourceLocationInServer.test.ts` and
`yarn type-check`.

## Task 3: Consumable Browser And Server Builds

**Dependencies:** Task 2.

**Acceptance criteria:**

- Browser export contains no Node resolver.
- Server export imports without dynamic `createRequire` tracing.
- Exact Git dependency packing produces declared `dist` files.
- Next.js production build can import package server entry.

**Files:** `vite.config.ts`, optional `vite.server.config.ts`, `package.json`,
`src/index.ts`, package bundle smoke test.

**Verify:** `yarn build`, package import smoke commands, and focused Next.js
bundle test.

## Checkpoint: Package Ready

- Run `yarn test:run`, `yarn type-check`, and `yarn build`.
- Review package diff for Frontman-specific policy leakage.
- Commit and push package branch after explicit authorization.
- Record exact pushed commit SHA.

## Task 4: Frontman Browser Adapter

**Dependencies:** Package checkpoint.

**Acceptance criteria:**

- Frontman calls package context API with no private Fiber parser.
- Adapter converts explicit context to existing recursive storage shape.
- Multi-location context requires one resolver request.
- Adapter tests cover definition-only, invocation-only, and mixed contexts.

**Files:** `libs/client/src/Client__DOMElementToComponentSource.res`,
`libs/client/src/Client__SourceLocationResolver.res`, reducer integration, and
focused client tests.

**Verify:** `make test` from `libs/client`.

## Task 5: Frontman Server Adapter

**Dependencies:** Task 4.

**Acceptance criteria:**

- Endpoint delegates source-map mechanics to package server API.
- Frontman validates every resolved path against `sourceRoot`.
- Response contains relative definition and invocation paths.

**Files:** `libs/frontman-core/src/FrontmanCore__RequestHandlers.res`, its tests,
and thin package binding files if ReScript requires them.

**Verify:** `make test` from `libs/frontman-core`.

## Task 6: Delete Duplication And Pin Commit

**Dependencies:** Task 5.

**Acceptance criteria:**

- Custom Frontman Fiber parser and source-map runtime are deleted.
- All consumers use one exact fork commit descriptor.
- Direct `source-map` declarations added only for old custom runtime are removed.
- Lockfile contains no remaining npm `0.5.0` selector for this package.

**Files:** package manifests, `yarn.lock`, obsolete bindings/runtime files, and
Next.js bundle test if its assertion changes.

**Verify:** client/core/Next.js tests, Astro/Vite builds, root ReScript build,
and dead-code analysis.

## Final Checkpoint

- Package and Frontman suites pass.
- Frontman diff contains package adapters and policy, not package mechanics.
- Package diff contains no Frontman transport, persistence, or prompt code.
- Commit and push Frontman changes only after explicit authorization.

## Risks

- React private Fiber fields can change across React/Next.js releases. Synthetic
  fixtures and real Next.js coverage mitigate this but cannot remove risk.
- Yarn Git packing may omit `dist` unless `prepack` runs successfully.
- Turbopack may trace server dependencies despite separate entries; production
  bundle smoke test is mandatory.
- Keeping Frontman's recursive persisted schema requires a temporary adapter and
  preserves its current definition-primary presentation policy.
