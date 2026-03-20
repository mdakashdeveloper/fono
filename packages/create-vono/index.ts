#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  create-vono · Interactive project scaffolding CLI
//  npm create @netrojs/vono@latest [project-name]
// ─────────────────────────────────────────────────────────────────────────────

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { execSync }       from 'node:child_process'
import { fileURLToPath }  from 'node:url'
import prompts            from 'prompts'
import { bold, cyan, dim, green, red, yellow } from 'kolorist'

// ── Constants ─────────────────────────────────────────────────────────────────

const VONO_VERSION = '0.2.0'
const FILES_DIR    = join(dirname(fileURLToPath(import.meta.url)), '..', 'files')

// ── Types ─────────────────────────────────────────────────────────────────────

type Runtime  = 'node' | 'bun' | 'deno'
type PkgMgr   = 'npm' | 'pnpm' | 'bun' | 'yarn'

interface Answers {
  projectName: string
  runtime:     Runtime
  pkgManager:  PkgMgr
  gitInit:     boolean
  installDeps: boolean
}

// ── CLI commands per runtime ──────────────────────────────────────────────────

const DEV_CMDS: Record<Runtime, string> = {
  node: 'vite --host',
  bun:  'bun --bun vite --host',
  deno: 'deno run -A npm:vite --host',
}

const BUILD_CMDS: Record<Runtime, string> = {
  node: 'vite build',
  bun:  'bun --bun vite build',
  deno: 'deno run -A npm:vite build',
}

const START_CMDS: Record<Runtime, string> = {
  node: 'node dist/server/server.js',
  bun:  'bun dist/server/server.js',
  deno: 'deno run -A dist/server/server.js',
}

const INSTALL_CMDS: Record<PkgMgr, string> = {
  npm:  'npm install',
  pnpm: 'pnpm install',
  bun:  'bun install',
  yarn: 'yarn',
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function banner(): void {
  console.log()
  console.log(bold(cyan('  ◈  create-vono')))
  console.log(dim('  Full-stack Hono + Vue 3 — SSR · SPA · code splitting · TypeScript'))
  console.log()
}

function isDirEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true
  const entries = readdirSync(dir)
  return entries.length === 0 || (entries.length === 1 && entries[0] === '.git')
}

/** Walk a directory recursively, yielding absolute file paths. */
function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walkFiles(full)
    else yield full
  }
}

/**
 * Replace all `{{KEY}}` placeholders in `content` with the corresponding
 * values from `vars`.
 */
function applyVars(content: string, vars: Record<string, string>): string {
  let out = content
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v)
  }
  return out
}

// ── Scaffold ──────────────────────────────────────────────────────────────────

