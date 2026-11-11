import { client, type ProblemCode, type ProblemDetails } from 'calendar-api-client'

client.setConfig({ baseUrl: '' })

type ApiProblem = Pick<ProblemDetails, 'title'> &
  Partial<Pick<ProblemDetails, 'detail' | 'status' | 'code'>>

export class ApiError extends Error {
  readonly code?: ProblemCode
  readonly status?: number

  constructor(problem: ApiProblem) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.code = problem.code
    this.status = problem.status
  }
}

const isProblemDetails = (error: unknown): error is ApiProblem =>
  error !== null &&
  typeof error === 'object' &&
  'title' in error &&
  typeof error.title === 'string'

export const responseData = async <T>(request: Promise<{ data: T }>): Promise<T> => {
  try {
    return (await request).data
  } catch (error) {
    if (isProblemDetails(error)) {
      throw new ApiError(error)
    }
    throw error
  }
}
