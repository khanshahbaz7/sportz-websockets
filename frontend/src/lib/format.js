const SPORT_ALIASES = {
  soccer: 'football',
  'association football': 'football',
};

const SPORT_META = {
  football: { label: 'Football', icon: 'football', accent: 'lime' },
  cricket: { label: 'Cricket', icon: 'cricket', accent: 'amber' },
  basketball: { label: 'Basketball', icon: 'basketball', accent: 'violet' },
  tennis: { label: 'Tennis', icon: 'tennis', accent: 'cyan' },
};

const CLUB_STOPWORDS = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'club']);

export function normalizeSport(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return SPORT_ALIASES[key] || key;
}

export function titleCase(value) {
  return String(value ?? '')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function sportMeta(value) {
  const key = normalizeSport(value);
  return SPORT_META[key] || {
    label: titleCase(key || 'Other'),
    icon: 'trophy',
    accent: 'lime',
  };
}

export function connectionLabel(status) {
  if (status === 'live') return 'Live feed';
  if (status === 'connecting') return 'Connecting';
  if (status === 'reconnecting') return 'Reconnecting';
  return 'Offline';
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameDay(left, right) {
  return startOfDay(left) === startOfDay(right);
}

export function formatKickoff(value, now = Date.now()) {
  if (!value) return 'Time TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time TBD';

  const nowDate = new Date(now);
  const tomorrow = new Date(nowDate);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isSameDay(date, nowDate)) return `Today • ${time}`;
  if (isSameDay(date, tomorrow)) return `Tomorrow • ${time}`;

  const day = date.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return `${day} • ${time}`;
}

export function formatCountdown(value, now = Date.now()) {
  if (!value) return 'Time TBD';
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return 'Time TBD';

  const diff = target - now;
  if (diff <= 0) return 'Starting soon';

  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes ? `in ${hours}h ${remainingMinutes}m` : `in ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

export function liveLabel(match) {
  const minute = match?.liveMinute;
  if (minute !== null && minute !== undefined && String(minute).trim() !== '') {
    const value = String(minute).trim();
    return /^\d+$/.test(value) ? `${value}'` : value;
  }
  if (match?.statusText) return match.statusText;
  return 'Live';
}

export function statusLabel(match, now = Date.now()) {
  if (match?.status === 'live') return liveLabel(match);
  if (match?.status === 'finished') {
    if (match?.statusText) return match.statusText;
    return normalizeSport(match?.sport) === 'football' ? 'Full time' : 'Final';
  }
  if (match?.startTime) return formatCountdown(match.startTime, now);
  return 'Upcoming';
}

export function scoreFor(match, side) {
  if (!match) return '–';

  const text = side === 'home' ? match.homeScoreText : match.awayScoreText;
  const runs = side === 'home' ? match.homeScore : match.awayScore;
  const wickets = side === 'home' ? match.homeWickets : match.awayWickets;
  const sport = normalizeSport(match.sport);
  const scheduled = match.status === 'scheduled';

  if (text !== null && text !== undefined && text !== '' && text !== '-') {
    return String(text);
  }

  if (scheduled) return '–';

  if (sport === 'cricket' && runs !== null && runs !== undefined) {
    return wickets !== null && wickets !== undefined ? `${runs}/${wickets}` : String(runs);
  }

  if (runs !== null && runs !== undefined) return String(runs);
  return '–';
}

export function teamInitials(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !CLUB_STOPWORDS.has(word.toLowerCase()));

  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function teamHue(name) {
  let hash = 0;
  const value = String(name ?? '');
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }
  return hash;
}

export function matchSearchText(match) {
  const meta = sportMeta(match?.sport);
  return [
    match?.homeTeam,
    match?.awayTeam,
    match?.competition,
    match?.competitionSlug,
    meta.label,
    match?.sport,
    match?.statusText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function formatRelativeUpdated(value, now = Date.now()) {
  if (!value) return 'just now';
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'just now';

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Date(timestamp).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function formatCommentaryTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function eventTone(eventType, tags = []) {
  const text = `${eventType || ''} ${Array.isArray(tags) ? tags.join(' ') : ''}`.toLowerCase();
  if (text.includes('own goal') || text.includes('goal')) return 'goal';
  if (text.includes('wicket')) return 'wicket';
  if (text.includes('yellow') || text.includes('red') || text.includes('card')) return 'card';
  if (text.includes('sub')) return 'sub';
  if (text.includes('var')) return 'var';
  return 'info';
}

export function eventIcon(tone) {
  return {
    goal: 'football',
    wicket: 'cricket',
    card: 'card',
    sub: 'swap',
    var: 'var',
    info: 'bolt',
  }[tone] || 'bolt';
}

export function humanizeLabel(value) {
  return titleCase(String(value ?? '').replace(/[_-]+/g, ' ').trim());
}

export function attributionFor(...items) {
  for (const item of items) {
    if (item?.attribution?.url) return item.attribution;
  }
  return null;
}

const STATUS_RANK = {
  live: 0,
  scheduled: 1,
  finished: 2,
};

function timeValue(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortMatches(list) {
  return [...list].sort((left, right) => {
    const rank =
      (STATUS_RANK[left?.status] ?? 3) - (STATUS_RANK[right?.status] ?? 3);
    if (rank !== 0) return rank;

    if (left?.status === 'finished') {
      return timeValue(right.startTime) - timeValue(left.startTime);
    }

    return timeValue(left?.startTime) - timeValue(right?.startTime);
  });
}
