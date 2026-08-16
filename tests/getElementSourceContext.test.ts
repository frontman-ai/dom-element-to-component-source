// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { getElementSourceContext } from '../src/browser'
import { ReactFiberNode } from '../src/types'

function attachFiber(element: Element, fiber: ReactFiberNode): void {
  Object.assign(element, { __reactFiber$synthetic: fiber })
}

function serverStack(file: string, line: number, column: number): Error {
  return {
    stack: `Error\n    at fakeJSXCallSite (react-stack-top-frame:1:1)\n    at Component (about://React/Server/file:///app/.next/server/${file}?9:${line}:${column})`,
  } as Error
}

describe('getElementSourceContext', () => {
  it('returns a server definition and nearest-to-farthest invocation ancestry without fetching virtual paths', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const element = document.createElement('div')
    attachFiber(element, {
      name: 'div',
      _debugOwner: {
        name: 'Avatar',
        debugLocation: serverStack('avatar.js', 10, 7),
        debugStack: serverStack('hero-post.js', 42, 11),
        owner: {
          name: 'HeroPost',
          debugStack: serverStack('page.js', 18, 5),
          owner: { name: 'Index' },
        },
      },
    })

    await expect(getElementSourceContext(element, { maxDepth: 10 })).resolves.toEqual({
      success: true,
      data: {
        definition: {
          componentName: 'Avatar',
          tagName: 'DIV',
          file: 'about://React/Server/file:///app/.next/server/avatar.js',
          line: 10,
          column: 7,
        },
        invocations: [
          {
            componentName: 'HeroPost',
            tagName: 'DIV',
            file: 'about://React/Server/file:///app/.next/server/hero-post.js',
            line: 42,
            column: 11,
          },
          {
            componentName: 'Index',
            tagName: 'DIV',
            file: 'about://React/Server/file:///app/.next/server/page.js',
            line: 18,
            column: 5,
          },
        ],
      },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('prefers a server owner definition over a host fiber browser stack', async () => {
    const element = document.createElement('div')
    attachFiber(element, {
      name: 'div',
      _debugSource: {
        fileName: 'http://localhost:3000/_next/static/chunks/app.js',
        lineNumber: 100,
        columnNumber: 3,
      },
      _debugOwner: {
        name: 'Avatar',
        debugLocation: serverStack('avatar.js', 10, 7),
      },
    })

    const result = await getElementSourceContext(element, { maxDepth: 10 })

    expect(result).toMatchObject({
      success: true,
      data: {
        definition: {
          componentName: 'Avatar',
          file: 'about://React/Server/file:///app/.next/server/avatar.js',
        },
      },
    })
  })

  it('preserves a client definition beneath server owner invocations', async () => {
    const element = document.createElement('button')
    attachFiber(element, {
      name: 'button',
      _debugSource: {
        fileName: 'src/app/_components/avatar.tsx',
        lineNumber: 10,
        columnNumber: 7,
      },
      _debugOwner: {
        name: 'Avatar',
        debugStack: serverStack('hero-post.js', 42, 11),
        owner: {
          name: 'HeroPost',
          debugStack: serverStack('page.js', 18, 5),
          owner: { name: 'Index' },
        },
      },
    })

    await expect(getElementSourceContext(element, { maxDepth: 10 })).resolves.toMatchObject({
      success: true,
      data: {
        definition: {
          componentName: 'Avatar',
          tagName: 'BUTTON',
          file: 'src/app/_components/avatar.tsx',
          line: 10,
          column: 7,
        },
        invocations: [
          {
            componentName: 'HeroPost',
            file: 'about://React/Server/file:///app/.next/server/hero-post.js',
          },
          {
            componentName: 'Index',
            file: 'about://React/Server/file:///app/.next/server/page.js',
          },
        ],
      },
    })
  })

  it('preserves encoded generated paths while removing React query counters', async () => {
    const element = document.createElement('div')
    attachFiber(element, {
      name: 'div',
      _debugStack: serverStack('%5Broot%5D.js', 100, 3),
      _debugOwner: { name: 'Avatar' },
    })

    await expect(getElementSourceContext(element, { maxDepth: 10 })).resolves.toMatchObject({
      success: true,
      data: {
        definition: {
          file: 'about://React/Server/file:///app/.next/server/%5Broot%5D.js',
          line: 100,
          column: 3,
        },
      },
    })
  })

  it('returns an ordinary browser source as the definition', async () => {
    const element = document.createElement('button')
    attachFiber(element, {
      name: 'button',
      _debugSource: {
        fileName: 'http://localhost:3000/src/Button.tsx',
        lineNumber: 8,
        columnNumber: 4,
      },
      _debugOwner: { name: 'Button' },
    })

    await expect(getElementSourceContext(element, { maxDepth: 10 })).resolves.toMatchObject({
      success: true,
      data: {
        definition: {
          componentName: 'Button',
          file: 'http://localhost:3000/src/Button.tsx',
          line: 8,
          column: 4,
        },
        invocations: [],
      },
    })
  })

  it('returns owner invocations when a JSX definition is unavailable', async () => {
    const element = document.createElement('article')
    attachFiber(element, {
      name: 'article',
      _debugOwner: {
        name: 'Post',
        debugStack: serverStack('chunk.js', 42, 7),
      },
    })

    await expect(getElementSourceContext(element, { maxDepth: 10 })).resolves.toEqual({
      success: true,
      data: {
        invocations: [{
          componentName: 'Post',
          tagName: 'ARTICLE',
          file: 'about://React/Server/file:///app/.next/server/chunk.js',
          line: 42,
          column: 7,
        }],
      },
    })
  })

  it('preserves serializable props on server definitions and invocations', async () => {
    const element = document.createElement('button')
    attachFiber(element, {
      name: 'button',
      _debugStack: serverStack('button.js', 10, 7),
      memoizedProps: { label: 'Save', onClick: () => undefined },
      _debugOwner: {
        name: 'Button',
        debugStack: serverStack('form.js', 20, 3),
        pendingProps: { disabled: true, children: null },
        owner: { name: 'Form' },
      },
    })

    await expect(getElementSourceContext(element)).resolves.toEqual({
      success: true,
      data: {
        definition: {
          file: 'about://React/Server/file:///app/.next/server/button.js',
          line: 10,
          column: 7,
          componentName: 'Button',
          componentProps: { label: 'Save' },
          tagName: 'BUTTON',
        },
        invocations: [{
          file: 'about://React/Server/file:///app/.next/server/form.js',
          line: 20,
          column: 3,
          componentName: 'Form',
          componentProps: { disabled: true, children: null },
          tagName: 'BUTTON',
        }],
      },
    })
  })

  it('retains a ForwardRef name discovered by the browser stack parser', async () => {
    const element = document.createElement('button')
    attachFiber(element, {
      name: '',
      tag: 11,
      type: { render: { name: 'Button' } },
      _debugSource: {
        fileName: 'src/Button.tsx',
        lineNumber: 8,
        columnNumber: 4,
      },
    } as ReactFiberNode)

    await expect(getElementSourceContext(element)).resolves.toMatchObject({
      success: true,
      data: {
        definition: {
          componentName: 'Button',
          file: 'src/Button.tsx',
        },
      },
    })
  })

  it('keeps owner invocations while searching return fibers for a definition', async () => {
    const element = document.createElement('article')
    attachFiber(element, {
      name: 'article',
      _debugOwner: {
        name: 'Post',
        debugStack: serverStack('page.js', 30, 2),
      },
      return: {
        name: 'Wrapper',
        return: {
          name: 'Article',
          _debugStack: serverStack('article.js', 12, 5),
        },
      },
    })

    await expect(getElementSourceContext(element)).resolves.toMatchObject({
      success: true,
      data: {
        definition: {
          file: 'about://React/Server/file:///app/.next/server/article.js',
        },
        invocations: [{
          file: 'about://React/Server/file:///app/.next/server/page.js',
        }],
      },
    })
  })

  it('bounds return-fiber traversal by maxDepth', async () => {
    const element = document.createElement('div')
    attachFiber(element, {
      name: 'div',
      return: {
        name: 'Wrapper',
        return: {
          name: 'DeepComponent',
          _debugStack: serverStack('deep.js', 12, 2),
        },
      },
    })

    await expect(getElementSourceContext(element, { maxDepth: 2 })).resolves.toEqual({
      success: false,
      error: 'No source context found in fiber tree',
    })
    await expect(getElementSourceContext(element, { maxDepth: 3 })).resolves.toMatchObject({
      success: true,
      data: { definition: { file: 'about://React/Server/file:///app/.next/server/deep.js' } },
    })
  })

  it('bounds owner invocation traversal by maxDepth', async () => {
    const element = document.createElement('div')
    attachFiber(element, {
      name: 'div',
      _debugStack: serverStack('avatar.js', 10, 7),
      _debugOwner: {
        name: 'Avatar',
        debugStack: serverStack('hero-post.js', 42, 11),
        owner: {
          name: 'HeroPost',
          debugStack: serverStack('page.js', 18, 5),
          owner: { name: 'Index' },
        },
      },
    })

    const result = await getElementSourceContext(element, { maxDepth: 1 })

    expect(result).toMatchObject({ success: true })
    if (result.success) {
      expect(result.data.invocations).toHaveLength(1)
      expect(result.data.invocations[0].componentName).toBe('HeroPost')
    }
  })
})
