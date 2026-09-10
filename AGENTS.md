# AI Workspace — Agent Guidelines

## Project Overview

AI Workspace is a Next.js coordination layer that lets small groups share AI provider access with spending controls. This file defines rules and conventions for AI agents working on this codebase.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js v4 (Credentials provider)
- **Database**: PostgreSQL via Supabase
- **Runtime**: Node.js 22 (pinned via Volta — do NOT use Node.js 24+)

## Development Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
```

## Branch Strategy

- `main` — stable, deployable branch
- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `chore/<name>` — maintenance, config, tooling

Branch off `main`. Merge back via Pull Request.

## Commit Conventions

Use **Conventional Commits** format:

```
<type>(<scope>): <description>
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `chore` — tooling, config, deps
- `refactor` — code restructuring (no feature change)
- `docs` — documentation only
- `test` — adding or updating tests

**Examples:**
```
feat(auth): add login page with NextAuth credentials provider
fix(api): prevent race condition in spending cap check
chore(deps): update next-auth to 4.24.15
```

**Rules:**
- Write in English, lowercase after the colon
- Keep description under 72 characters
- Reference issue number when applicable: `feat(auth): add login (#12)`
- One logical change per commit — no "fix everything" commits

## Code Style

### TypeScript

- Use `interface` for object shapes, `type` for unions/intersections
- Prefer `const` over `let`
- No `any` — use `unknown` and narrow with type guards
- Use path aliases: `@/lib/...`, `@/components/...`

### React / Next.js

- Use functional components only (no class components)
- Server Components by default — add `"use client"` only when needed (event handlers, browser APIs, hooks)
- Place client components in `src/components/`
- Co-locate related files: `src/app/(auth)/login/page.tsx` + `layout.tsx`

### Styling

- Use Tailwind utility classes — no custom CSS unless unavoidable
- Follow existing patterns: `flex`, `items-center`, `gap-*`, `rounded-*`
- Use template literals for conditional classes

### File Naming

```
src/
├── app/                  # Route-based pages (Next.js App Router)
│   ├── (auth)/           # Route group for auth pages
│   │   ├── login/
│   │   └── register/
│   └── (dashboard)/      # Route group for authenticated pages
├── components/           # Reusable UI components
│   ├── ui/               # Primitive components (Button, Input, Card)
│   └── layout/           # Layout components (Sidebar, Header)
├── lib/                  # Utilities and helpers
│   ├── auth.ts           # NextAuth configuration
│   ├── supabase.ts       # Supabase client helpers
│   └── providers/        # AI provider adapters
├── types/                # Shared TypeScript types
└── middleware.ts          # Route protection
```

## Testing

### Setup

- **Vitest** for unit tests (faster, native ESM)
- **Playwright** for E2E tests if needed (not yet set up)
- Test files live next to source: `lib/auth.test.ts`
- Config: `vitest.config.ts`
- Run tests: `npm test` (single run) or `npm run test:watch` (watch mode)

### Testing Principles

- Write tests for business logic (spending caps, cost estimation, auth flows)
- Mock external services (Supabase, OpenAI) — never hit real APIs in tests
- Test API routes with mocked request/response objects
- No snapshot tests for UI — prefer behavioral assertions

## Pull Request Guidelines

### PR Title

Follow commit conventions:
```
feat(auth): add workspace creation flow
fix(caps): handle concurrent cap check race condition
```

### PR Description Template

```markdown
## What

Brief description of the change.

## Why

Link to issue or explain the motivation.

## How

Key implementation details (if non-obvious).

## Testing

- [ ] Tested locally with `npm run dev`
- [ ] Verified no regressions in existing flows
- [ ] Added/updated tests (if applicable)

## Screenshots

(if UI changes)
```

### PR Rules

- Keep PRs focused — one feature or fix per PR
- PRs should be under 400 lines of diff when possible
- All CI checks must pass (lint, test, build)
- At least one review before merge when a second collaborator exists; otherwise green CI is the merge gate (GitHub does not count self-approvals)
- Squash merge into `main`

## Environment Variables

Required environment variables (never commit these):

```
DATABASE_URL=          # Supabase PostgreSQL connection string
NEXTAUTH_SECRET=       # JWT signing secret (min 32 chars)
NEXTAUTH_URL=          # App base URL (e.g., http://localhost:3000)
SUPABASE_URL=          # Supabase project URL
SUPABASE_ANON_KEY=     # Supabase anonymous key
OPENAI_API_KEY=        # OpenAI API key (minimal MVP only)
```

Generate secrets with:
```bash
openssl rand -base64 32   # for NEXTAUTH_SECRET
```

## Security Rules

- Never log API keys, passwords, or tokens
- Never commit `.env` files
- All credentials encrypted at rest (deferred to full MVP)
- Server-side only: spending caps, auth checks, cost calculations
- Use parameterized queries — no string concatenation for SQL

## Before Each Commit

1. Run `npm run lint` — fix any errors
2. Run `npm run build` — ensure no type errors
3. Verify no secrets in staged files
4. Write a clear commit message per conventions above

## When in Doubt

- Check the `Docs/` folder for product requirements and architecture
- Prefer simplicity over cleverness
- If a change affects spending caps or auth, test it manually before committing
