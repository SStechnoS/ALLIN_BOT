import { Context, Scenes } from 'telegraf';

/**
 * Session data — extend this interface as features are added.
 * Keep it flat and serialisable (SQLite stores it as JSON).
 */
export interface SessionData extends Scenes.SceneSessionData {
  // example: userId?: number;
}

/**
 * Unified bot context — pass this everywhere instead of bare telegraf Context.
 * Add services / middleware state here as the project grows.
 */
export interface BotContext extends Context {
  session: Scenes.SceneSession<SessionData>;
  scene: Scenes.SceneContextScene<BotContext, SessionData>;
}
