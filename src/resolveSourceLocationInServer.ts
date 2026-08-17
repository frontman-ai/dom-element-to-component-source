import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SourceMapConsumer } from 'source-map'
import type { RawIndexMap, RawSourceMap } from 'source-map'
import {
  ElementSourceContext,
  ResolveElementSourceContextOptions,
  SourceLocation,
  SourceResolutionErrorCode,
  SourceResolutionResult,
} from './types'

const REACT_SERVER_PREFIX = 'about://React/Server/'

class SourceResolutionFailure extends Error {
  constructor(
    readonly code: SourceResolutionErrorCode,
    message: string,
  ) {
    super(message)
  }
}

function fail(code: SourceResolutionErrorCode, message: string): never {
  throw new SourceResolutionFailure(code, message)
}

function isWithinRoot(path: string, root: string): boolean {
  const relativePath = relative(root, path)
  return relativePath === '' || (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

function isRawSourceMap(value: unknown): value is RawSourceMap | RawIndexMap {
  if (!value || typeof value !== 'object') {
    return false
  }

  const map = value as Record<string, unknown>
  if (typeof map.version !== 'number') {
    return false
  }

  if (Array.isArray(map.sections)) {
    return map.sections.every(section => {
      if (!section || typeof section !== 'object') {
        return false
      }
      const { offset, map: sectionMap } = section as Record<string, unknown>
      if (!offset || typeof offset !== 'object') {
        return false
      }
      const position = offset as Record<string, unknown>
      return typeof position.line === 'number' &&
        typeof position.column === 'number' &&
        isRawSourceMap(sectionMap)
    })
  }

  return Array.isArray(map.sources) &&
    map.sources.every(source => typeof source === 'string') &&
    Array.isArray(map.names) &&
    map.names.every(name => typeof name === 'string') &&
    typeof map.mappings === 'string'
}

async function getCanonicalGeneratedPath(
  location: SourceLocation,
  projectRoot: string,
): Promise<string> {
  const rawUrl = location.file.slice(REACT_SERVER_PREFIX.length)
  let generatedPath: string
  try {
    const generatedUrl = new URL(rawUrl)
    if (generatedUrl.protocol !== 'file:') {
      return fail('INVALID_REACT_URL', `React virtual location is not a file URL: ${location.file}`)
    }
    generatedPath = fileURLToPath(generatedUrl)
  } catch {
    return fail('INVALID_REACT_URL', `Invalid React virtual location: ${location.file}`)
  }

  try {
    const canonicalPath = await realpath(generatedPath)
    const generatedStat = await stat(canonicalPath)
    if (!generatedStat.isFile() || !isWithinRoot(canonicalPath, projectRoot)) {
      return fail(
        'GENERATED_FILE_NOT_FOUND',
        `Generated file is not inside project root: ${generatedPath}`,
      )
    }
    return canonicalPath
  } catch (error) {
    if (error instanceof SourceResolutionFailure) {
      throw error
    }
    return fail('GENERATED_FILE_NOT_FOUND', `Generated file not found: ${generatedPath}`)
  }
}

async function getCanonicalSourceMapPath(
  generatedPath: string,
  projectRoot: string,
): Promise<string> {
  const candidates = [
    `${generatedPath}.map`,
    ...(generatedPath.endsWith('.js') ? [generatedPath.replace(/\.js$/, '.map')] : []),
  ]

  for (const candidate of candidates) {
    try {
      const canonicalPath = await realpath(candidate)
      const mapStat = await stat(canonicalPath)
      if (mapStat.isFile() && isWithinRoot(canonicalPath, projectRoot)) {
        return canonicalPath
      }
    } catch {
      // Try the alternate source-map name.
    }
  }

  return fail('SOURCE_MAP_NOT_FOUND', `Source map not found for ${generatedPath}`)
}

function resolveOriginalSource(
  source: string,
  sourceMapPath: string,
  projectRoot: string,
): string {
  const projectPrefixes = [
    'turbopack:///[project]/',
    'webpack:///[project]/',
  ]
  const projectPrefix = projectPrefixes.find(prefix => source.startsWith(prefix))
  if (projectPrefix) {
    return resolve(projectRoot, source.slice(projectPrefix.length)).replace(/\\/g, '/')
  }

  const webpackProjectSource = source.match(/^webpack:\/\/[^/]*\/(?:\.\/)?(.+)$/)
  if (webpackProjectSource) {
    return resolve(projectRoot, webpackProjectSource[1]).replace(/\\/g, '/')
  }

  if (source.startsWith('file:')) {
    try {
      return fileURLToPath(source).replace(/\\/g, '/')
    } catch {
      return fail('RESOLUTION_FAILED', `Invalid original source file URL: ${source}`)
    }
  }

  const sourcePath = isAbsolute(source)
    ? source
    : resolve(dirname(sourceMapPath), source)
  return sourcePath.replace(/\\/g, '/')
}

async function resolveSourceLocation(
  location: SourceLocation,
  projectRoot: string,
): Promise<SourceLocation> {
  if (!location.file.startsWith(REACT_SERVER_PREFIX)) {
    return location
  }

  const generatedPath = await getCanonicalGeneratedPath(location, projectRoot)
  const sourceMapPath = await getCanonicalSourceMapPath(generatedPath, projectRoot)

  let rawSourceMap: RawSourceMap | RawIndexMap
  try {
    const parsedSourceMap: unknown = JSON.parse(await readFile(sourceMapPath, 'utf8'))
    if (!isRawSourceMap(parsedSourceMap)) {
      return fail('RESOLUTION_FAILED', `Invalid source map structure: ${sourceMapPath}`)
    }
    rawSourceMap = parsedSourceMap
  } catch (error) {
    return fail(
      'RESOLUTION_FAILED',
      `Failed to read source map ${sourceMapPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }

  let original: ReturnType<SourceMapConsumer['originalPositionFor']>
  try {
    original = await SourceMapConsumer.with(rawSourceMap, null, consumer =>
      consumer.originalPositionFor({ line: location.line, column: location.column }),
    )
  } catch (error) {
    return fail(
      'RESOLUTION_FAILED',
      `Failed to consume source map ${sourceMapPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }

  if (original.source === null || original.line === null) {
    return fail(
      'POSITION_NOT_FOUND',
      `No original position for ${generatedPath}:${location.line}:${location.column}`,
    )
  }

  return {
    ...location,
    file: resolveOriginalSource(original.source, sourceMapPath, projectRoot),
    line: original.line,
    column: original.column ?? location.column,
  }
}

/**
 * Resolves React virtual locations. Returned source paths are untrusted output;
 * consumers must authorize them before reading or exposing them.
 */
export async function resolveElementSourceContext(
  context: ElementSourceContext,
  options: ResolveElementSourceContextOptions,
): Promise<SourceResolutionResult> {
  try {
    const projectRoot = await realpath(options.projectRoot)
    const definition = context.definition
      ? await resolveSourceLocation(context.definition, projectRoot)
      : undefined
    const invocations: SourceLocation[] = []
    for (const invocation of context.invocations) {
      invocations.push(await resolveSourceLocation(invocation, projectRoot))
    }

    return {
      success: true,
      data: definition ? { definition, invocations } : { invocations },
    }
  } catch (error) {
    if (error instanceof SourceResolutionFailure) {
      return {
        success: false,
        error: { code: error.code, message: error.message },
      }
    }

    return {
      success: false,
      error: {
        code: 'RESOLUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown source resolution error',
      },
    }
  }
}