function scaffold(dir: string, answers: Answers): void {
  const vars: Record<string, string> = {
    PROJECT_NAME: answers.projectName,
    VONO_VERSION,
    DEV_CMD:      DEV_CMDS[answers.runtime],
    BUILD_CMD:    BUILD_CMDS[answers.runtime],
    START_CMD:    START_CMDS[answers.runtime],
  }

  mkdirSync(dir, { recursive: true })

  for (const srcPath of walkFiles(FILES_DIR)) {
    const rel = relative(FILES_DIR, srcPath)

    // Skip editor artefacts (e.g. "home copy.vue", ".DS_Store")
    if (/\scopy\b/.test(rel) || /\.DS_Store$/.test(rel)) continue

    // Rename template files that cannot be named with a leading dot on disk
    const destRel = rel
      .replace(/^_package\.json$/, 'package.json')
      .replace(/^_gitignore$/,     '.gitignore')

    const destPath = join(dir, destRel)
    mkdirSync(dirname(destPath), { recursive: true })

    let content = readFileSync(srcPath, 'utf-8')

    // ── package.json: apply vars then adjust per-runtime dev-deps ──────────
    if (destRel === 'package.json') {
      const parsed = JSON.parse(applyVars(content, vars)) as {
        devDependencies: Record<string, string>
      }

      if (answers.runtime === 'bun') {
        // @hono/node-server is not needed under Bun; use @types/bun instead.
        delete parsed.devDependencies['@hono/node-server']
        parsed.devDependencies['@types/bun'] = 'latest'
      }

      if (answers.runtime === 'deno') {
        // Deno ships its own HTTP stack; node-server is not needed.
        delete parsed.devDependencies['@hono/node-server']
      }

      writeFileSync(destPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8')
      continue
    }

    writeFileSync(destPath, applyVars(content, vars), 'utf-8')
  }

  // Write a minimal .env.example
  writeFileSync(
    join(dir, '.env.example'),
    'PORT=3000\nNODE_ENV=development\n',
    'utf-8',
  )
}

// ── Git + install helpers ─────────────────────────────────────────────────────

function initGit(dir: string): void {
  try {
    execSync('git init',                              { cwd: dir, stdio: 'ignore' })
    execSync('git add -A',                            { cwd: dir, stdio: 'ignore' })
    execSync('git commit -m "chore: initial scaffold"', { cwd: dir, stdio: 'ignore' })
    console.log(green('  ✓ Git repo initialised'))
  } catch {
    console.log(yellow('  ⚠ git not available — skipping'))
  }
}

function installDeps(dir: string, pkgMgr: PkgMgr): void {
  const cmd = INSTALL_CMDS[pkgMgr]
  console.log(dim(`\n  Running ${cmd}…\n`))
  try {
    execSync(cmd, { cwd: dir, stdio: 'inherit' })
  } catch {
    console.log(yellow(`  ⚠ ${cmd} failed — run it manually inside the project.`))
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  banner()

  const nameArg = process.argv[2]?.trim()

  const answers = await prompts(
    [
      {
        name:     'projectName',
        type:     nameArg ? null : 'text',
        message:  'Project name:',
        initial:  'my-vono-app',
        validate: (v: string) => v.trim() ? true : 'Project name is required',
      },
      {
        name:    'runtime',
        type:    'select',
        message: 'Runtime:',
        choices: [
          { title: 'Node.js', value: 'node' },
          { title: 'Bun',     value: 'bun'  },
          { title: 'Deno',    value: 'deno' },
        ],
        initial: 0,
      },
      {
        name:    'pkgManager',
        type:    'select',
        message: 'Package manager:',
        choices: [
          { title: 'npm',  value: 'npm'  },
          { title: 'pnpm', value: 'pnpm' },
          { title: 'bun',  value: 'bun'  },
          { title: 'yarn', value: 'yarn' },
        ],
        initial: 0,
      },
      { name: 'gitInit',     type: 'confirm', message: 'Init git repo?',        initial: true  },
      { name: 'installDeps', type: 'confirm', message: 'Install dependencies?', initial: true  },
    ],
    {
      onCancel: () => {
        console.log(red('\n  Cancelled.\n'))
        process.exit(1)
      },
    },
  ) as Answers

  if (nameArg) answers.projectName = nameArg

  const dir = resolve(process.cwd(), answers.projectName)

  if (!isDirEmpty(dir)) {
    console.log(red(`\n  Directory "${answers.projectName}" already exists and is not empty.\n`))
    process.exit(1)
  }

  console.log()
  scaffold(dir, answers)
  console.log(green(`  ✓ Scaffolded ${bold(answers.projectName)}/`))

  if (answers.gitInit)     initGit(dir)
  if (answers.installDeps) installDeps(dir, answers.pkgManager)

  const rel        = relative(process.cwd(), dir)
  const devCmd     = answers.runtime === 'bun' ? 'bun run dev' : 'npm run dev'
  const startCmd   = answers.runtime === 'bun' ? 'bun run start' : 'npm start'

  console.log()
  console.log(bold('  Next steps:'))
  if (rel !== '.') console.log(`    ${cyan(`cd ${rel}`)}`)
  if (!answers.installDeps) console.log(`    ${cyan(INSTALL_CMDS[answers.pkgManager])}`)
  console.log(`    ${cyan(devCmd)}`)
  console.log()
  console.log(dim('  Open http://localhost:5173 to see the app.'))
  console.log(dim('  Dashboard demo: /dashboard  (sign in with any credentials)'))
  console.log(dim('  Production:'))
  console.log(dim(`    ${bold('bun run build')} then ${bold(startCmd)}`))
  console.log(dim('  Docs: https://github.com/netrosolutions/vono'))
  console.log()
}

main().catch(err => {
  console.error(red('\n  Error:'), err)
  process.exit(1)
})
