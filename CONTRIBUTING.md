# Contributing to Darbak

Thanks for helping people find their way around hospitals.

## Setup

```bash
npm install
npm run dev
```

## Before you open a pull request

```bash
npm run check        # typecheck, lint (including accessibility rules) and tests
npm run format       # Prettier
```

CI runs the same checks plus a production build.

## Guidelines

- **Keep the layers clean.** `src/domain`, `src/navigation`, `src/i18n` and `src/search` must not import React or touch the DOM. Put browser APIs in `src/services`.
- **Every string in both languages.** Add new keys to `src/i18n/ar.ts` first, then `src/i18n/en.ts`. A test fails if the keys or placeholders differ.
- **Write Arabic the way people speak.** Directions start with the action (`لف يمين`, `امشِ سيدا`), use everyday Saudi words, and avoid formal MSA phrasing.
- **Test routing changes.** If you touch the graph, costs or step generation, add a case to `src/navigation/planner.test.ts`.
- **Check accessibility.** Follow the checklist in [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Commit messages

Use the imperative mood and say what changed for the visitor, e.g. `Add nearest water fountain to home page`.
