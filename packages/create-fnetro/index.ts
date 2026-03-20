#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  create-fnetro · Interactive project scaffolding CLI
//  npm create @netrojs/fnetro@latest [project-name]
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import prompts from 'prompts'
import { bold, cyan, dim, green, red, yellow } from 'kolorist'

// ── Config ────────────────────────────────────────────────────────────────────

const FNETRO_VERSION = '0.3.0'
const FILES_DIR      = join(dirname(fileURLToPath(import.meta.url)), '..', 'files')

type Runtime = 'node' | 'bun' | 'deno'
type PkgMgr  = 'npm' | 'pnpm' | 'bun' | 'yarn'

interface Answers {
  projectName: string
  runtime:     Runtime
  pkgManager:  PkgMgr
  gitInit:     boolean
  installDeps: boolean
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function banner() {
  console.log()
  console.log(bold(cyan('  ◈  create-fnetro')))
  console.log(dim('  Full-stack Hono + Vue 3 — SSR · SPA · code splitting · TypeScript'))
  console.log()
}

function isDirEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true
  const items = readdirSync(dir)
  return items.length === 0 || (items.length === 1 && items[0] === '.git')
}

/** Walk a directory recursively, yielding absolute paths of all files. */
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

/** Replace template placeholders in file content. */
function applyVars(content: string, vars: Record<string, string>): string {
  for (const [k, v] of Object.entries(vars)) {
    content = content.replaceAll(`{{${k}}}`, v)
  }
  return content
}

// ── Scaffold ──────────────────────────────────────────────────────────────────

function scaffold(dir: string, a: Answers): void {
  const devCmds: Record<Runtime, string> = {
    node: 'vite --host',
    bun:  'bun --bun vite --host',
    deno: 'deno run -A npm:vite --host',
  }
  const buildCmds: Record<Runtime, string> = {
    node: 'vite build',
    bun:  'bun --bun vite build',
    deno: 'deno run -A npm:vite build',
  }

  const vars: Record<string, string> = {
    PROJECT_NAME:    a.projectName,
    FNETRO_VERSION,
    DEV_CMD:         devCmds[a.runtime],
    BUILD_CMD:       buildCmds[a.runtime],
  }

  // Runtime-specific server.ts adjustments
  const serverOverrides: Record<Runtime, string> = {
    node: `import { serve } from '@netrojs/fnetro/server'\nimport { fnetro } from './app'\n\nawait serve({ app: fnetro, port: Number(process.env['PORT'] ?? 3000), runtime: 'node' })\n`,
    bun:  `import { serve } from '@netrojs/fnetro/server'\nimport { fnetro } from './app'\n\nawait serve({ app: fnetro, port: Number(process.env['PORT'] ?? 3000), runtime: 'bun' })\n`,
    deno: `import { serve } from '@netrojs/fnetro/server'\nimport { fnetro } from './app'\n\nawait serve({ app: fnetro, port: Number(Deno.env.get('PORT') ?? 3000), runtime: 'deno' })\n`,
  }

  mkdirSync(dir, { recursive: true })

  for (const srcPath of walk(FILES_DIR)) {
    const rel     = relative(FILES_DIR, srcPath)
    const renamed = rel
      .replace(/^_package\.json$/, 'package.json')
      .replace(/^_gitignore$/,     '.gitignore')

    const destPath = join(dir, renamed)
    mkdirSync(dirname(destPath), { recursive: true })

    let content = readFileSync(srcPath, 'utf-8')

    // Override server.ts for runtime
    if (renamed === 'server.ts') content = serverOverrides[a.runtime]

    // Bun devDep
    if (renamed === 'package.json' && a.runtime === 'bun') {
      content = content.replace('"@hono/node-server":      "^1.19.11",\n', '')
      const parsed = JSON.parse(content)
      parsed.devDependencies['@types/bun'] = 'latest'
      content = JSON.stringify(parsed, null, 2) + '\n'
    }

    writeFileSync(destPath, applyVars(content, vars), 'utf-8')
  }

  // .env.example
  writeFileSync(join(dir, '.env.example'), `PORT=3000\nNODE_ENV=development\n`, 'utf-8')
}

// ── Install + git ─────────────────────────────────────────────────────────────

const INSTALL: Record<PkgMgr, string> = {
  npm: 'npm install', pnpm: 'pnpm install', bun: 'bun install', yarn: 'yarn',
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  banner()

  const nameArg = process.argv[2]?.trim()

  const a = await prompts([
    {
      name:    'projectName',
      type:    nameArg ? null : 'text',
      message: 'Project name:',
      initial: 'my-fnetro-app',
      validate: (v: string) => v.trim() ? true : 'Name is required',
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
    {
      name: 'gitInit',     type: 'confirm', message: 'Init git repo?',     initial: true,
    },
    {
      name: 'installDeps', type: 'confirm', message: 'Install dependencies?', initial: true,
    },
  ], {
    onCancel: () => { console.log(red('\nCancelled.\n')); process.exit(1) },
  }) as Answers

  if (nameArg) a.projectName = nameArg

  const dir = resolve(process.cwd(), a.projectName)

  if (!isDirEmpty(dir)) {
    console.log(red(`\n  Directory "${a.projectName}" is not empty.\n`))
    process.exit(1)
  }

  console.log()
  scaffold(dir, a)
  console.log(green(`  ✓ Scaffolded to ${a.projectName}/`))

  if (a.gitInit) {
    try {
      execSync('git init', { cwd: dir, stdio: 'ignore' })
      execSync('git add -A', { cwd: dir, stdio: 'ignore' })
      execSync('git commit -m "chore: initial fnetro scaffold"', { cwd: dir, stdio: 'ignore' })
      console.log(green('  ✓ Git repo initialised'))
    } catch { /* git not available */ }
  }

  if (a.installDeps) {
    console.log(dim(`\n  Running ${INSTALL[a.pkgManager]}…\n`))
    execSync(INSTALL[a.pkgManager], { cwd: dir, stdio: 'inherit' })
  }

  const rel = relative(process.cwd(), dir)
  console.log()
  console.log(bold('  Next steps:'))
  if (rel !== '.') console.log(`    ${cyan(`cd ${rel}`)}`)
  if (!a.installDeps) console.log(`    ${cyan(INSTALL[a.pkgManager])}`)
  console.log(`    ${cyan(a.runtime === 'bun' ? 'bun run dev' : 'npm run dev')}`)
  console.log()
  console.log(dim(`  Docs: https://github.com/netrosolutions/fnetro`))
  console.log()
}

main().catch(err => { console.error(err); process.exit(1) })
