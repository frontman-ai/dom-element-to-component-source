// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { getElementComponentName } from '../src/browser'
import type { ReactFiberNode } from '../src/types'

function fiber(name: string, extra: Partial<ReactFiberNode> = {}): ReactFiberNode {
  return { name, ...extra }
}

function attachFiber(
  element: Element,
  reactFiber: ReactFiberNode,
  key = '__reactFiber$synthetic',
): void {
  Object.assign(element, { [key]: reactFiber })
}

describe('getElementComponentName', () => {
  it('searches owners before return fibers', () => {
    const element = document.createElement('div')
    attachFiber(element, fiber('div', {
      owner: fiber('OwnerComponent'),
      return: fiber('ReturnComponent'),
    }))

    expect(getElementComponentName(element)).toBe('OwnerComponent')
  })

  it('detects dynamic React Fiber keys', () => {
    const element = document.createElement('div')
    attachFiber(element, fiber('div', { _debugOwner: fiber('DynamicOwner') }), '_reactFiber$abc123')

    expect(getElementComponentName(element)).toBe('DynamicOwner')
  })

  it('bounds traversal and defaults maxDepth to 10', () => {
    const element = document.createElement('div')
    attachFiber(element, fiber('div', {
      owner: fiber('SkipOne', {
        owner: fiber('TargetComponent'),
      }),
    }))

    const options = { excludedNames: ['SkipOne'] }
    expect(getElementComponentName(element, { ...options, maxDepth: 1 })).toBeUndefined()
    expect(getElementComponentName(element, { ...options, maxDepth: 2 })).toBe('TargetComponent')

    let current = fiber('DefaultTarget')
    for (let depth = 0; depth < 10; depth++) {
      current = fiber(`Skip${depth}`, { owner: current })
    }
    attachFiber(element, fiber('div', { owner: current }))

    expect(getElementComponentName(element, {
      excludedNames: Array.from({ length: 10 }, (_, depth) => `Skip${9 - depth}`),
    })).toBeUndefined()
  })

  it('ignores Fragment and Suspense while retaining later owners', () => {
    const element = document.createElement('div')
    attachFiber(element, fiber('div', {
      owner: fiber('Fragment', {
        owner: fiber('Suspense', {
          owner: fiber('Page'),
        }),
      }),
    }))

    expect(getElementComponentName(element)).toBe('Page')
  })

  it('merges caller exclusions with structural exclusions', () => {
    const element = document.createElement('div')
    attachFiber(element, fiber('div', {
      owner: fiber('Fragment', {
        owner: fiber('FrameworkWrapper', {
          owner: fiber('Card'),
        }),
      }),
    }))

    expect(getElementComponentName(element, {
      excludedNames: ['FrameworkWrapper'],
    })).toBe('Card')
  })

  it('includes underscore-prefixed names by default and can exclude them', () => {
    const element = document.createElement('div')
    attachFiber(element, fiber('div', {
      owner: fiber('_InternalCard', {
        owner: fiber('PublicCard'),
      }),
    }))

    expect(getElementComponentName(element)).toBe('_InternalCard')
    expect(getElementComponentName(element, {
      includeUnderscorePrefixed: false,
    })).toBe('PublicCard')
  })

  it('supports ForwardRef render names', () => {
    const element = document.createElement('button')
    attachFiber(element, fiber('button', {
      owner: {
        name: '',
        tag: 11,
        type: { render: { name: 'ForwardRefButton' } },
        _debugOwner: fiber('OuterOwner'),
      } as ReactFiberNode,
    }))

    expect(getElementComponentName(element)).toBe('ForwardRefButton')
  })

  it('returns undefined when no Fiber exists', () => {
    expect(getElementComponentName(document.createElement('div'))).toBeUndefined()
  })

  it('returns undefined when no eligible component exists', () => {
    const element = document.createElement('div')
    attachFiber(element, fiber('Fragment', {
      owner: fiber('Suspense', {
        return: fiber('_InternalOnly'),
      }),
    }))

    expect(getElementComponentName(element, {
      includeUnderscorePrefixed: false,
    })).toBeUndefined()
  })
})
