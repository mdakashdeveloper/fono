# FNetro

> Full-stack [Hono](https://hono.dev) framework powered by **SolidJS v1.9+** — SSR, SPA, SEO, server & client middleware, Vite, TypeScript-first.

[![CI](https://github.com/netrosolutions/fnetro/actions/workflows/ci.yml/badge.svg)](https://github.com/netrosolutions/fnetro/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@netrojs/fnetro)](https://www.npmjs.com/package/@netrojs/fnetro)

## Packages

| Package | Version | Description |
|---|---|---|
| [`@netrojs/fnetro`](./packages/fnetro) | ![npm](https://img.shields.io/npm/v/@netrojs/fnetro) | Core framework — SSR, SPA, routing, SEO, middleware |
| [`create-fnetro`](./packages/create-fnetro) | ![npm](https://img.shields.io/npm/v/create-fnetro) | Project scaffolding CLI |

## Quick start

```bash
npm create @netrojs/fnetro@latest my-app
```

## What's new in v0.2

- **SolidJS v1.9+** — replaced custom Vue-like reactivity. Use `createSignal`, `createMemo`, `createEffect`, `createStore` from `solid-js` directly. Module-level signals persist across SPA navigations.
- **Full SEO** — `definePage({ seo: { title, description, og*, twitter*, jsonLd } })` static or computed from loader data. Meta tags sync automatically on SPA navigation.
- **Client middleware** — `useClientMiddleware(fn)` for auth guards, analytics, scroll restoration, loading indicators.
- **Asset fix** — Vite manifest support resolves hashed filenames correctly in production. The server reads `manifest.json` at startup — no more broken hardcoded `/assets/client.js`.
- **Correct hydration** — `vite-plugin-solid({ ssr: true })` ensures the server and client are compiled with matching hydration markers.
- **Shared path matching** — `compilePath`/`matchPath` defined once in `core.ts`, imported by both server and client.
- **Smaller codebase** — ~350 lines of custom reactivity removed. Delegates to SolidJS.

## Architecture

```
packages/
├── fnetro/           @netrojs/fnetro
│   ├── core.ts       Types, route builders, path matching, constants
│   ├── server.ts     Hono factory, SolidJS SSR, Vite plugin, serve()
│   └── client.ts     SolidJS hydration, SPA routing, client middleware
└── create-fnetro/    create-fnetro
    └── src/index.ts  Interactive CLI scaffolding tool
```

## Development

```bash
# Install all workspace deps
npm install

# Build both packages
npm run build

# Typecheck both packages
npm run typecheck
```

## Publishing

Packages are published automatically when a version tag is pushed:

```bash
# Bump versions in both package.json files, then:
git tag v0.2.1
git push origin v0.2.1
```

The [`publish.yml`](.github/workflows/publish.yml) workflow:
1. Validates tag matches both `package.json` versions
2. Builds and typechecks both packages
3. Publishes `@netrojs/fnetro` then `create-fnetro` to npm (with provenance)
4. Creates a GitHub Release

## License

MIT © [Netro Solutions](https://netrosolutions.com)
