import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '..')
const distRoot = resolve(projectRoot, 'dist')

describe('package build', () => {
  it('packs importable, separated browser and server entries from a clean checkout', async () => {
    const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
    expect(packageJson.scripts.prepack).toBe('yarn build')

    const packOutput = execFileSync(
      'yarn',
      ['pack', '--dry-run', '--json'],
      { cwd: projectRoot, encoding: 'utf8' },
    )

    expect(packOutput).toContain('dist/dom-element-to-component-source.es.mjs')
    expect(packOutput).toContain('dist/browser.d.ts')
    expect(packOutput).toContain('dist/server.mjs')
    expect(packOutput).toContain('dist/server.d.ts')

    const browserBundle = readFileSync(
      resolve(distRoot, 'dom-element-to-component-source.es.mjs'),
      'utf8',
    )
    const serverBundle = readFileSync(resolve(distRoot, 'server.mjs'), 'utf8')

    expect(browserBundle).not.toContain('node:fs')
    expect(browserBundle).not.toContain('source-map')
    expect(browserBundle).not.toContain('resolveElementSourceContext')
    expect(serverBundle).toContain('from "source-map"')
    expect(serverBundle).not.toContain('createRequire')
    expect(serverBundle).not.toContain('mappings.wasm')

    const browserEntry = await import(pathToFileURL(
      resolve(distRoot, 'dom-element-to-component-source.es.mjs'),
    ).href)
    const serverEntry = await import(pathToFileURL(resolve(distRoot, 'server.mjs')).href)

    expect(Object.keys(browserEntry)).toEqual([
      'getElementComponentName',
      'getElementSourceContext',
    ])
    expect(typeof browserEntry.getElementComponentName).toBe('function')
    expect(typeof browserEntry.getElementSourceContext).toBe('function')
    expect(Object.keys(serverEntry)).toEqual(['resolveElementSourceContext'])
    expect(typeof serverEntry.resolveElementSourceContext).toBe('function')
  })

  it('installs importable exports from the exact Git commit', async () => {
    const consumerRoot = mkdtempSync(resolve(tmpdir(), 'dom-source-git-consumer-'))
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim()

    try {
      writeFileSync(resolve(consumerRoot, 'package.json'), JSON.stringify({
        private: true,
        packageManager: 'yarn@4.10.3',
      }))
      writeFileSync(resolve(consumerRoot, '.yarnrc.yml'), 'nodeLinker: node-modules\n')

      execFileSync('yarn', [
        'add',
        `dom-element-to-component-source@https://github.com/frontman-ai/dom-element-to-component-source.git#commit=${commit}`,
      ], { cwd: consumerRoot, stdio: 'pipe' })

      const installedRoot = resolve(
        consumerRoot,
        'node_modules',
        'dom-element-to-component-source',
      )
      const installedPackage = JSON.parse(readFileSync(
        resolve(installedRoot, 'package.json'),
        'utf8',
      ))
      for (const exportedEntry of Object.values(installedPackage.exports) as Array<
        Record<string, string>
      >) {
        for (const exportedPath of Object.values(exportedEntry)) {
          expect(existsSync(resolve(installedRoot, exportedPath))).toBe(true)
        }
      }

      execFileSync('node', ['--input-type=module', '--eval', `
        const browser = await import('dom-element-to-component-source')
        const server = await import('dom-element-to-component-source/server')
        if (typeof browser.getElementComponentName !== 'function' ||
            typeof browser.getElementSourceContext !== 'function' ||
            typeof server.resolveElementSourceContext !== 'function') process.exit(1)
      `], { cwd: consumerRoot, stdio: 'pipe' })
    } finally {
      rmSync(consumerRoot, { recursive: true, force: true })
    }
  }, 120000)
})
