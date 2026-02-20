const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || '/graphql'

function getAccessToken(): string | null {
  try {
    // @ts-ignore
    if (window.liff && window.liff.isLoggedIn()) {
      // @ts-ignore
      return window.liff.getAccessToken()
    }
  } catch {}
  return null
}

export async function gql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  
  const token = getAccessToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    throw new Error(json.errors[0]?.message || 'GraphQL error')
  }
  return json.data
}
