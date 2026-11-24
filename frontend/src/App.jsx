import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Icon } from './components/Icons'
import { MatchCard } from './components/MatchCard'
import { MatchCentre } from './components/MatchCentre'
import { SportTabs } from './components/SportTabs'
import { useMatchFeed } from './hooks/useMatchFeed'
import {
  connectionLabel,
  formatRelativeUpdated,
  matchSearchText,
  normalizeSport,
  sortMatches,
  sportMeta,
} from './lib/format'

function EmptyBoard({ activeLabel, hasQuery, query, onClear, onRefresh, isError }) {
  if (isError) {
    return (
      <div className="empty-board empty-board--error">
        <span className="empty-board__icon">
          <Icon name="signal" size={24} />
        </span>
        <h3>The scoreboard is out of reach</h3>
        <p>Check that the Sportz API is running, then try again.</p>
        <button className="ghost-button" onClick={onRefresh} type="button">
          <Icon name="refresh" size={14} />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="empty-board">
      <span className="empty-board__icon">
        <Icon name={hasQuery ? 'search' : 'flag'} size={24} />
      </span>
      <h3>
        {hasQuery
          ? `No matches for “${query.trim()}”`
          : activeLabel === 'All'
            ? 'No matches on the board yet'
            : `No ${activeLabel.toLowerCase()} matches right now`}
      </h3>
      <p>
        {hasQuery
          ? 'Try a team, competition or sport name.'
          : 'New fixtures appear here as soon as the API has them.'}
      </p>
      <div className="empty-board__actions">
        {hasQuery && (
          <button className="ghost-button" onClick={onClear} type="button">
            Clear search
          </button>
        )}
        <button className="ghost-button" onClick={onRefresh} type="button">
          <Icon name="refresh" size={14} />
          Refresh board
        </button>
      </div>
    </div>
  )
}

function App() {
  const {
    matches,
    matchesLoading,
    matchesError,
    lastLoadedAt,
    connection,
    following,
    followingMatches,
    focusedMatch,
    focusedCommentary,
    focusedCommentaryState,
    pulseId,
    now,
    loadMatches,
    refresh,
    toggleFollow,
    setFocusedId,
    retryCommentary,
  } = useMatchFeed()

  const [activeSport, setActiveSport] = useState('all')
  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)

  const tabs = useMemo(() => {
    const counts = new Map()

    for (const match of matches) {
      const key = normalizeSport(match.sport) || 'other'
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    const sportTabs = [...counts.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1]
        return sportMeta(left[0]).label.localeCompare(sportMeta(right[0]).label)
      })
      .map(([key, count]) => {
        const meta = sportMeta(key)
        return { key, label: meta.label, icon: meta.icon, count }
      })

    return [{ key: 'all', label: 'All', icon: 'bolt', count: matches.length }, ...sportTabs]
  }, [matches])

  const stats = useMemo(
    () => ({
      live: matches.filter((match) => match.status === 'live').length,
      scheduled: matches.filter((match) => match.status === 'scheduled').length,
      finished: matches.filter((match) => match.status === 'finished').length,
    }),
    [matches],
  )

  const activeTab = tabs.find((tab) => tab.key === activeSport)
  const effectiveSport = activeTab ? activeSport : 'all'
  const activeLabel = activeTab?.label || 'All'

  const visibleMatches = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return sortMatches(
      matches.filter((match) => {
        if (effectiveSport !== 'all' && normalizeSport(match.sport) !== effectiveSport) {
          return false
        }
        if (needle && !matchSearchText(match).includes(needle)) return false
        return true
      }),
    )
  }, [matches, effectiveSport, query])

  useEffect(() => {
    if (!panelOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPanelOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [panelOpen])

  function clearFilters() {
    setActiveSport('all')
    setQuery('')
  }

  function browseBoard() {
    setPanelOpen(false)
    document.getElementById('match-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const showSkeleton = matchesLoading && matches.length === 0
  const showEmpty = !showSkeleton && visibleMatches.length === 0

  return (
    <div className="page" id="top">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <Icon name="bolt" size={19} strokeWidth={2} />
          </span>
          <span className="brand__text">
            <strong>SPORTZ</strong>
            <small>live deck</small>
          </span>
        </div>

        <div className="topbar__actions">
          <span className={`connection topbar__connection connection--${connection}`} role="status">
            <span className="connection__dot" aria-hidden="true" />
            <span className="topbar__connection-label">{connectionLabel(connection)}</span>
          </span>

          <button
            aria-label="Refresh scores"
            className="icon-button"
            onClick={refresh}
            title="Refresh scores"
            type="button"
          >
            <Icon name="refresh" size={17} />
          </button>

          <button
            aria-label={`Open watchlist with ${following.length} tracked matches`}
            className="watchlist-toggle"
            onClick={() => setPanelOpen(true)}
            type="button"
          >
            <Icon name="bell" size={15} />
            <span>Watchlist</span>
            <span className="watchlist-toggle__count">{following.length}</span>
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">
              <span className="eyebrow__pulse" aria-hidden="true" />
              Live sports, no refresh required
            </p>
            <h1>
              Every second.
              <br />
              <em>Every score.</em>
            </h1>
            <p className="hero__lede">
              Track the matches that matter. Scores, status and commentary update
              themselves the instant the feed moves.
            </p>
          </div>

          <div className="hero__stats" aria-label="Board summary">
            <div className="stat stat--live">
              <span className="stat__label">Live now</span>
              <strong>{stats.live}</strong>
              <small>in play</small>
            </div>
            <div className="stat">
              <span className="stat__label">Upcoming</span>
              <strong>{stats.scheduled}</strong>
              <small>scheduled</small>
            </div>
            <div className="stat">
              <span className="stat__label">Finished</span>
              <strong>{stats.finished}</strong>
              <small>full time</small>
            </div>
            <div className="stat stat--follow">
              <span className="stat__label">Tracking</span>
              <strong>{following.length}</strong>
              <small>matches</small>
            </div>
          </div>
        </section>

        <div className="board-toolbar">
          <SportTabs active={effectiveSport} onChange={setActiveSport} tabs={tabs} />

          <div className="board-tools">
            <label className="search">
              <Icon name="search" size={15} />
              <input
                aria-label="Search matches"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search teams or leagues"
                type="search"
                value={query}
              />
              {query && (
                <button
                  aria-label="Clear search"
                  className="search__clear"
                  onClick={() => setQuery('')}
                  type="button"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </label>
            <span className="result-count">
              <strong>{visibleMatches.length}</strong> showing
            </span>
          </div>
        </div>

        <div className="board" id="match-board">
          <section className="matches-pane" aria-label="Matches">
            <div className="pane-head">
              <div>
                <p className="eyebrow">The board</p>
                <h2>{activeLabel === 'All' ? 'All matches' : `${activeLabel} matches`}</h2>
              </div>
              <span className="pane-head__meta">
                {visibleMatches.length} of {matches.length} · updated{' '}
                {formatRelativeUpdated(lastLoadedAt, now)}
              </span>
            </div>

            {matchesError && matches.length > 0 && (
              <div className="banner banner--error">
                <span>
                  <Icon name="signal" size={15} />
                  Live updates paused: {matchesError}
                </span>
                <button onClick={() => loadMatches()} type="button">
                  Retry
                </button>
              </div>
            )}

            {showSkeleton && (
              <div className="match-grid" aria-label="Loading matches">
                {[0, 1, 2, 3].map((card) => (
                  <div className="skeleton-card" key={card}>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            )}

            {!showSkeleton && visibleMatches.length > 0 && (
              <div className="match-grid">
                {visibleMatches.map((match) => (
                  <MatchCard
                    following={following.includes(match.id)}
                    key={match.id}
                    match={match}
                    now={now}
                    onToggleFollow={toggleFollow}
                    pulsing={pulseId === match.id}
                  />
                ))}
              </div>
            )}

            {showEmpty && (
              <EmptyBoard
                activeLabel={activeLabel}
                hasQuery={Boolean(query.trim())}
                isError={Boolean(matchesError) && matches.length === 0}
                onClear={clearFilters}
                onRefresh={() => loadMatches()}
                query={query}
              />
            )}
          </section>

          <MatchCentre
            commentaryState={focusedCommentaryState}
            connection={connection}
            focusedCommentary={focusedCommentary}
            focusedMatch={focusedMatch}
            followingMatches={followingMatches}
            lastLoadedAt={lastLoadedAt}
            now={now}
            onBrowse={browseBoard}
            onClose={() => setPanelOpen(false)}
            onRetryCommentary={retryCommentary}
            onSelect={setFocusedId}
            onToggleFollow={toggleFollow}
            open={panelOpen}
          />
        </div>
      </main>

      <footer className="site-footer">
        <p className="site-footer__brand">
          <Icon name="bolt" size={14} />
          <span>SPORTZ live deck</span>
          <span className="site-footer__dot" aria-hidden="true">
            ·
          </span>
          <span>Built on the Sportz API</span>
        </p>
        <p className="site-footer__links">
          <span>Football &amp; cricket data</span>
          <a href="https://sportscore.com" rel="noopener" target="_blank">
            Powered by SportScore
            <Icon name="arrow-up-right" size={12} />
          </a>
        </p>
      </footer>

      <button
        aria-label="Close match centre"
        className={`panel-scrim${panelOpen ? ' is-open' : ''}`}
        onClick={() => setPanelOpen(false)}
        tabIndex={panelOpen ? 0 : -1}
        type="button"
      />
    </div>
  )
}

export default App
