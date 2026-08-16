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
  expect(result).toMatchObject({ success: false, error: { code } })
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

  it('returns INVALID_REACT_URL for malformed React virtual locations', async () => {
    const result = await resolveElementSourceContext({
      invocations: [{
        file: 'about://React/Server/https://example.com/chunk.js',
        line: 1,
        column: 0,
      }],
    }, { projectRoot })

    expectErrorCode(result, 'INVALID_REACT_URL')
  })

  it('returns GENERATED_FILE_NOT_FOUND for missing or out-of-root generated files', async () => {
    const missing = await resolveElementSourceContext({
      invocations: [serverLocation('missing.js')],
    }, { projectRoot })
    const outside = await resolveElementSourceContext({
      invocations: [{
        file: `about://React/Server/${pathToFileURL(__filename).href}`,
        line: 1,
        column: 0,
      }],
    }, { projectRoot })

    expectErrorCode(missing, 'GENERATED_FILE_NOT_FOUND')
    expectErrorCode(outside, 'GENERATED_FILE_NOT_FOUND')
  })

  it('returns SOURCE_MAP_NOT_FOUND instead of an unchanged virtual location', async () => {
    const result = await resolveElementSourceContext({
      invocations: [serverLocation('no-map.js')],
    }, { projectRoot })

    expectErrorCode(result, 'SOURCE_MAP_NOT_FOUND')
  })

  it('returns POSITION_NOT_FOUND when a map has no original position', async () => {
    const result = await resolveElementSourceContext({
      invocations: [serverLocation('no-position.js')],
    }, { projectRoot })

    expectErrorCode(result, 'POSITION_NOT_FOUND')
  })

  it('returns RESOLUTION_FAILED for malformed source maps', async () => {
    const result = await resolveElementSourceContext({
      invocations: [serverLocation('malformed.js')],
    }, { projectRoot })

    expectErrorCode(result, 'RESOLUTION_FAILED')
  })
})
