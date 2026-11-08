# @calendar/contracts

The TypeSpec source of truth lives in `src/main.tsp`. The checked-in OpenAPI document is
`openapi/openapi.yaml` and is consumed by `@calendar/api-client`.

Run `pnpm contracts:generate` from the repository root. Generation is deterministic; CI runs
`pnpm contracts:check` and fails when generated files differ from the committed artifacts.
