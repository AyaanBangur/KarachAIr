// Volunteer profile photo, taken with the device webcam. PRIVACY: the photo lives only in this browser tab's
// temporary session storage. It is never uploaded to a server or database, and it is deleted on sign out.
import { useSyncExternalStore } from 'react';

const SKIP = 'skip';
const key = (id: string) => `tw-photo-${id}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const read = (id: string): string | null => { try { return sessionStorage.getItem(key(id)); } catch { return null; } };
const write = (id: string, v: string | null) => { try { v == null ? sessionStorage.removeItem(key(id)) : sessionStorage.setItem(key(id), v); } catch { /* storage blocked: the photo just will not persist */ } notify(); };

export const savePhoto = (id: string, dataUrl: string) => write(id, dataUrl);
export const skipPhoto = (id: string) => write(id, SKIP);
export const clearPhoto = (id: string) => write(id, null);

/** The saved photo (a data URL), 'skipped' if the volunteer chose to go without one, or null if nothing is saved yet. */
export function usePhoto(id: string): { photo: string | null; skipped: boolean } {
  const v = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => read(id), () => null);
  return { photo: v && v !== SKIP ? v : null, skipped: v === SKIP };
}
