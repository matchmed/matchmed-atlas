import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

const outputPath = new URL('../src/lib/database.types.ts', import.meta.url)
const args = process.argv.slice(2)

if (args.includes('--linked') || args.some((arg) => arg.startsWith('--linked'))) {
  console.error('This script never contacts a linked or production project.')
  process.exit(1)
}

const dbUrlFlag = args.indexOf('--db-url')
const dbUrl = dbUrlFlag >= 0 ? args[dbUrlFlag + 1] : ''
const loopback = typeof dbUrl === 'string' && /^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\//.test(dbUrl)
if (!args.includes('--local') && !loopback) {
  console.error('Pass --local or a loopback --db-url. Linked projects are refused.')
  process.exit(1)
}
if (!args.includes('--schema')) args.push('--schema', 'public')

const child = spawn(
  'npx',
  ['--yes', 'supabase@2.119.0', 'gen', 'types', 'typescript', ...args],
  { stdio: ['ignore', 'pipe', 'inherit'] },
)

let stdout = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  stdout += chunk
})

const code = await new Promise((resolve, reject) => {
  child.on('error', reject)
  child.on('close', resolve)
})
if (code !== 0) process.exit(code ?? 1)

const normalized = stdout
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .split('\n')
  .map((line) => line.replace(/[ \t]+$/u, ''))
  .join('\n')

await writeFile(outputPath, normalized.endsWith('\n') ? normalized : `${normalized}\n`)
