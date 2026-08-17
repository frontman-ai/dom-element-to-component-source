import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { run, startServer, stopProcess, waitForServer } from './e2eHelpers'

describe('E2E React 19 - getElementSourceContext Test', () => {
  let devServer: ChildProcess | null = null
  const SERVER_PORT = 3001
  const SERVER_URL = `http://localhost:${SERVER_PORT}`
  const REACT19_FIXTURE_PATH = join(__dirname, 'fixtures', 'react19')

  beforeAll(async () => {
    await run('yarn', ['install'], REACT19_FIXTURE_PATH)
    devServer = startServer('yarn', ['dev'], REACT19_FIXTURE_PATH)
    await waitForServer(SERVER_URL, 30000)
  }, 60000)

  afterAll(async () => {
    if (devServer) {
      await stopProcess(devServer)
      devServer = null
    }
  })

  it('extracts Card and ForwardRef source contexts', async () => {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    try {
      await page.goto(SERVER_URL)
      await page.waitForSelector('[data-testid="card-component"]', { timeout: 10000 })
      await page.waitForSelector('[data-testid="increment-button"]', { timeout: 10000 })
      await page.waitForFunction(() => typeof (window as any).getElementSourceContext === 'function')

      const [card, button] = await page.evaluate(() => {
        const h2 = document.querySelector('h2.card-title')
        const button = document.querySelector('[data-testid="increment-button"]')
        if (!h2 || !button) throw new Error('Fixture elements not found')
        return Promise.all([
          (window as any).getElementSourceContext(h2),
          (window as any).getElementSourceContext(button),
        ])
      })

      expect(card).toMatchObject({
        success: true,
        data: {
          definition: {
            file: expect.stringContaining('Card.tsx'),
            componentName: 'Card',
            tagName: 'H2',
          },
          invocations: expect.any(Array),
        },
      })
      expect(button).toMatchObject({
        success: true,
        data: {
          definition: {
            file: expect.stringContaining('Button.tsx'),
            componentName: 'Button',
            tagName: 'BUTTON',
          },
          invocations: expect.any(Array),
        },
      })
    } finally {
      await browser.close()
    }
  })
})
