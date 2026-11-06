Cadence — course platform; overview in README.md.

## Conventions

- All DB access goes through `app/services/*Service.ts`: synchronous Drizzle functions, positional params.
- Server-only modules end in `.server.ts`.

## Elsewhere

- `request-logger/` — separate tooling; read its own `CLAUDE.md` first.
- `npm run reset|cherry-pick` rewrites the working tree — commit or stash first.
