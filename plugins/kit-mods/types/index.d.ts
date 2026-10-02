export type KitModsLimit = { kind: string; percentUsed: number; resetsAt?: string };
export type KitModsContext = { tokens: number; window: number; percent: number };
export type KitModsPlan = { slug: string; title: string; status: string; done: number; total: number; others: number };
export type KitModsAgent = { type: string; isWorktree: boolean };
export type KitModsBlast = { command: string; lines: string[] };

declare module 'claude-code' {
  interface PluginState {
    'kit-mods': {
      limits: KitModsLimit[];
      context: KitModsContext | null;
      plan: KitModsPlan | null;
      agents: KitModsAgent[];
      blast: KitModsBlast | null;
    };
  }
}
