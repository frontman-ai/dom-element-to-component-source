import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { setTimeout } from 'timers/promises'

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

describe('E2E React 19 - getElementSourceContext Test', () => {
  let devServer: ChildProcess | null = null
  const SERVER_PORT = 3001
  const SERVER_URL = `http://localhost:${SERVER_PORT}`
  const REACT19_FIXTURE_PATH = join(__dirname, 'fixtures', 'react19')

  beforeAll(async () => {
    console.log('📦 Installing dependencies...')
    
    // Install dependencies first
    const installProcess = spawn('yarn', ['install'], {
      cwd: REACT19_FIXTURE_PATH,
      stdio: 'pipe',
    })
    
    await new Promise<void>((resolve, reject) => {
      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Dependencies installed successfully')
          resolve()
        } else {
          reject(new Error(`yarn install failed with code ${code}`))
        }
      })
      
      installProcess.on('error', (error) => {
        reject(error)
      })
    })
    
    console.log('🚀 Starting React 19 dev server...')
    
    devServer = spawn('yarn', ['dev'], {
      cwd: REACT19_FIXTURE_PATH,
      stdio: 'pipe',
      detached: true,
    })

    devServer.on('error', (error) => {
      console.error('❌ Failed to start dev server:', error)
      throw error
    })

    devServer.stdout?.on('data', (data) => {
      console.log('📝 Dev server output:', data.toString())
    })

    devServer.stderr?.on('data', (data) => {
      console.error('⚠️  Dev server error:', data.toString())
    })

    await waitForServer(SERVER_URL, 30000)
    console.log('✅ React 19 dev server is ready!')
  }, 20000)

  afterAll(async () => {
    if (devServer) {
      console.log('🛑 Shutting down React 19 dev server...')
      await stopProcess(devServer)
      devServer = null
      console.log('✅ React 19 dev server stopped')
    }
  })

  it('extracts explicit source context from an h2 in Card', async () => {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      console.log('Navigating to React 19 app...')
      await page.goto(SERVER_URL)
      console.log(`Using app URL: ${SERVER_URL}`)
      
      console.log('Waiting for card component...')
      await page.waitForSelector('[data-testid="card-component"]', { timeout: 10000 })
      
      //@ts-ignore
      await page.waitForFunction(() => typeof window.getElementSourceContext === 'function', { timeout: 10000 })
      
      const h2Element = await page.$('h2.card-title')
      expect(h2Element).toBeTruthy()
      
      const result = await page.evaluate(() => {
        const h2 = document.querySelector('h2.card-title')
        if (!h2) return null
        
        //@ts-ignore
        return window.getElementSourceContext(h2)
      })
      
      expect(result).toBeTruthy()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      
      // Verify basic source location fields
      expect(result.data.definition.file).toContain('Card.tsx')
      expect(result.data.definition.componentName).toBe('Card')
      expect(result.data.definition.tagName).toBe('H2')
      expect(result.data.invocations).toBeInstanceOf(Array)
      
    } finally {
      await browser.close()
    }
  })

  it('extracts explicit source context from a forwardRef button', async () => {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      console.log('Navigating to React 19 app...')
      await page.goto(SERVER_URL)
      
      console.log('Waiting for forwardRef button...')
      await page.waitForSelector('[data-testid="increment-button"]', { timeout: 10000 })
      
      //@ts-ignore
      await page.waitForFunction(() => typeof window.getElementSourceContext === 'function', { timeout: 10000 })
      
      const buttonElement = await page.$('[data-testid="increment-button"]')
      expect(buttonElement).toBeTruthy()
      
      const result = await page.evaluate(() => {
        const button = document.querySelector('[data-testid="increment-button"]')
        if (!button) return null
        
        //@ts-ignore
        return window.getElementSourceContext(button)
      })
      
      expect(result).toBeTruthy()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      
      expect(result.data.definition.file).toContain('Button.tsx')
      expect(result.data.definition.componentName).toBe('Button')
      expect(result.data.definition.tagName).toBe('BUTTON')
      expect(result.data.invocations).toBeInstanceOf(Array)
      
    } finally {
      await browser.close()
    }
  })
})
