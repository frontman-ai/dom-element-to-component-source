import {
  DomElementWithReactInternals,
  ElementSourceContextOptions,
  ElementSourceContextResult,
  ReactFiberNode,
  SourceLocation,
} from './types'
import {
  extractComponentProps,
  parseDebugStack,
  validateSourceLocation,
} from './sourceLocationResolver'

type DebugSource = Error | {
  fileName: string
  lineNumber: number
  columnNumber: number
}

const DEFAULT_MAX_DEPTH = 10
const REACT_SERVER_PREFIX = 'about://React/Server/'

function getMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth === undefined || !Number.isFinite(maxDepth)) {
    return DEFAULT_MAX_DEPTH
  }

  return Math.max(0, Math.floor(maxDepth))
}

function getDebugSource(fiber: ReactFiberNode | undefined): DebugSource | undefined {
  return fiber?._debugStack || fiber?.debugStack || fiber?._debugSource
}

function getOwner(fiber: ReactFiberNode | undefined): ReactFiberNode | undefined {
  return fiber?.owner || fiber?._debugOwner
}

function getComponentName(fiber: ReactFiberNode | undefined): string | undefined {
  if (!fiber) {
    return undefined
  }

  return fiber.name || fiber.type?.displayName || fiber.type?.name
}

function parseReactServerLocation(
  debugSource: DebugSource | undefined,
  fiber: ReactFiberNode,
  componentName: string | undefined,
  tagName: string,
): SourceLocation | null {
  if (!debugSource || !('stack' in debugSource) || typeof debugSource.stack !== 'string') {
    return null
  }

  const stackLine = debugSource.stack
    .split('\n')
    .find(line => line.includes(REACT_SERVER_PREFIX))
  if (!stackLine) {
    return null
  }

  const source = stackLine
    .slice(stackLine.indexOf(REACT_SERVER_PREFIX))
    .replace(/\)?$/, '')
  const match = source.match(
    /^(about:\/\/React\/Server\/file:\/\/\/.*?)(?:\?[^:]*)?:(\d+):(\d+)$/,
  )
  if (!match) {
    return null
  }

  return {
    file: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
    componentName,
    componentProps: extractComponentProps(fiber),
    tagName,
  }
}

function hasReactVirtualLocation(debugSource: DebugSource | undefined): boolean {
  return !!(
    debugSource &&
    'stack' in debugSource &&
    typeof debugSource.stack === 'string' &&
    debugSource.stack.includes('about://React/')
  )
}

async function parseBrowserLocation(
  fiber: ReactFiberNode,
  componentName: string | undefined,
  tagName: string,
): Promise<SourceLocation | null> {
  const sourceLocation = await parseDebugStack(fiber)
  if (!sourceLocation || !validateSourceLocation(sourceLocation)) {
    return null
  }

  return {
    ...sourceLocation,
    componentName: componentName || sourceLocation.componentName,
    tagName,
  }
}

async function parseLocation(
  fiber: ReactFiberNode,
  debugSource: DebugSource | undefined,
  componentName: string | undefined,
  tagName: string,
): Promise<SourceLocation | null> {
  const serverLocation = parseReactServerLocation(debugSource, fiber, componentName, tagName)
  if (serverLocation) {
    return serverLocation
  }

  if (!debugSource || hasReactVirtualLocation(debugSource)) {
    return null
  }

  return parseBrowserLocation(fiber, componentName, tagName)
}

async function getInvocations(
  firstOwner: ReactFiberNode | undefined,
  tagName: string,
  maxDepth: number,
): Promise<SourceLocation[]> {
  const invocations: SourceLocation[] = []
  let current = firstOwner

  for (let depth = 0; current && depth < maxDepth; depth++) {
    const enclosingOwner = getOwner(current)
    const location = await parseLocation(
      current,
      getDebugSource(current),
      getComponentName(enclosingOwner) || getComponentName(current),
      tagName,
    )
    if (location) {
      invocations.push(location)
    }
    current = enclosingOwner
  }

  return invocations
}

function extractFiberNode(element: Element): ReactFiberNode | null {
  const elementWithReact = element as DomElementWithReactInternals
  const directFiber = elementWithReact._reactInternals ||
    elementWithReact._reactInternalFiber ||
    elementWithReact.__reactInternalInstance ||
    elementWithReact._reactInternalInstance
  if (directFiber) {
    return directFiber
  }

  for (const key of Object.keys(elementWithReact)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('_reactFiber$')) {
      const fiber = (elementWithReact as unknown as Record<string, unknown>)[key]
      if (fiber && typeof fiber === 'object') {
        return fiber as ReactFiberNode
      }
    }
  }

  return null
}

export async function getElementSourceContext(
  element: Element,
  options: ElementSourceContextOptions = {},
): Promise<ElementSourceContextResult> {
  try {
    const elementInstance = element?.ownerDocument.defaultView?.Element || Element
    if (!element || !(element instanceof elementInstance)) {
      return { success: false, error: 'Invalid element provided' }
    }

    const fiber = extractFiberNode(element)
    if (!fiber) {
      return { success: false, error: 'No React Fiber node found on element' }
    }

    const maxDepth = getMaxDepth(options.maxDepth)
    let current: ReactFiberNode | undefined = fiber
    let fallbackInvocations: SourceLocation[] = []

    for (let depth = 0; current && depth < maxDepth; depth++) {
      const owner = current._debugOwner || current.owner
      const componentName = getComponentName(owner) || getComponentName(current)
      const currentDebugSource = getDebugSource(current)

      const currentServerDefinition = parseReactServerLocation(
        currentDebugSource,
        current,
        componentName,
        element.tagName,
      )
      const ownerServerDefinition = parseReactServerLocation(
        owner?.debugLocation,
        owner || current,
        componentName,
        element.tagName,
      )
      const definition = currentServerDefinition || ownerServerDefinition ||
        await parseLocation(current, currentDebugSource, componentName, element.tagName)

      if (definition) {
        const invocations = await getInvocations(owner, element.tagName, maxDepth)
        return {
          success: true,
          data: {
            definition,
            invocations: invocations.length > 0 ? invocations : fallbackInvocations,
          },
        }
      }

      if (owner) {
        const invocations = await getInvocations(owner, element.tagName, maxDepth)
        if (fallbackInvocations.length === 0 && invocations.length > 0) {
          fallbackInvocations = invocations
        }
      }

      current = current.return
    }

    return fallbackInvocations.length > 0
      ? { success: true, data: { invocations: fallbackInvocations } }
      : { success: false, error: 'No source context found in fiber tree' }
  } catch (error) {
    return {
      success: false,
      error: `Error extracting source context: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
