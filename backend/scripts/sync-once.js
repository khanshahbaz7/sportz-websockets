import 'dotenv/config';
import { pool } from '../src/db/db.js';
import { loadSportScoreConfig } from '../src/services/sportscore/config.js';
import { SportScoreSyncService } from '../src/services/sportscore/sync.js';

function getArg(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

const date = getArg('date');
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Invalid --date value. Expected YYYY-MM-DD.');
  process.exit(1);
}

const sport = getArg('sport');
const competition = getArg('competition');

if (sport && !['football', 'cricket'].includes(sport)) {
  console.error('Invalid --sport value. Expected football or cricket.');
  process.exit(1);
}

const config = loadSportScoreConfig();

if (hasFlag('no-auto-import')) {
  config.autoImport = false;
}

if (competition) {
  if (sport === 'cricket') {
    config.cricketCompetitions = [competition];
  } else {
    config.footballCompetitions = [competition];
  }
}

if (sport === 'football') {
  config.cricketEnabled = false;
} else if (sport === 'cricket') {
  config.footballCompetitions = [];
}

const service = new SportScoreSyncService({
  config,
  logger: console,
});

try {
  const result = await service.runOnce('cli', { date });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('SportScore sync failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
