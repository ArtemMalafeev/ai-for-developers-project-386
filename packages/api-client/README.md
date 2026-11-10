# calendar-api-client

Typed runtime client for `packages/contracts/openapi/openapi.yaml`. The schema types are aliases
of the generated OpenAPI TypeScript output; the request wrapper is maintained in `src/client.ts`.

```ts
import { createApiClient } from 'calendar-api-client'

const api = createApiClient({ baseUrl: 'http://127.0.0.1:3000' })
const meetingTypes = await api.listMeetingTypes()
```
