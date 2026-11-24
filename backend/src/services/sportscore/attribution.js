export const SPORTSCORE_ATTRIBUTION = {
  provider: 'SportScore',
  text: 'Powered by SportScore',
  url: 'https://sportscore.com',
  follow: true,
};

export function withSportScoreAttribution(match) {
  if (!match || match.externalSource !== 'sportscore') return match;
  return { ...match, attribution: SPORTSCORE_ATTRIBUTION };
}
