---
name: Always use bun
description: User requires bun as the package manager for all JS/TS operations — never npm/yarn/pnpm
type: feedback
---

Always use `bun` instead of npm, yarn, or pnpm for all JavaScript/TypeScript operations (install, run, create, build, etc.).

**Why:** User explicitly requested this as a permanent preference.

**How to apply:** Any time you'd reach for npm/yarn/pnpm, use bun instead. This includes scaffolding (bun create), installing deps (bun add), running scripts (bun run), etc.
