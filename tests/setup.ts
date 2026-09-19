/*
 * jsdom 30.1 implements URL.createObjectURL, but only for its own Blob: vitest
 * leaves Node's Blob on the global, so the real implementation throws
 * "Cannot read properties of undefined (reading '_buffer')" on every
 * download the app triggers. No test wants a real object URL, so both ends
 * are stubbed for the whole suite; specs that care spy on these.
 */
import { vi } from 'vitest'

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true, writable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true })
