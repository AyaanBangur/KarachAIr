// Keeps the volunteer guide chat (messages and conversation state) while the volunteer moves between tabs,
// and even after they close the app and come back, so the chat continues where they left off instead of starting again.
// It is kept on this device for that volunteer until they press Start over.
const PREFIX = 'tw-chat-';
export interface SavedChat<I, S> { items: I[]; state: S }

export function loadChat<I, S>(key: string): SavedChat<I, S> | null {
  try { const raw = localStorage.getItem(PREFIX + key); return raw ? (JSON.parse(raw) as SavedChat<I, S>) : null; } catch { return null; }
}
export function saveChat<I, S>(key: string, chat: SavedChat<I, S>) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(chat)); } catch { /* storage full or blocked: the chat just will not be kept */ }
}
export function clearChats() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  try { Object.keys(sessionStorage).filter((k) => k.startsWith(LIVE) || k === LANDED).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}

// A saved chat is only restored while the SAME sign-in is still going (switching tabs, reloading the page).
// A new sign-in always starts fresh, so Hawa greets the volunteer out loud again.
const LIVE = 'tw-chat-live-', LANDED = 'tw-landed';
export const isLive = (key: string) => { try { return sessionStorage.getItem(LIVE + key) === '1'; } catch { return false; } };
export const markLive = (key: string) => { try { sessionStorage.setItem(LIVE + key, '1'); } catch { /* ignore */ } };
/** True the first time it is asked after a sign-in: the volunteer is taken to the chat guide once. */
export function firstLanding(): boolean { try { if (sessionStorage.getItem(LANDED)) return false; sessionStorage.setItem(LANDED, '1'); return true; } catch { return false; } }
