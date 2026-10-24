/**
 * Check drill files before they are imported or shared.
 *
 *   npm run validate -- my-drills.json [more.json ...]
 *
 * Exits 1 if any file has an error, so an agent or a CI step can gate on it.
 * Warnings are printed but do not fail the run.
 */
import { readFileSync } from 'node:fs'
import { lintBundle } from '../src/drillLint'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: npm run validate -- <file.json> [more.json ...]')
  process.exit(2)
}

let failed = false
for (const file of files) {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`✗ ${file}: ${(e as Error).message}`)
    failed = true
    continue
  }
  const { errors, warnings } = lintBundle(raw)
  for (const issue of errors) console.error(`  error    ${issue.where}: ${issue.message}`)
  for (const issue of warnings) console.error(`  warning  ${issue.where}: ${issue.message}`)
  if (errors.length) failed = true
  console.log(`${errors.length ? '✗' : '✓'} ${file}: ${errors.length} error(s), ${warnings.length} warning(s)`)
}
process.exit(failed ? 1 : 0)
