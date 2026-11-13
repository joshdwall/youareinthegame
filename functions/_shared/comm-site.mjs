/**
 * youareinthegame.com wiring for the site-hub communications module (pinned + vendored: config/comm-source.json).
 * Site config: config/communications.json (communications.v1). Votes stay in D1 YAITG_WORLDMAP_DB.discovery_responses.
 */
import config from '../../config/communications.json';
import { createPollsApi } from './communications/server/polls.mjs';

export { config };
export const DISCOVERY_POLL = 'how-did-you-find';
export const pollsApi = (env) => createPollsApi({ config, env });
