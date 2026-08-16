import { resolveElementSourceContext } from 'dom-element-to-component-source/server'

export async function GET() {
  const result = await resolveElementSourceContext({
    invocations: [{ file: 'src/already-resolved.tsx', line: 1, column: 0 }],
  }, { projectRoot: process.cwd() })

  return Response.json(result)
}
