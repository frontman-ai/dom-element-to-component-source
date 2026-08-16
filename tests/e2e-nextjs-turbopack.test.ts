import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright'
import { basename, join } from 'node:path'
import { spawn, ChildProcess } from 'child_process'
import { setTimeout } from 'timers/promises'
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

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch (error) {
    }
    
    await setTimeout(1000)
  }
  
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`)
}

async function stopProcess(process: ChildProcess): Promise<void> {
  if (!process.pid) return

  try {
    globalThis.process.kill(-process.pid, 'SIGTERM')
  } catch {
    return
  }
  await setTimeout(500)
  try {
    globalThis.process.kill(-process.pid, 'SIGKILL')
  } catch {
    // Process group already exited.
  }
}

async function run(command: string, args: string[], cwd: string): Promise<string> {
  const child = spawn(command, args, { cwd, stdio: 'pipe' })
  let output = ''
  child.stdout?.on('data', data => { output += data.toString() })
  child.stderr?.on('data', data => { output += data.toString() })

  return new Promise((resolve, reject) => {
    child.on('close', code => code === 0
      ? resolve(output)
      : reject(new Error(`${command} ${args.join(' ')} failed with code ${code}\n${output}`)))
    child.on('error', reject)
  })
}

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

    productionServer = spawn('npm', ['run', 'start'], {
      cwd: nextjsFixturePath,
      stdio: 'pipe',
      detached: true,
    })

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
