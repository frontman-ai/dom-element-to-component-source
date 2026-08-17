import { describe, expect, it } from 'vitest'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveElementSourceContext } from '../src/server'
import { ElementSourceContext, SourceResolutionErrorCode } from '../src/types'

const projectRoot = resolve(__dirname, 'fixtures/server-source-map')
const generatedRoot = resolve(projectRoot, 'generated')

function serverLocation(file: string, line: number = 1, column: number = 0) {
  return {
    file: `about://React/Server/${pathToFileURL(resolve(generatedRoot, file)).href}`,
    line,
    column,
  }
}

function expectErrorCode(
  result: Awaited<ReturnType<typeof resolveElementSourceContext>>,
  code: SourceResolutionErrorCode,
): void {
  expect(result).toMatchObject({
    success: false,
    error: { code, message: expect.any(String) },
  })
}

describe('resolveElementSourceContext', () => {
  it('resolves definition and ordered invocations across encoded, turbopack, webpack, relative, and ordinary paths', async () => {
    const ordinaryInvocation = {
      file: 'src/already-browser-resolved.tsx',
      line: 8,
      column: 3,
      componentName: 'BrowserOwner',
    }
    const context: ElementSourceContext = {
      definition: {
        ...serverLocation('[encoded].js'),
        componentName: 'Definition',
        tagName: 'MAIN',
      },
      invocations: [
        { ...serverLocation('webpack.js'), componentName: 'NearestOwner' },
        { ...serverLocation('relative.js'), componentName: 'FartherOwner' },
        ordinaryInvocation,
      ],
    }

    const result = await resolveElementSourceContext(context, { projectRoot })

    expect(result).toEqual({
      success: true,
      data: {
        definition: {
          file: resolve(projectRoot, 'src/turbopack.tsx').split(sep).join('/'),
          line: 11,
          column: 2,
          componentName: 'Definition',
          tagName: 'MAIN',
        },
        invocations: [
          {
            file: resolve(projectRoot, 'src/webpack.tsx').split(sep).join('/'),
            line: 12,
            column: 3,
            componentName: 'NearestOwner',
          },
          {
            file: resolve(projectRoot, 'src/relative.tsx').split(sep).join('/'),
            line: 13,
            column: 4,
            componentName: 'FartherOwner',
          },
          ordinaryInvocation,
        ],
      },
    })
  })

  it('supports alternate maps and webpack project source variants', async () => {
    const context: ElementSourceContext = {
      definition: serverLocation('alternate.js'),
      invocations: [serverLocation('webpack-project.js')],
    }

    const result = await resolveElementSourceContext(context, { projectRoot })

    expect(result).toEqual({
      success: true,
      data: {
        definition: {
          file: resolve(projectRoot, 'src/alternate.tsx').split(sep).join('/'),
          line: 14,
          column: 5,
        },
        invocations: [{
          file: resolve(projectRoot, 'src/webpack-project.tsx').split(sep).join('/'),
          line: 15,
          column: 6,
        }],
      },
    })
  })

  it('converts original file URLs to filesystem paths', async () => {
    const result = await resolveElementSourceContext({
      invocations: [serverLocation('file-url.js')],
    }, { projectRoot })

    expect(result).toEqual({
      success: true,
      data: {
        invocations: [{ file: '/src/file-url.tsx', line: 16, column: 7 }],
      },
    })
  })

  it('accepts generated files in child paths beginning with two dots', async () => {
    const generatedPath = resolve(projectRoot, '..cache', 'child.js')
    const result = await resolveElementSourceContext({
      invocations: [{
        file: `about://React/Server/${pathToFileURL(generatedPath).href}`,
        line: 1,
        column: 0,
      }],
    }, { projectRoot })

    expect(result).toEqual({
      success: true,
      data: {
        invocations: [{
          file: resolve(projectRoot, 'src/cache-child.tsx').split(sep).join('/'),
          line: 1,
          column: 0,
        }],
      },
    })
  })

  it.each([
    [
      'INVALID_REACT_URL for non-file React URLs',
      { file: 'about://React/Server/https://example.com/chunk.js', line: 1, column: 0 },
      'INVALID_REACT_URL',
    ],
    ['malformed React URLs', { file: 'about://React/Server/not a URL', line: 1, column: 0 }, 'INVALID_REACT_URL'],
    ['missing generated files', serverLocation('missing.js'), 'GENERATED_FILE_NOT_FOUND'],
    [
      'GENERATED_FILE_NOT_FOUND for out-of-root files',
      { file: `about://React/Server/${pathToFileURL(__filename).href}`, line: 1, column: 0 },
      'GENERATED_FILE_NOT_FOUND',
    ],
    ['missing source maps', serverLocation('no-map.js'), 'SOURCE_MAP_NOT_FOUND'],
    ['unmapped positions', serverLocation('no-position.js'), 'POSITION_NOT_FOUND'],
    ['malformed maps', serverLocation('malformed.js'), 'RESOLUTION_FAILED'],
  ] as const)('returns the documented error for %s', async (_case, location, code) => {
    const result = await resolveElementSourceContext({
      invocations: [location],
    }, { projectRoot })

    expectErrorCode(result, code)
  })
})
