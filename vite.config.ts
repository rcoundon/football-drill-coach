import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    /*
     * Anchored at the project root, so a git worktree checked out inside it
     * is not swept up. Without this, `.worktrees/<branch>/tests` is globbed
     * alongside this checkout's own: every spec runs twice, the copies fail
     * against the wrong dependency tree, and the suite reports failures that
     * have nothing to do with the code being tested.
     */
    include: ['tests/**/*.spec.ts'],
  },
})
