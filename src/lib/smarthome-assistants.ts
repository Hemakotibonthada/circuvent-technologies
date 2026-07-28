// Voice & Assistant Hub — local voice-command aliases (a memorable phrase
// mapped to an existing scene) plus links/instructions for linking Google
// Home and Alexa, which are already implemented, multi-tenant, on the
// platform/ backend (see platform/SMART_HOME.md) via OAuth. This module does
// not re-implement that OAuth flow — it just helps a user remember phrases
// and jump to the linking screen.

const KEY = "cv-console-voice-aliases";

export interface VoiceAlias {
  id: string;
  phrase: string;
  sceneId: number;
  sceneName: string;
}

export function listAliases(): VoiceAlias[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VoiceAlias[]) : [];
  } catch {
    return [];
  }
}

export function addAlias(phrase: string, sceneId: number, sceneName: string): VoiceAlias {
  const alias: VoiceAlias = { id: `va_${Date.now().toString(36)}`, phrase, sceneId, sceneName };
  const list = [alias, ...listAliases()];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }
  return alias;
}

export function deleteAlias(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(listAliases().filter((a) => a.id !== id)));
  } catch {
    /* ignore */
  }
}
