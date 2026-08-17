import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright'
import { basename, join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { run, startServer, stopProcess, waitForServer } from './e2eHelpers'

function readJavaScriptFiles(root: string): string {
  if (!existsSync(root)) return ''

  return readdirSync(root, { withFileTypes: true })
    .map(entry => {
      const path = join(root, entry.name)
      if (entry.isDirectory()) return readJavaScriptFiles(path)
      return entry.name.endsWith('.js') ? readFileSync(path, 'utf8') : ''
    })
    .join('\n')
}

describe('E2E Next.js Turbopack - source context package entries', () => {
  let productionServer: ChildProcess | null = null
  let tempRoot: string
  let nextjsFixturePath: string
  const SERVER_PORT = 3002
  const SERVER_URL = `http://localhost:${SERVER_PORT}`
  const NEXTJS_FIXTURE_SOURCE = join(__dirname, 'fixtures', 'nextjs-turbopack')
  const PROJECT_ROOT = join(__dirname, '..')

  beforeAll(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'dom-source-nextjs-'))
    nextjsFixturePath = join(tempRoot, 'app')
    cpSync(NEXTJS_FIXTURE_SOURCE, nextjsFixturePath, {
      recursive: true,
      filter: source => !['.next', 'node_modules'].includes(basename(source)),
    })

    const packageArchive = join(tempRoot, 'dom-element-to-component-source.tgz')
    await run('yarn', ['pack', '--out', packageArchive], PROJECT_ROOT)

    const fixturePackagePath = join(nextjsFixturePath, 'package.json')
    const fixturePackage = JSON.parse(readFileSync(fixturePackagePath, 'utf8'))
    fixturePackage.dependencies['dom-element-to-component-source'] = `file:${packageArchive}`
    writeFileSync(fixturePackagePath, `${JSON.stringify(fixturePackage, null, 2)}\n`)

    await run('npm', ['install'], nextjsFixturePath)

    const installedPackageRoot = join(
      nextjsFixturePath,
      'node_modules',
      'dom-element-to-component-source',
    )
    const installedPackage = JSON.parse(readFileSync(
      join(installedPackageRoot, 'package.json'),
      'utf8',
    ))
    for (const exportedEntry of Object.values(installedPackage.exports) as Array<Record<string, string>>) {
      for (const exportedPath of Object.values(exportedEntry)) {
        expect(existsSync(join(installedPackageRoot, exportedPath))).toBe(true)
      }
    }

    await run('npm', ['run', 'build'], nextjsFixturePath)

    const browserOutput = readJavaScriptFiles(join(nextjsFixturePath, '.next', 'static', 'chunks'))
    expect(browserOutput).not.toContain('resolveElementSourceContext')
    expect(browserOutput).not.toContain('node:fs')

    productionServer = startServer('npm', ['run', 'start'], nextjsFixturePath)

    await waitForServer(SERVER_URL, 60000)
  }, 240000)

  afterAll(async () => {
    if (productionServer) {
      await stopProcess(productionServer)
      productionServer = null
    }
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  })

  it('loads the browser entry in the production application', async () => {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(SERVER_URL)
      await page.waitForSelector('[data-testid="card-component"]', { timeout: 10000 })
      
      //@ts-ignore
      await page.waitForFunction(() => typeof window.getElementSourceContext === 'function', { timeout: 10000 })
      
      const browserApiType = await page.evaluate(() => {
        //@ts-ignore
        return typeof window.getElementSourceContext
      })

      expect(browserApiType).toBe('function')
      
    } finally {
      await browser.close()
    }
  })

  it('resolves a source map through the server entry in a Turbopack route', async () => {
    const response = await fetch(`${SERVER_URL}/api/source-context`)
    const result = await response.json()

    expect(response.ok).toBe(true)
    expect(result).toEqual({
      success: true,
      data: {
        invocations: [{
          file: join(nextjsFixturePath, 'app', 'components', 'Card.tsx'),
          line: 1,
          column: 0,
        }],
      },
    })
  })
})
