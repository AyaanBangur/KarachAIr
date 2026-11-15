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
}
