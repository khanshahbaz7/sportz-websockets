import { Icon } from './Icons'
import {
  attributionFor,
  connectionLabel,
  eventIcon,
  eventTone,
  formatCommentaryTime,
  formatRelativeUpdated,
  humanizeLabel,
  scoreFor,
  statusLabel,
} from '../lib/format'

function WatchRow({ match, active, now, onSelect, onToggleFollow }) {
  return (
    <div className={`watch-row${active ? ' is-active' : ''}`} role="listitem">
      <button
        aria-current={active ? 'true' : undefined}
        className="watch-row__main"
        onClick={() => onSelect(match.id)}
        type="button"
      >
        <span className={`watch-row__dot watch-row__dot--${match.status}`} aria-hidden="true" />
        <span className="watch-row__teams">
          <span>{match.homeTeam}</span>
          <span>{match.awayTeam}</span>
        </span>
        <span className="watch-row__scores">
          <span>{scoreFor(match, 'home')}</span>
          <span>{scoreFor(match, 'away')}</span>
        </span>
        <span className="watch-row__status">{statusLabel(match, now)}</span>
      </button>
      <button
        aria-label={`Unfollow ${match.homeTeam} vs ${match.awayTeam}`}
        className="watch-row__remove"
        onClick={() => onToggleFollow(match.id)}
        title="Unfollow"
        type="button"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}

function CommentaryItem({ comment }) {
  const tone = eventTone(comment.eventType, comment.tags)
  const minute =
    comment.minutes !== null && comment.minutes !== undefined ? `${comment.minutes}'` : null
  const event = comment.eventType ? humanizeLabel(comment.eventType) : null

  return (
    <li className={`comment comment--${tone}`}>
      <span className="comment__icon" aria-hidden="true">
        <Icon name={eventIcon(tone)} size={13} />
      </span>
      <div className="comment__body">
        <div className="comment__head">
          {minute && <span className="comment__minute">{minute}</span>}
          {event && <span className="comment__event">{event}</span>}
          {comment.team && <span className="comment__team">{comment.team}</span>}
          <time className="comment__time" dateTime={comment.createdAt || undefined}>
            {formatCommentaryTime(comment.createdAt)}
          </time>
        </div>
        <p className="comment__message">{comment.message}</p>
        {(comment.actor || comment.period) && (
          <p className="comment__sub">
            {comment.actor && <span>{comment.actor}</span>}
            {comment.actor && comment.period && <span aria-hidden="true">·</span>}
            {comment.period && <span>{comment.period}</span>}
          </p>
        )}
      </div>
    </li>
  )
}

function CommentarySkeleton() {
  return (
    <div className="commentary-skeleton" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div className="commentary-skeleton__row" key={row}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  )
}

export function MatchCentre({
  followingMatches,
  focusedMatch,
  focusedCommentary,
  commentaryState,
  connection,
  lastLoadedAt,
  now,
  open,
  onClose,
  onSelect,
  onToggleFollow,
  onRetryCommentary,
  onBrowse,
}) {
  const attribution = attributionFor(focusedMatch, ...focusedCommentary)
  const hasFollowing = followingMatches.length > 0

  return (
    <aside className={`match-centre${open ? ' is-open' : ''}`} aria-label="Match centre">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Match centre</p>
          <h2>
            Your watchlist
            <span className="panel-count">{followingMatches.length}</span>
          </h2>
        </div>
        <button
          aria-label="Close match centre"
          className="icon-button panel-close"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className={`connection connection--${connection}`} role="status">
        <span className="connection__dot" aria-hidden="true" />
        <span>{connectionLabel(connection)}</span>
        <span className="connection__divider" aria-hidden="true" />
        <span className="connection__meta">
          Synced {formatRelativeUpdated(lastLoadedAt, now)}
        </span>
      </div>

      {!hasFollowing ? (
        <div className="panel-empty">
          <span className="panel-empty__icon">
            <Icon name="bell" size={26} />
          </span>
          <h3>Nothing tracked yet</h3>
          <p>
            Tap <strong>Track</strong> on any match to pin it here. Live commentary and score
            changes stream in automatically.
          </p>
          <button className="ghost-button" onClick={onBrowse} type="button">
            Browse the board
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="watchlist" role="list" aria-label="Tracked matches">
            {followingMatches.map((match) => (
              <WatchRow
                active={focusedMatch?.id === match.id}
                key={match.id}
                match={match}
                now={now}
                onSelect={onSelect}
                onToggleFollow={onToggleFollow}
              />
            ))}
          </div>

          <section className="commentary" aria-label="Live commentary">
            <header className="commentary__head">
              <div className="commentary__title">
                <span className="commentary__live-dot" aria-hidden="true" />
                <h3>Live commentary</h3>
              </div>
              {focusedMatch && (
                <p className="commentary__match">
                  {focusedMatch.homeTeam} <span>vs</span> {focusedMatch.awayTeam}
                  {focusedMatch.competition ? ` · ${focusedMatch.competition}` : ''}
                </p>
              )}
            </header>

            {commentaryState === 'loading' && <CommentarySkeleton />}

            {commentaryState === 'error' && (
              <div className="commentary-empty">
                <p>Commentary could not be loaded.</p>
                <button
                  className="ghost-button"
                  onClick={() => onRetryCommentary(focusedMatch?.id)}
                  type="button"
                >
                  <Icon name="refresh" size={14} />
                  Try again
                </button>
              </div>
            )}

            {commentaryState !== 'loading' &&
              commentaryState !== 'error' &&
              focusedCommentary.length === 0 && (
                <div className="commentary-empty">
                  <span className="commentary-empty__icon">
                    <Icon name="sparkle" size={20} />
                  </span>
                  <p>
                    No commentary yet. The moment the feed reports an event, it lands here.
                  </p>
                </div>
              )}

            {focusedCommentary.length > 0 && (
              <ol className="commentary-list" aria-live="polite">
                {focusedCommentary.map((comment, index) => (
                  <CommentaryItem
                    comment={comment}
                    key={comment.id ?? `${comment.createdAt}-${index}`}
                  />
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      {attribution && (
        <footer className="panel-footer">
          <a
            className="panel-attribution"
            href={attribution.url}
            rel="noopener"
            target="_blank"
          >
            <Icon name="sparkle" size={12} />
            {attribution.text}
            <Icon name="arrow-up-right" size={11} />
          </a>
        </footer>
      )}
    </aside>
  )
}
