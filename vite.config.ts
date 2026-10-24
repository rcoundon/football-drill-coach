import { readFileSync } from 'node:fs'
import { configDefaults, defineConfig } from 'vitest/config'
import { runnerImport, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Publish the drill-writing guide with the site, so an agent visiting it can
 * find out how to make drills for it: /llms.txt (the convention agents look
 * for), /agents.md, /demo-drills.json and /drill.schema.json.
 *
 * Read from where they already live rather than copied into public/, and
 * the JSON Schema generated from the same Zod schema the app checks imports
 * against, so nothing published can drift from what the app accepts.
 */
const AGENT_DOCS: Record<string, { from: string; type: string }> = {
  'llms.txt': { from: 'docs/llms.txt', type: 'text/plain; charset=utf-8' },
  'agents.md': { from: 'AGENTS.md', type: 'text/markdown; charset=utf-8' },
  'demo-drills.json': { from: 'docs/demo-drills.json', type: 'application/json; charset=utf-8' },
  'drill.schema.json': { from: 'src/drillJsonSchema.ts', type: 'application/schema+json; charset=utf-8' },
}

/**
 * Loaded through Vite's own module runner rather than imported at the top of
 * this file: the config is loaded by Node, which cannot resolve the app's
 * extensionless TypeScript imports.
 */
async function docSource(fileName: string): Promise<string | Buffer> {
  if (fileName !== 'drill.schema.json') return readFileSync(AGENT_DOCS[fileName].from)
  const { module } = await runnerImport<typeof import('./src/drillJsonSchema')>('./src/drillJsonSchema.ts')
  return module.drillJsonSchema()
}

function agentDocs(): Plugin {
  return {
    name: 'agent-docs',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const fileName = (req.url ?? '').split('?')[0].replace(/^\//, '')
        const doc = AGENT_DOCS[fileName]
        if (!doc) return next()
        res.setHeader('Content-Type', doc.type)
        res.end(await docSource(fileName))
      })
    },
    async generateBundle() {
      for (const fileName of Object.keys(AGENT_DOCS)) {
        this.emitFile({ type: 'asset', fileName, source: await docSource(fileName) })
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), agentDocs()],
  test: {
    globals: true,
    environment: 'jsdom',
    /*
     * One jsdom per worker rather than one per spec file: standing up a
     * fresh environment 46 times was half the wall clock. vmThreads keeps
     * each file in its own VM context, so specs still cannot see each
     * other's globals.
     */
    pool: 'vmThreads',
    setupFiles: ['tests/setup.ts'],
    /*
     * A git worktree checked out inside the project — .worktrees/<branch> —
     * carries a full copy of the tests, and vitest's default patterns sweep
     * them up alongside this checkout's own: every spec runs twice and the
     * copies fail against the wrong dependency tree.
     *
     * Excluded rather than narrowing `include` to `tests/**`, which would fix
     * this run while silently dropping any future spec that lands elsewhere —
     * a suite reporting green for a test it never collected.
     */
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
})
