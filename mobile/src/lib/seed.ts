/**
 * Seed data shipped with the app. These are copies of the desktop repo's
 * sites.txt / settings.json; on first launch they are written to the app's
 * private data directory (see src/lib/storage.ts when it lands).
 */

export const SEED_SITES = `https://www.imdb.com/
https://www.gamespot.com/
https://www.cnn.gr/
https://edition.cnn.com/
https://www.bbc.com/
https://finance.yahoo.com/
https://www.nba.com/
https://www.euroleaguebasketball.net/en/euroleague/
https://www.youtube.com/@InFeRnoBraVeHeart
https://www.youtube.com/@TArounders
https://www.youtube.com/@SenatorSanders
`;

export { default as SEED_SETTINGS_JSON } from "../../assets/seed/settings.json";
