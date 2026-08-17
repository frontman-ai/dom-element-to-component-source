import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

export async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
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

export function startServer(command: string, args: string[], cwd: string): ChildProcess {
  return spawn(command, args, { cwd, stdio: 'inherit', detached: true })
}

export async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await setTimeout(250)
  }

  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`)
}

export async function stopProcess(child: ChildProcess): Promise<void> {
  if (!child.pid) return

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    return
  }
  await setTimeout(500)
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Process group already exited.
  }
}
