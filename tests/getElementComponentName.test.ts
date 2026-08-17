// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { getElementComponentName } from '../src/browser'
import type { ReactFiberNode } from '../src/types'

function fiber(name: string, extra: Partial<ReactFiberNode> = {}): ReactFiberNode {
  return { name, ...extra }
}

function componentName(
  reactFiber: ReactFiberNode,
  key = '__reactFiber$test',
): string | undefined {
  const element = document.createElement('div')
  Object.assign(element, { [key]: reactFiber })
  return getElementComponentName(element)
}

describe('getElementComponentName', () => {
  it.each([
    [
      'owners before return fibers',
      fiber('div', { owner: fiber('Owner'), return: fiber('Return') }),
      '__reactFiber$test',
      'Owner',
    ],
    [
      'debug owners before alternate owners',
      fiber('div', { _debugOwner: fiber('DebugOwner'), owner: fiber('Owner') }),
      '__reactFiber$test',
      'DebugOwner',
    ],
    [
      'Fiber names before type names',
      fiber('div', {
        owner: fiber('FiberName', { type: { displayName: 'Display', name: 'Type' } }),
      }),
      '__reactFiber$test',
      'FiberName',
    ],
    ['_reactFiber$ keys', fiber('div', { owner: fiber('Dynamic') }), '_reactFiber$test', 'Dynamic'],
    [
      '__reactInternalInstance$ keys',
      fiber('div', { owner: fiber('Legacy') }),
      '__reactInternalInstance$test',
      'Legacy',
    ],
  ])('supports %s', (_case, reactFiber, key, expected) => {
    expect(componentName(reactFiber, key)).toBe(expected)
  })

  it('bounds traversal and defaults maxDepth to 10', () => {
    const element = document.createElement('div')
    Object.assign(element, {
      __reactFiber$test: fiber('div', {
        owner: fiber('Skip', { owner: fiber('Target') }),
      }),
    })
    const excludedNames = ['Skip']

    expect(getElementComponentName(element, { excludedNames, maxDepth: 1 })).toBeUndefined()
    expect(getElementComponentName(element, { excludedNames, maxDepth: 2 })).toBe('Target')

    let owner = fiber('Target')
    for (let depth = 0; depth < 10; depth++) owner = fiber(`Skip${depth}`, { owner })
    Object.assign(element, { __reactFiber$test: fiber('div', { owner }) })
    expect(getElementComponentName(element, {
      excludedNames: Array.from({ length: 10 }, (_, depth) => `Skip${9 - depth}`),
    })).toBeUndefined()
  })

  it('combines structural, caller, and underscore exclusions', () => {
    const element = document.createElement('div')
    Object.assign(element, {
      __reactFiber$test: fiber('div', {
        owner: fiber('Fragment', {
          owner: fiber('Suspense', {
            owner: fiber('Framework', {
              owner: fiber('_Internal', { owner: fiber('Card') }),
            }),
          }),
        }),
      }),
    })
    const excludedNames = ['Framework']

    expect(getElementComponentName(element, { excludedNames })).toBe('_Internal')
    expect(getElementComponentName(element, {
      excludedNames,
      includeUnderscorePrefixed: false,
    })).toBe('Card')
  })

  it('uses ForwardRef render names before enclosing owners', () => {
    expect(componentName(fiber('button', {
      owner: {
        name: '',
        tag: 11,
        type: { render: { name: 'ForwardRefButton' } },
        _debugOwner: fiber('OuterOwner'),
      },
    }))).toBe('ForwardRefButton')
  })

  it('returns undefined for missing or ineligible Fibers', () => {
    expect(getElementComponentName(document.createElement('div'))).toBeUndefined()
    expect(componentName(fiber('div', {
      owner: fiber('Fragment', { owner: fiber('Suspense') }),
    }))).toBeUndefined()
  })
})
