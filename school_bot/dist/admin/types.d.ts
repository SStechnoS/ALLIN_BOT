import { Context, Scenes } from 'telegraf';
export type AdminSession = Scenes.SceneSession;
export interface AdminBotContext extends Context {
    session: AdminSession;
    scene: Scenes.SceneContextScene<AdminBotContext, Scenes.SceneSessionData>;
}
//# sourceMappingURL=types.d.ts.map