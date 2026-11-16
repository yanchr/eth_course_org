import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

// Bundle TypeScript tests with the same module resolution used by the app.
const outDir = await mkdtemp(join(tmpdir(), 'eth-planner-tests-'))
try {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    publicDir: false,
    build: {
      ssr: 'tests/backup.test.ts',
      outDir,
      emptyOutDir: false,
      minify: false,
      target: 'node22',
      rolldownOptions: { output: { entryFileNames: 'tests.mjs' } },
    },
  })
  const bundle = Array.isArray(result) ? result[0] : result
  const chunk = bundle.output.find((item) => item.type === 'chunk' && item.isEntry)
  await import(pathToFileURL(join(outDir, chunk.fileName)).href)
} finally {
  await rm(outDir, { recursive: true, force: true })
}
