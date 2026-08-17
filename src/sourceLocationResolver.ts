import { SourceLocation, ReactFiberNode, SerializableValue, SerializableProps } from './types'
import ErrorStackParser from 'error-stack-parser'
import StackTraceGPS from 'stacktrace-gps'

/**
 * Checks if a value is a primitive type (string, number, boolean, null)
 */
function isPrimitive(value: unknown): value is string | number | boolean | null {
  if (value === null) return true
  const type = typeof value
  return type === 'string' || type === 'number' || type === 'boolean'
}

/**
 * Checks if an object is a plain object (not a class instance, Date, RegExp, React element, etc.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  
  // Exclude React elements (they have $$typeof symbol property)
  if ('$$typeof' in value) return false
  
  return true
}

/**
 * Attempts to convert a value to a serializable format.
 * Returns the serializable value or undefined if the value cannot be serialized.
 * @param value - The value to convert
 * @param seen - Set of seen objects to detect circular references
 * @returns The serializable value or undefined
 */
function toSerializableValue(value: unknown, seen: WeakSet<object> = new WeakSet()): SerializableValue | undefined {
  // Handle primitives
  if (isPrimitive(value)) {
    return value
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Check for circular references
    if (seen.has(value)) return undefined
    seen.add(value)

    const result: SerializableValue[] = []
    for (const item of value) {
      const serialized = toSerializableValue(item, seen)
      if (serialized === undefined) {
        // Skip non-serializable items in arrays
        continue
      }
      result.push(serialized)
    }
    return result.length > 0 ? result : undefined
  }

  // Handle plain objects
  if (isPlainObject(value)) {
    // Check for circular references
    if (seen.has(value)) return undefined
    seen.add(value)

    const result: Record<string, SerializableValue> = {}
    let hasProps = false

    for (const [key, val] of Object.entries(value)) {
      const serialized = toSerializableValue(val, seen)
      if (serialized !== undefined) {
        result[key] = serialized
        hasProps = true
      }
    }
    return hasProps ? result : undefined
  }

  // Non-serializable value (function, symbol, Date, RegExp, class instance, etc.)
  return undefined
}

/**
 * Filters an object to only include serializable values (primitives, arrays, simple objects)
 * Non-serializable values (functions, symbols, class instances, etc.) are excluded
 * @param props - The props object to filter
 * @returns A new object containing only serializable values
 */
export function filterPrimitiveProps(
  props: Record<string, unknown> | undefined | null
): SerializableProps | undefined {
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return undefined
  }

  const result: SerializableProps = {}
  let hasProps = false

  for (const [key, value] of Object.entries(props)) {
    const serialized = toSerializableValue(value)
    if (serialized !== undefined) {
      result[key] = serialized
      hasProps = true
    }
  }

  return hasProps ? result : undefined
}

/**
 * Extracts component props from a React Fiber node, filtering to only serializable values
 * @param fiberNode - The React Fiber node
 * @returns Filtered props object or undefined if no serializable props found
 */
export function extractComponentProps(
  fiberNode: ReactFiberNode
): SerializableProps | undefined {
  // React stores props in memoizedProps or pendingProps
  const props = fiberNode.memoizedProps || fiberNode.pendingProps
  return filterPrimitiveProps(props)
}

/**
 * Gets the component name exposed by a Fiber, including ForwardRef render names.
 */
export function getFiberComponentName(fiberNode: ReactFiberNode): string | undefined {
  if (fiberNode.name) return fiberNode.name

  const nodeType = fiberNode.type
  if (nodeType) {
    if (nodeType.displayName) return nodeType.displayName
    if (nodeType.render?.name) return nodeType.render.name
    if (nodeType.name) return nodeType.name
  }

  return undefined
}

/**
 * Parses debug stack data from different React versions and formats
 * @param fiberNode - The React Fiber node
 * @param reactVersion - The detected React version
 * @returns Parsed source location or null if not found
 */
export async function parseDebugStack(
  fiberNode: ReactFiberNode,
): Promise<SourceLocation | null> {
  let debugStack: Error | { fileName: string; lineNumber: number; columnNumber: number } | null = null

  if (!debugStack) {
    debugStack = fiberNode._debugStack || null
  }
  
  if (!debugStack) {
    debugStack = fiberNode.debugStack || null
  }
  
  if (!debugStack) {
    debugStack = fiberNode._debugSource || null
  }

  if (!debugStack) {
    return null
  }

  const componentName = getFiberComponentName(fiberNode)
  const componentProps = extractComponentProps(fiberNode)

  let sourceLocation: SourceLocation

  if (debugStack && 'stack' in debugStack && typeof debugStack.stack === 'string') {
    try {
      const stackFrames = ErrorStackParser.parse(debugStack as Error)
      
      if (stackFrames.length >= 2) {
        const targetFrame = stackFrames[1]
        
        const gps = new StackTraceGPS()
        const originalFrame = await gps.getMappedLocation(targetFrame)
        
        const rawFileName = originalFrame.fileName || targetFrame.fileName || ''
        // Remove query parameters (e.g., ?35) from the file path
        const cleanedFileName = rawFileName.split('?')[0]
        
        sourceLocation = {
          file: cleanedFileName,
          line: originalFrame.lineNumber || targetFrame.lineNumber || 0,
          column: originalFrame.columnNumber || targetFrame.columnNumber || 0,
          componentName,
          componentProps
        }
      } else {
        return null
      }
    } catch (error) {
      try {
        const stackFrames = ErrorStackParser.parse(debugStack as Error)
        if (stackFrames.length >= 2) {
          const targetFrame = stackFrames[1]
          const rawFileName = targetFrame.fileName || ''
          // Remove query parameters (e.g., ?35) from the file path
          const cleanedFileName = rawFileName.split('?')[0]
          
          sourceLocation = {
            file: cleanedFileName,
            line: targetFrame.lineNumber || 0,
            column: targetFrame.columnNumber || 0,
            componentName,
            componentProps
          }
        } else {
          return null
        }
      } catch (parseError) {
        return null
      }
    }
  } else if (debugStack && 'fileName' in debugStack) {
    const rawFileName = debugStack.fileName || ''
    // Remove query parameters (e.g., ?35) from the file path
    const cleanedFileName = rawFileName.split('?')[0]
    
    sourceLocation = {
      file: cleanedFileName,
      line: debugStack.lineNumber || 0,
      column: debugStack.columnNumber || 0,
      componentName,
      componentProps
    }
  } else {
    return null
  }

  if (!sourceLocation.file || sourceLocation.line <= 0) {
    return null
  }

  return sourceLocation
}



/**
 * Normalizes file paths to be consistent across different environments
 * @param filePath - The file path to normalize
 * @returns Normalized file path
 */
export function normalizeFilePath(filePath: string): string {
  if (!filePath) return filePath

  let normalized = filePath.replace(/^webpack:\/\/\//, '')
  
  normalized = normalized.replace(/^webpack:\/\//, '')
  
  normalized = normalized.replace(/^webpack-internal:\/\/\//, '')
  
  normalized = normalized.replace(/\\/g, '/')
  
  normalized = normalized.replace(/^\.\//, '')
  
  return normalized
}

/**
 * Validates that a source location contains valid data.
 * @param sourceLocation - The source location to validate
 * @returns True if valid, false otherwise
 */
export function validateSourceLocation(sourceLocation: SourceLocation): boolean {
  return !!(
    sourceLocation.file &&
    sourceLocation.file.trim() !== '' &&
    sourceLocation.line > 0 &&
    sourceLocation.column >= 0
  )
}
