# @calendar/api-client

Typed client generated from `packages/contracts/openapi/openapi.yaml`.

```ts
import { createApiClient } from '@calendar/api-client'

const api = createApiClient({ baseUrl: 'http://127.0.0.1:3000' })
const meetingTypes = await api.listMeetingTypes()
```
