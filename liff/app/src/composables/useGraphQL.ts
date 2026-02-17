const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || '/graphql'

export async function gql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    throw new Error(json.errors[0]?.message || 'GraphQL error')
  }
  return json.data
}
