// Core types for the dom-element-to-component-source library

/**
 * Represents the source location of a DOM element in the original source code
 */
export interface SourceLocation {
  /** The file path where the component is defined */
  file: string
  /** The line number in the source file */
  line: number
  /** The column number in the source file */
  column: number
  /** The name of the React component (if available) */
  componentName?: string
  /** The HTML tag name of the element (e.g., 'DIV', 'H2', 'BUTTON') */
  tagName?: string
  /** The original source code at this location (if available) */
  sourceCode?: string
  /** Component props (only serializable values: primitives, arrays, and simple objects) */
  componentProps?: SerializableProps
}

/** Primitive types that can be serialized to JSON */
export type SerializablePrimitive = string | number | boolean | null

/** Recursive type for serializable values (primitives, arrays, and simple key/value objects) */
export type SerializableValue = 
  | SerializablePrimitive 
  | SerializableValue[] 
  | { [key: string]: SerializableValue }

/** Props object containing only serializable values */
export type SerializableProps = Record<string, SerializableValue>

/**
 * Represents a React Fiber node with debug stack information
 */
export interface ReactFiberNode {
  /** React Fiber node tag (0 = FunctionComponent, 5 = HostComponent, 11 = ForwardRef, etc.) */
  tag?: number
  /** Debug stack information (React 16+) - Error object with stack property */
  _debugStack?: Error
  /** Alternative debug stack field (without underscore) */
  debugStack?: Error
  name: string
  /** Component type information */
  type?: {
    name?: string
    displayName?: string
  }
  /** Alternative debug source location (older React versions) */
  _debugSource?: {
    fileName: string
    lineNumber: number
    columnNumber: number
  }
  /** JSX definition metadata used by React Server Components */
  debugLocation?: Error
  _debugOwner?: ReactFiberNode
  /** Owner fiber node (used in Next.js React) */
  owner?: ReactFiberNode
  /** Parent fiber node */
  return?: ReactFiberNode
  /** Child fiber node */
  child?: ReactFiberNode
  /** Sibling fiber node */
  sibling?: ReactFiberNode
  /** Memoized props (React internal) */
  memoizedProps?: Record<string, unknown>
  /** Pending props (React internal) */
  pendingProps?: Record<string, unknown>
}

/**
 * DOM element extended with React internal properties
 * Note: React may also add dynamic properties like __reactFiber$* or _reactFiber$* 
 * with random postfixes that are handled at runtime
 */
export interface DomElementWithReactInternals extends Element {
  /** React 16+ internal fiber reference */
  _reactInternalFiber?: ReactFiberNode
  /** React 16+ internal reference */
  _reactInternals?: ReactFiberNode
  /** React 15 internal instance reference */
  __reactInternalInstance?: ReactFiberNode
  /** Alternative React internal reference */
  _reactInternalInstance?: ReactFiberNode
}

export interface ElementSourceContext {
  definition?: SourceLocation
  invocations: SourceLocation[]
}

export type ElementSourceContextResult =
  | { success: true; data: ElementSourceContext }
  | { success: false; error: string }

export type SourceResolutionErrorCode =
  | 'INVALID_REACT_URL'
  | 'GENERATED_FILE_NOT_FOUND'
  | 'SOURCE_MAP_NOT_FOUND'
  | 'POSITION_NOT_FOUND'
  | 'RESOLUTION_FAILED'

export type SourceResolutionResult =
  | { success: true; data: ElementSourceContext }
  | {
      success: false
      error: {
        code: SourceResolutionErrorCode
        message: string
      }
    }

export interface ResolveElementSourceContextOptions {
  projectRoot: string
}

export interface ElementSourceContextOptions {
  /** Maximum number of Fiber and owner nodes to inspect */
  maxDepth?: number
}
