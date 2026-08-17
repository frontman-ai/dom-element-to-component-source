import { resolveElementSourceContext } from 'dom-element-to-component-source/server'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function GET() {
  const generatedFile = resolve(process.cwd(), 'source-map-fixture', 'generated.js')
  const result = await resolveElementSourceContext({
    invocations: [{
      file: `about://React/Server/${pathToFileURL(generatedFile).href}`,
      line: 1,
      column: 0,
    }],
  }, { projectRoot: process.cwd() })

  return Response.json(result)
}
