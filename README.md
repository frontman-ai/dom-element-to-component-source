# DOM Element to Component Source

A TypeScript library for finding React JSX source context from a DOM element and
resolving React Server Component locations through source maps.

## Features

- Separates selected JSX definitions from React owner invocation ancestry.
- Preserves client definitions nested beneath server owners.
- Supports dynamic React Fiber keys and bounded traversal.
- Resolves complete server source contexts in one operation.
- Supports Turbopack, webpack, file URL, and map-relative source paths.
- Returns structured source-resolution failures.

## Installation

```bash
yarn add dom-element-to-component-source
```

## Browser API

```typescript
import { getElementSourceContext } from 'dom-element-to-component-source'

const button = document.querySelector('button')
if (!button) throw new Error('Button not found')

const result = await getElementSourceContext(button, { maxDepth: 10 })
if (!result.success) {
  throw new Error(result.error)
}

const { definition, invocations } = result.data
if (definition) {
  console.log(`${definition.file}:${definition.line}:${definition.column}`)
}

for (const invocation of invocations) {
  console.log(`${invocation.file}:${invocation.line}:${invocation.column}`)
}
```

`definition` is the selected element's JSX definition when React exposes one.
`invocations` contains owner call sites ordered nearest to farthest. React Server
Component locations remain `about://React/Server/...` URLs until resolved by the
server API.

### Browser Types

```typescript
interface ElementSourceContext {
  definition?: SourceLocation
  invocations: SourceLocation[]
}

type ElementSourceContextResult =
  | { success: true; data: ElementSourceContext }
  | { success: false; error: string }

interface ElementSourceContextOptions {
  maxDepth?: number
}
```

## Server API

Import server functionality from the dedicated server entry. Never import this
entry into browser code.

```typescript
import { resolveElementSourceContext } from 'dom-element-to-component-source/server'

const result = await resolveElementSourceContext(context, {
  projectRoot: '/absolute/path/to/project',
})

if (!result.success) {
  console.error(result.error.code, result.error.message)
  return
}

console.log(result.data.definition)
console.log(result.data.invocations)
```

The resolver preserves ordinary locations and resolves every
`about://React/Server/file:///...` definition and invocation. Generated files
and source maps must resolve inside the canonical `projectRoot` before they are
read.

### Server Result

```typescript
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

## Source Location

```typescript
interface SourceLocation {
  file: string
  line: number
  column: number
  componentName?: string
  tagName?: string
  sourceCode?: string
  componentProps?: Record<string, SerializableValue>
}
```

## Requirements

- Node.js 16 or newer for server resolution.
- React development metadata for browser extraction.
- Source maps for React Server Component resolution.

## Development

```bash
yarn install --immutable
yarn test:run
yarn type-check
yarn build
yarn pack --dry-run
```

## License

MIT
