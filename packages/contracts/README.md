# @calendar/contracts

The checked-in `openapi/openapi.yaml` is the canonical HTTP contract consumed by
`calendar-api-client`. TypeSpec in `src/main.tsp` is compiled on every generation run and its
route and schema surface is checked against the canonical document.

Run `pnpm contracts:generate` from the repository root. CI runs `pnpm contracts:check` and fails
when the TypeSpec output or generated OpenAPI TypeScript schema differs from the committed files.
