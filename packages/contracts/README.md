# @calendar/contracts

`src/main.tsp` is the single source of the HTTP API. Run `pnpm contracts:generate` from the repository root to compile it and regenerate:

- `openapi/openapi.yaml`;
- `../api-client/src/generated/` (typed Fetch SDK);
- `../../apps/backend/src/generated/` (Fastify handler types).

All generated files are committed. `pnpm contracts:check` repeats the full chain in a temporary directory and compares every artifact, including the set of generated files.

Fastify routes and request schemas are loaded from the generated OpenAPI by `fastify-openapi-glue`. The generated `RouteHandlers` type checks the service handlers.
