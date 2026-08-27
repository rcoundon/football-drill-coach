import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
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
