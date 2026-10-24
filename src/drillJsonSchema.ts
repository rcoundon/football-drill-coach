import { z } from 'zod'
import { BundleSchema } from './schema'

/**
 * The drill file format as JSON Schema, published at /drill.schema.json by
 * the `agent-docs` plugin in vite.config.ts. Kept out of schema.ts so the
 * converter never reaches the app's bundle.
 *
 * `input`, so a field the app fills in with a default is optional to the
 * writer, as it is to the import.
 */
export function drillJsonSchema(): string {
  const schema = z.toJSONSchema(BundleSchema, { io: 'input' })
  return JSON.stringify({ ...schema, title: 'Tactics Board drill file' }, null, 2)
}
