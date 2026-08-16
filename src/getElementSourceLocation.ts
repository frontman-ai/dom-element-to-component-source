import {
  DomElementWithReactInternals,
  ElementComponentNameOptions,
  ElementSourceContextOptions,
  ElementSourceContextResult,
  ReactFiberNode,
  SourceLocation,
} from './types'
import {
  extractComponentProps,
  getFiberComponentName,
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

  for (const current of walkFiberChain(firstOwner, getOwner, maxDepth)) {
    const enclosingOwner = getOwner(current)
    const location = await parseLocation(
      current,
      getDebugSource(current),
      (enclosingOwner && getFiberComponentName(enclosingOwner)) || getFiberComponentName(current),
      tagName,
    )
    if (location) {
      invocations.push(location)
    }
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

function* walkFiberChain(
  first: ReactFiberNode | undefined,
  next: (fiber: ReactFiberNode) => ReactFiberNode | undefined,
  maxDepth: number,
): Generator<ReactFiberNode> {
  let current = first
  for (let depth = 0; current && depth < maxDepth; depth++) {
    yield current
    current = next(current)
  }
}

export function getElementComponentName(
  element: Element,
  options: ElementComponentNameOptions = {},
): string | undefined {
  const fiber = extractFiberNode(element)
  if (!fiber) {
    return undefined
  }

  const maxDepth = getMaxDepth(options.maxDepth)
  const excludedNames = new Set([
    'Fragment',
    'Suspense',
    ...(options.excludedNames || []),
  ])
  const isEligible = (name: string | undefined): name is string => !!name &&
    !excludedNames.has(name) &&
    (options.includeUnderscorePrefixed !== false || !name.startsWith('_'))

  for (const owner of walkFiberChain(getOwner(fiber), getOwner, maxDepth)) {
    const name = getFiberComponentName(owner)
    if (isEligible(name)) {
      return name
    }
  }

  for (const returnFiber of walkFiberChain(fiber.return, node => node.return, maxDepth)) {
    const name = getFiberComponentName(returnFiber)
    if (isEligible(name)) {
      return name
    }
  }

  return undefined
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
    let fallbackInvocations: SourceLocation[] = []

    for (const current of walkFiberChain(fiber, node => node.return, maxDepth)) {
      const owner = current._debugOwner || current.owner
      const componentName = (owner && getFiberComponentName(owner)) ||
        getFiberComponentName(current)
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
