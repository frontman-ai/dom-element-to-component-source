// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { getElementSourceContext } from '../src/browser'
import type { ReactFiberNode } from '../src/types'

function attachFiber(element: Element, fiber: ReactFiberNode): void {
  Object.assign(element, { __reactFiber$test: fiber })
}

function serverStack(file: string, line: number, column: number): Error {
  return {
    stack: `Error\n at JSX (react-stack-top-frame:1:1)\n at Component (about://React/Server/file:///app/.next/server/${file}?9:${line}:${column})`,
  } as Error
}

describe('getElementSourceContext', () => {
  it('returns the server definition, ordered bounded ancestry, and serializable props without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const element = document.createElement('div')
    attachFiber(element, {
      name: 'div',
      _debugSource: { fileName: 'browser.js', lineNumber: 1, columnNumber: 0 },
      _debugStack: serverStack('%5Bavatar%5D.js', 10, 7),
      memoizedProps: { children: 'JJ Kasper', className: 'avatar-name' },
      _debugOwner: {
        name: 'Avatar',
        debugLocation: serverStack('%5Bavatar%5D.js', 10, 7),
        debugStack: serverStack('hero.js', 42, 11),
        memoizedProps: { name: 'JJ Kasper', picture: '/avatar.jpg', onClick: () => undefined },
        owner: {
          name: 'Hero',
          debugStack: serverStack('page.js', 18, 5),
          pendingProps: { featured: true },
          owner: { name: 'Index', memoizedProps: { locale: 'en' } },
        },
      },
    })

    await expect(getElementSourceContext(element)).resolves.toEqual({
      success: true,
      data: {
        definition: {
          file: 'about://React/Server/file:///app/.next/server/%5Bavatar%5D.js',
          line: 10,
          column: 7,
          componentName: 'Avatar',
          componentProps: { name: 'JJ Kasper', picture: '/avatar.jpg' },
          tagName: 'DIV',
        },
        invocations: [
          {
            file: 'about://React/Server/file:///app/.next/server/hero.js',
            line: 42,
            column: 11,
            componentName: 'Hero',
            componentProps: { featured: true },
            tagName: 'DIV',
          },
          {
            file: 'about://React/Server/file:///app/.next/server/page.js',
            line: 18,
            column: 5,
            componentName: 'Index',
            componentProps: { locale: 'en' },
            tagName: 'DIV',
          },
        ],
      },
    })

    const bounded = await getElementSourceContext(element, { maxDepth: 1 })
    expect(bounded).toMatchObject({ success: true })
    if (bounded.success) {
      expect(bounded.data.invocations).toHaveLength(1)
      expect(bounded.data.invocations[0].componentName).toBe('Hero')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('preserves a client definition beneath server owner invocations', async () => {
    const element = document.createElement('button')
    attachFiber(element, {
      name: 'button',
      _debugSource: { fileName: 'src/Avatar.tsx', lineNumber: 10, columnNumber: 7 },
      _debugOwner: {
        name: 'Avatar',
        debugStack: serverStack('hero.js', 42, 11),
        owner: { name: 'Hero' },
      },
    })

    await expect(getElementSourceContext(element)).resolves.toMatchObject({
      success: true,
      data: {
        definition: { file: 'src/Avatar.tsx', componentName: 'Avatar' },
        invocations: [{
          file: 'about://React/Server/file:///app/.next/server/hero.js',
          componentName: 'Hero',
        }],
      },
    })
  })

  it('returns an ordinary ForwardRef browser definition unchanged', async () => {
    const element = document.createElement('button')
    attachFiber(element, {
      name: '',
      tag: 11,
      type: { render: { name: 'Button' } },
      _debugSource: { fileName: 'src/Button.tsx', lineNumber: 8, columnNumber: 4 },
    })

    await expect(getElementSourceContext(element)).resolves.toMatchObject({
      success: true,
      data: {
        definition: { file: 'src/Button.tsx', componentName: 'Button' },
        invocations: [],
      },
    })
  })

  it('returns invocation-only context when no definition exists', async () => {
    const element = document.createElement('article')
    attachFiber(element, {
      name: 'article',
      _debugOwner: { name: 'Post', debugStack: serverStack('page.js', 30, 2) },
    })

    const result = await getElementSourceContext(element)
    expect(result).toMatchObject({
      success: true,
      data: { invocations: [{ componentName: 'Post' }] },
    })
    if (result.success) expect(result.data.definition).toBeUndefined()
  })

  it('keeps owner fallback while bounding return-fiber definition search', async () => {
    const element = document.createElement('article')
    attachFiber(element, {
      name: 'article',
      _debugOwner: { name: 'Post', debugStack: serverStack('page.js', 30, 2) },
      return: {
        name: 'Wrapper',
        return: { name: 'Article', _debugStack: serverStack('article.js', 12, 5) },
      },
    })

    const shallow = await getElementSourceContext(element, { maxDepth: 2 })
    expect(shallow).toMatchObject({
      success: true,
      data: { invocations: [{ componentName: 'Post' }] },
    })
    if (shallow.success) expect(shallow.data.definition).toBeUndefined()
    await expect(getElementSourceContext(element, { maxDepth: 3 })).resolves.toMatchObject({
      success: true,
      data: {
        definition: { file: 'about://React/Server/file:///app/.next/server/article.js' },
        invocations: [{ componentName: 'Post' }],
      },
    })
  })
})
