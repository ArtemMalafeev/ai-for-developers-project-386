import { client, type ProblemDetails } from 'calendar-api-client'

client.setConfig({ baseUrl: '' })

export const responseData = async <T>(request: Promise<{ data: T }>): Promise<T> => {
  try {
    return (await request).data
  } catch (error) {
    if (error && typeof error === 'object' && 'title' in error) {
      const problem = error as ProblemDetails
      throw new Error(problem.detail ?? problem.title)
    }
    throw error
  }
}
