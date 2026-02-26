import { Context, Scenes } from 'telegraf';

/**
 * Bot session — Telegraf's scene session persisted in SQLite.
 * Scene-specific data lives in ctx.scene.state (stored under __scenes).
 * Add cross-scene persistent fields here only if needed across scene boundaries.
 */
export type BotSession = Scenes.SceneSession;

/**
 * Unified bot context — use this everywhere instead of bare telegraf Context.
 */
export interface BotContext extends Context {
  session: BotSession;
  scene: Scenes.SceneContextScene<BotContext, Scenes.SceneSessionData>;
}
