import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '..')

describe('package build', () => {
  it('installs importable exports from the exact Git commit', async () => {
    const consumerRoot = mkdtempSync(resolve(tmpdir(), 'dom-source-git-consumer-'))
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim()

    try {
      writeFileSync(resolve(consumerRoot, 'package.json'), JSON.stringify({
        private: true, packageManager: 'yarn@4.10.3',
      }))
      writeFileSync(resolve(consumerRoot, '.yarnrc.yml'), 'nodeLinker: node-modules\n')

      execFileSync('yarn', [
        'add',
        `dom-element-to-component-source@https://github.com/frontman-ai/dom-element-to-component-source.git#commit=${commit}`,
      ], { cwd: consumerRoot, stdio: 'pipe' })

      const installedRoot = resolve(consumerRoot, 'node_modules', 'dom-element-to-component-source')
      const installedPackage = JSON.parse(
        readFileSync(resolve(installedRoot, 'package.json'), 'utf8'),
      )
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
        if (Object.keys(browser).join() !== 'getElementComponentName,getElementSourceContext' ||
            Object.keys(server).join() !== 'resolveElementSourceContext' ||
            [...Object.values(browser), ...Object.values(server)]
              .some(value => typeof value !== 'function')) process.exit(1)
      `], { cwd: consumerRoot, stdio: 'pipe' })
    } finally {
      rmSync(consumerRoot, { recursive: true, force: true })
    }
  }, 120000)
})
