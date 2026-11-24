import { Icon } from './Icons'
import {
  attributionFor,
  formatKickoff,
  formatRelativeUpdated,
  scoreFor,
  sportMeta,
  statusLabel,
  teamHue,
  teamInitials,
} from '../lib/format'

function metaText(match, now) {
  if (match.status === 'live') {
    return `Updated ${formatRelativeUpdated(match.updatedAt || match.lastSyncedAt, now)}`
  }

  if (match.status === 'finished') {
    return formatKickoff(match.startTime, now)
  }

  return formatKickoff(match.startTime, now)
}

function TeamRow({ name, score, scheduled }) {
  const value = String(score ?? '–')
  const long = value.length > 5

  return (
    <div className="team-row">
      <span className="team-row__badge" style={{ '--team-hue': teamHue(name) }}>
        {teamInitials(name)}
      </span>
      <span className="team-row__name">{name}</span>
      <span
        className={`team-row__score${long ? ' is-long' : ''}${scheduled ? ' is-muted' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

export function MatchCard({ match, following, pulsing, now, onToggleFollow }) {
  const meta = sportMeta(match.sport)
  const attribution =
    attributionFor(match) ||
    (match.externalSource === 'sportscore'
      ? { url: 'https://sportscore.com', text: 'Powered by SportScore' }
      : null)
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'
  const scheduled = match.status === 'scheduled'

  const classes = [
    'match-card',
    isLive ? 'is-live' : '',
    isFinished ? 'is-finished' : '',
    following ? 'is-following' : '',
    pulsing ? 'is-pulsing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={classes}>
      <div className="match-card__halo" aria-hidden="true" />

      <header className="match-card__top">
        <span className={`sport-chip sport-chip--${meta.accent}`}>
          <Icon name={meta.icon} size={14} />
          {meta.label}
        </span>
        <span className={`status-pill status-pill--${match.status}`}>
          {isLive && <span className="status-pill__dot" aria-hidden="true" />}
          <span className="status-pill__label">{statusLabel(match, now)}</span>
        </span>
      </header>

      <p className="match-card__competition">{match.competition || 'Live sport'}</p>

      <div className="match-card__teams">
        <TeamRow
          name={match.homeTeam}
          score={scoreFor(match, 'home')}
          scheduled={scheduled}
        />
        <div className="match-card__vs" aria-hidden="true">
          <span />
          <em>vs</em>
          <span />
        </div>
        <TeamRow
          name={match.awayTeam}
          score={scoreFor(match, 'away')}
          scheduled={scheduled}
        />
      </div>

      <footer className="match-card__footer">
        <div className="match-card__meta">
          <span className="match-card__time">
            <Icon name={isLive ? 'signal' : 'clock'} size={13} />
            {metaText(match, now)}
          </span>
          {attribution && (
            <a
              className="attribution"
              href={attribution.url}
              rel="noopener"
              target="_blank"
              title="Live data supplied by SportScore"
            >
              {attribution.text}
              <Icon name="arrow-up-right" size={11} />
            </a>
          )}
        </div>

        <button
          aria-label={following ? `Unfollow ${match.homeTeam} vs ${match.awayTeam}` : `Track ${match.homeTeam} vs ${match.awayTeam}`}
          aria-pressed={following}
          className={`track-button${following ? ' is-following' : ''}`}
          onClick={() => onToggleFollow(match.id)}
          type="button"
        >
          <Icon name={following ? 'check' : 'bell'} size={14} />
          {following ? 'Following' : 'Track'}
        </button>
      </footer>
    </article>
  )
}
