# RSC Source Resolution Spec

## Objective

Move generic React Server Component source detection and source-map resolution
from Frontman into this package. Consumers should receive the selected JSX
definition and React invocation ancestry as separate concepts, and should be
able to resolve the complete context on a trusted Node.js server.

Frontman should become a thin adapter responsible for transport, persistence,
prompt rendering, and its own authorization policy.

## Distribution

- Keep the existing `dom-element-to-component-source` package name in this fork.
- Frontman pins an exact Git commit from
  `frontman-ai/dom-element-to-component-source`.
- Publishing a scoped npm package is out of scope.

## Public Contract

Replace the browser API with an explicit source-context model:

```ts
const result = await getElementSourceContext(element, { maxDepth: 10 })
```

```ts
type ElementSourceContext = {
  definition?: SourceLocation
  invocations: SourceLocation[]
}

type ElementSourceContextResult =
  | { success: true; data: ElementSourceContext }
  | { success: false; error: string }
```

The fields have distinct meanings:

1. `definition` is the selected element's JSX definition when available.
2. `invocations` contains React owner call sites from nearest to farthest.
3. A browser-resolved client definition remains the definition when nested
   beneath server owners.
4. `about://React/Server/` locations remain unchanged for server resolution.

The package reports both facts and does not decide which location consumers
should present as primary.

The server entry point resolves the complete context in one operation:

```ts
const result = await resolveElementSourceContext(context, {
  projectRoot,
})
```

Resolution returns a discriminated result. It must not silently return an
unresolved React virtual location.

```ts
type SourceResolutionResult =
  | { success: true; data: ElementSourceContext }
  | {
      success: false
      error: {
        code:
          | 'INVALID_REACT_URL'
          | 'GENERATED_FILE_NOT_FOUND'
          | 'SOURCE_MAP_NOT_FOUND'
          | 'POSITION_NOT_FOUND'
          | 'RESOLUTION_FAILED'
        message: string
      }
    }
```

## Package Responsibilities

- Detect supported React Fiber fields and dynamic Fiber keys.
- Distinguish selected JSX definitions from component invocations.
- Preserve client definitions beneath React Server Component owners.
- Parse React virtual source URLs without browser requests.
- Build bounded, ordered React invocation ancestry.
- Resolve adjacent and alternate source maps.
- Restrict generated files and source maps to `projectRoot` before reading.
- Resolve Turbopack and webpack project source prefixes against `projectRoot`.
- Resolve the definition and every invocation in one server operation.
- Expose explicit, structured failures.
- Keep the server export safe for Next.js Turbopack analysis.
- Build distributable files during Git dependency packing.

## Frontman Responsibilities

- Validate HTTP request and response schemas.
- Authorize resolved files against `sourceRoot`.
- Convert absolute paths to project-relative paths.
- Persist source locations and resolution failures.
- Render source context and failures in agent prompts.
- Treat all DOM and source metadata as untrusted input.

Frontman supplies the trusted `projectRoot`; this package owns all filesystem
reads beneath it. Frontman independently validates returned paths against its
narrower `sourceRoot` before persistence.

## Commands

- Install: `yarn install --immutable`
- Unit tests: `yarn test:run`
- Type check: `yarn type-check`
- Build: `yarn build`

Frontman verification uses repository Make targets:

- Client tests: `make test` from `libs/client`
- Core tests: `make test` from `libs/frontman-core`
- Next.js tests: `make test` from `libs/frontman-nextjs`

## Project Structure

- `src/getElementSourceLocation.ts`: browser Fiber detection and public API.
- `src/sourceLocationResolver.ts`: browser stack parsing helpers.
- `src/resolveSourceLocationInServer.ts`: Node.js source-map resolution.
- `src/types.ts`: public browser and server contracts.
- `tests/`: package behavior and regression tests.
- Frontman bindings remain thin typed adapters around package exports.

## Code Style

Use existing TypeScript style and discriminated results at public boundaries:

```ts
if (!original.source || original.line == null) {
  return {
    success: false,
    error: {
      code: 'POSITION_NOT_FOUND',
      message: `No original position for ${location.file}`,
    },
  }
}
```

Avoid catch blocks that convert failures into unchanged virtual locations.

## Testing Strategy

- Unit-test explicit definition and invocation extraction with synthetic Fiber
  trees.
- Cover selected server definitions, client definitions under server owners,
  invocation ancestry, encoded generated paths, and ordinary browser sources.
- Unit-test server resolution with real source-map fixtures.
- Cover Turbopack prefixes, webpack prefixes, missing maps, invalid positions,
  and complete source contexts.
- Keep Frontman integration tests for HTTP authorization, serialization, and one
  end-to-end package call. Remove duplicated package-mechanics fixtures.
- Keep a Next.js bundle smoke test in Frontman.

## Boundaries

### Always

- Keep one source-context API; upstream compatibility is not required.
- Bound Fiber and owner traversal by `maxDepth`.
- Return structured errors for unresolved React virtual locations.
- Run package tests, type checking, and build before migration.
- Pin Frontman to an exact fork commit.

### Ask First

- Rename or publish the package.
- Add runtime dependencies.
- Change Frontman's persisted annotation schema.

### Never

- Fetch `about://React/` URLs in the browser.
- Read arbitrary paths based only on browser input.
- Swallow source-map failures.
- Depend on Frontman-specific types or transport inside this package.

## Success Criteria

- Package tests reproduce all RSC browser behaviors currently covered in
  Frontman's `Client__DOMElementToComponentSource` tests.
- Package resolves selected definition and invocation ancestry in one server
  operation.
- Package returns explicit errors for missing files, maps, and positions.
- Package build can be consumed by Next.js without Turbopack tracing failures.
- Installing the package from an exact Git commit produces its declared `dist`
  exports.
- Frontman deletes its custom Fiber parser and custom source-map runtime.
- Frontman retains project/source-root authorization and passes client, core,
  and Next.js test suites.
- Frontman dependency references an exact commit in the organization fork.

## Open Questions

- None. Distribution choice is an exact Git commit dependency.
