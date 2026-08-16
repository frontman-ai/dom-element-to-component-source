# Changelog

## [Unreleased]

### Changed
- Replaced `getElementSourceLocation` with `getElementSourceContext`, which returns an explicit JSX definition and ordered invocation ancestry.
- Replaced `resolveSourceLocationInServer` with `resolveElementSourceContext` from the `/server` entry.
- Added structured server resolution errors and canonical project-root checks for generated files and source maps.
- Split browser and server bundles and added Git dependency builds through `prepack`.

### Removed
- Removed recursive `SourceLocation.parent` output and old public API compatibility.

## [0.5.0]

### Added
- `componentProps` property to `SourceLocation` interface - contains serializable component props
- Props are filtered to include only JSON-serializable values (primitives, arrays, plain objects)
- Non-serializable values (functions, React elements, class instances, symbols, etc.) are automatically excluded
- Handles circular references safely
- New exported functions: `filterPrimitiveProps`, `extractComponentProps`
- New types: `SerializableValue`, `SerializablePrimitive`, `SerializableProps`
- Comprehensive test suite for props filtering (53 tests)

## [0.3.2]

### Changed
- default export is for the browser so it won't include the `resolveSourceLocationInServer`
- `dom-element-to-component-source/server` includes `resolveSourceLocationInServer`

### Added
- `parent` property to `SourceLocation` interface - recursively populated parent component source locations
- Support for traversing up the React component tree via `_debugOwner` and `.owner` (for Next.js)
- Automatic detection of Next.js React components using `env === "Server"` check

## [0.2.0]

### Added
- `resolveSourceLocationInServer` function to resolve source locations from React Server Components

## [0.1.4] - 2025-10-20

- Update README.md
- Remove unused dependency

## [0.1.3] - 2025-10-20

- Initial release
- NextJS and React19 support with source maps
- E2E tests for both NextJS and React19
