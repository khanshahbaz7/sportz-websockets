import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCommentary, fetchMatches, getWebSocketUrl } from '../lib/api'

const STORAGE_KEY = 'sportz.following.v1'
const MATCH_REFRESH_MS = 30_000
const COMMENTARY_LIMIT = 60

function readFollowing() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

function persistFollowing(ids) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Storage can be unavailable in private browsing; following still works in memory.
  }
}

function commentKey(comment) {
  if (comment?.id !== null && comment?.id !== undefined) return `id:${comment.id}`
  return `tmp:${comment?.matchId}:${comment?.createdAt}:${comment?.message}`
}

function commentTime(comment) {
  const timestamp = new Date(comment?.createdAt || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function mergeCommentary(existing = [], incoming = []) {
  const map = new Map()

  for (const item of existing) {
    if (item) map.set(commentKey(item), item)
  }

  for (const item of incoming) {
    if (item) map.set(commentKey(item), item)
  }

  return [...map.values()].sort((left, right) => {
    const difference = commentTime(right) - commentTime(left)
    if (difference !== 0) return difference
    return (right?.sequence ?? 0) - (left?.sequence ?? 0)
  })
}

export function useMatchFeed() {
  const [matches, setMatches] = useState([])
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [matchesError, setMatchesError] = useState(null)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [following, setFollowing] = useState(readFollowing)
  const [commentaryByMatch, setCommentaryByMatch] = useState({})
  const [commentaryState, setCommentaryState] = useState({})
  const [focusedId, setFocusedId] = useState(null)
  const [pulseId, setPulseId] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const followingRef = useRef(following)
  const socketRef = useRef(null)
  const subscribedRef = useRef(new Set())
  const loadedCommentaryRef = useRef(new Set())
  const inFlightCommentaryRef = useRef(new Set())
  const reconnectTimerRef = useRef(null)
  const pulseTimerRef = useRef(null)

  useEffect(() => {
    followingRef.current = following
    persistFollowing(following)
  }, [following])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const loadMatches = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setMatchesLoading(true)

    try {
      const rows = await fetchMatches(100)
      setMatches(rows)
      setMatchesError(null)
      setLastLoadedAt(Date.now())
    } catch (error) {
      setMatchesError(error?.message || 'Could not load matches.')
    } finally {
      setMatchesLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial board sync plus a light poll for matches outside the live socket feed.
    // oxlint-disable-next-line react/set-state-in-effect
    loadMatches({ silent: true })
    const timer = window.setInterval(() => loadMatches({ silent: true }), MATCH_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [loadMatches])

  const loadCommentary = useCallback(async (matchId, { force = false } = {}) => {
    if (
      !force &&
      (loadedCommentaryRef.current.has(matchId) || inFlightCommentaryRef.current.has(matchId))
    ) {
      return
    }

    inFlightCommentaryRef.current.add(matchId)

    try {
      const rows = await fetchCommentary(matchId, COMMENTARY_LIMIT)
      loadedCommentaryRef.current.add(matchId)
      setCommentaryByMatch((previous) => ({
        ...previous,
        [matchId]: mergeCommentary(previous[matchId], rows),
      }))
      setCommentaryState((previous) => ({ ...previous, [matchId]: 'ready' }))
    } catch {
      setCommentaryState((previous) => ({ ...previous, [matchId]: 'error' }))
    } finally {
      inFlightCommentaryRef.current.delete(matchId)
    }
  }, [])

  useEffect(() => {
    for (const id of following) {
      // State updates land after the network response, not during this effect.
      // oxlint-disable-next-line react/set-state-in-effect
      loadCommentary(id)
    }
  }, [following, loadCommentary])

  useEffect(() => {
    let disposed = false
    let retry = 0
    let reconnectTimer = null

    function scheduleReconnect() {
      if (disposed) return
      const delay = Math.min(1000 * 2 ** retry, 15_000)
      retry += 1
      setConnection('reconnecting')
      reconnectTimer = window.setTimeout(connect, delay)
      reconnectTimerRef.current = reconnectTimer
    }

    function handleMessage(message) {
      if (!message || typeof message !== 'object') return

      if (message.type === 'welcome') {
        setConnection('live')
        return
      }

      if (message.type === 'commentary' && message.data) {
        const comment = message.data
        const matchId = Number(comment.matchId)
        if (!Number.isInteger(matchId)) return

        setCommentaryByMatch((previous) => ({
          ...previous,
          [matchId]: mergeCommentary(previous[matchId], [comment]),
        }))
        setCommentaryState((previous) => ({ ...previous, [matchId]: 'ready' }))
        setLastLoadedAt(Date.now())
        return
      }

      if (message.type === 'match_updated' && message.data) {
        const updated = message.data
        setMatches((previous) => {
          const exists = previous.some((match) => match.id === updated.id)
          if (!exists) return [updated, ...previous]
          return previous.map((match) =>
            match.id === updated.id ? { ...match, ...updated } : match,
          )
        })
        setPulseId(updated.id)
        setLastLoadedAt(Date.now())
        window.clearTimeout(pulseTimerRef.current)
        pulseTimerRef.current = window.setTimeout(() => setPulseId(null), 1600)
        return
      }

      if (message.type === 'match_created' && message.data) {
        const created = message.data
        setMatches((previous) => {
          const exists = previous.some((match) => match.id === created.id)
          if (!exists) return [created, ...previous]
          return previous.map((match) =>
            match.id === created.id ? { ...match, ...created } : match,
          )
        })
        setLastLoadedAt(Date.now())
      }
    }

    function connect() {
      if (disposed) return

      let socket
      try {
        socket = new WebSocket(getWebSocketUrl())
      } catch {
        scheduleReconnect()
        return
      }

      socketRef.current = socket
      setConnection(retry === 0 ? 'connecting' : 'reconnecting')

      socket.addEventListener('open', () => {
        if (disposed) {
          socket.close()
          return
        }

        retry = 0
        setConnection('live')

        // A fresh connection has no server-side subscriptions, so re-send them all.
        subscribedRef.current = new Set()
        for (const id of followingRef.current) {
          socket.send(JSON.stringify({ type: 'subscribe', matchId: id }))
          subscribedRef.current.add(id)
        }
      })

      socket.addEventListener('message', (event) => {
        try {
          handleMessage(JSON.parse(event.data))
        } catch {
          // Ignore malformed frames and keep the feed alive.
        }
      })

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null
        subscribedRef.current = new Set()
        if (!disposed) scheduleReconnect()
      })

      socket.addEventListener('error', () => {
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close()
        }
      })
    }

    connect()

    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(reconnectTimerRef.current)
      window.clearTimeout(pulseTimerRef.current)
      const socket = socketRef.current
      socketRef.current = null
      if (socket) socket.close()
    }
  }, [])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    const desired = new Set(following)

    for (const id of desired) {
      if (subscribedRef.current.has(id)) continue
      socket.send(JSON.stringify({ type: 'subscribe', matchId: id }))
      subscribedRef.current.add(id)
    }

    for (const id of [...subscribedRef.current]) {
      if (desired.has(id)) continue
      socket.send(JSON.stringify({ type: 'unsubscribe', matchId: id }))
      subscribedRef.current.delete(id)
    }
  }, [following, connection])

  const toggleFollow = useCallback((matchId) => {
    if (!Number.isInteger(matchId)) return

    const current = followingRef.current
    const isFollowing = current.includes(matchId)
    const next = isFollowing
      ? current.filter((id) => id !== matchId)
      : [...current, matchId]

    followingRef.current = next
    setFollowing(next)

    if (isFollowing) {
      setFocusedId((current) => (current === matchId ? null : current))
    } else {
      setFocusedId(matchId)
    }
  }, [])

  const retryCommentary = useCallback(
    (matchId) => {
      if (!Number.isInteger(matchId)) return
      loadedCommentaryRef.current.delete(matchId)
      setCommentaryState((previous) => ({ ...previous, [matchId]: 'loading' }))
      loadCommentary(matchId, { force: true })
    },
    [loadCommentary],
  )

  const refresh = useCallback(() => {
    loadMatches({ silent: true })
    for (const id of followingRef.current) {
      loadCommentary(id, { force: true })
    }
  }, [loadMatches, loadCommentary])

  const matchesById = useMemo(
    () => new Map(matches.map((match) => [match.id, match])),
    [matches],
  )

  const followingMatches = useMemo(
    () => following.map((id) => matchesById.get(id)).filter(Boolean),
    [following, matchesById],
  )

  const focusedMatch = useMemo(() => {
    const preferred =
      focusedId !== null && following.includes(focusedId) ? focusedId : following[0]

    if (preferred === undefined) return null
    return matchesById.get(preferred) || null
  }, [focusedId, following, matchesById])

  const focusedCommentary = focusedMatch
    ? commentaryByMatch[focusedMatch.id] || []
    : []

  const focusedCommentaryState = focusedMatch
    ? commentaryState[focusedMatch.id] ??
      (commentaryByMatch[focusedMatch.id] ? 'ready' : 'loading')
    : 'idle'

  return {
    matches,
    matchesLoading,
    matchesError,
    lastLoadedAt,
    connection,
    following,
    followingMatches,
    focusedMatch,
    focusedId: focusedMatch?.id ?? null,
    focusedCommentary,
    focusedCommentaryState,
    pulseId,
    now,
    loadMatches,
    refresh,
    toggleFollow,
    setFocusedId,
    retryCommentary,
  }
}
