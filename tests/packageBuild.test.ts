import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
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

    expect(Object.keys(browserEntry)).toEqual(['getElementSourceContext'])
    expect(typeof browserEntry.getElementSourceContext).toBe('function')
    expect(Object.keys(serverEntry)).toEqual(['resolveElementSourceContext'])
    expect(typeof serverEntry.resolveElementSourceContext).toBe('function')
  })
})
