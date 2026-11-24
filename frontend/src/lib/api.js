const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`)
  }

  return payload
}

export async function fetchMatches(limit = 100) {
  const payload = await request(`/matches?limit=${limit}`)
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function fetchCommentary(matchId, limit = 60) {
  const payload = await request(`/matches/${matchId}/commentary?limit=${limit}`)
  return Array.isArray(payload?.data) ? payload.data : []
}

export function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
