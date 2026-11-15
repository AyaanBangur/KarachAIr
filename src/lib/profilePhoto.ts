// Volunteer profile photo. Taken with the webcam or uploaded from a computer or phone, then kept with the account so the
// volunteer is only asked once. It is stored on this device straight away; if the account database has the profile
// functions (see supabase/migrations), it is also saved to the account so it follows the volunteer to other devices.
import { useSyncExternalStore } from 'react';
import { SHARED_ENABLED, rpc } from './api';

const K = {
  photo: (id: string) => `tw-photo-${id}`,          // saved photo (this device, kept across sign-ins)
  never: (id: string) => `tw-photo-never-${id}`,    // "don't ask me again"
  later: (id: string) => `tw-photo-later-${id}`,    // "ask me next time" (this browser session only)
  edit: (id: string) => `tw-photo-edit-${id}`,      // the volunteer pressed their avatar to change the photo
};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const get = (store: Storage, k: string) => { try { return store.getItem(k); } catch { return null; } };
const set = (store: Storage, k: string, v: string | null) => { try { v == null ? store.removeItem(k) : store.setItem(k, v); } catch { /* storage blocked */ } };

const real = (token?: string) => !!token && token !== 'demo' && SHARED_ENABLED;
/** Best effort: if the database has not been updated with the profile functions yet, this quietly does nothing. */
const push = (token: string | undefined, photo: string | null, never: boolean | null) => { if (real(token)) void rpc('tw_set_profile', { p_token: token, p_photo: photo, p_never: never }).catch(() => undefined); };

export function savePhoto(id: string, dataUrl: string, token?: string) { set(localStorage, K.photo(id), dataUrl); set(sessionStorage, K.edit(id), null); set(sessionStorage, K.later(id), null); notify(); push(token, dataUrl, null); }
export function removePhoto(id: string, token?: string) { set(localStorage, K.photo(id), null); set(sessionStorage, K.edit(id), null); set(sessionStorage, K.later(id), '1'); notify(); push(token, '', null); }
export function neverAskAgain(id: string, token?: string) { set(localStorage, K.never(id), '1'); set(sessionStorage, K.edit(id), null); notify(); push(token, null, true); }
export function askLater(id: string) { set(sessionStorage, K.later(id), '1'); set(sessionStorage, K.edit(id), null); notify(); }
export function startEdit(id: string) { set(sessionStorage, K.edit(id), '1'); notify(); }
export function cancelEdit(id: string) { set(sessionStorage, K.edit(id), null); notify(); }
/** On sign out: forget the per-session choices (the photo and "don't ask again" stay with the account). */
export function clearSessionFlags() { try { Object.keys(sessionStorage).filter((k) => k.startsWith('tw-photo-')).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ } notify(); }

/** Pull the saved profile from the account (if the database supports it) and merge it with what is on this device. */
export async function syncProfile(id: string, token?: string): Promise<void> {
  if (!real(token)) return;
  try {
    const r = await rpc<{ photo?: string | null; never?: boolean; error?: string }>('tw_get_profile', { p_token: token });
    if (r.error) return;
    if (r.photo && !get(localStorage, K.photo(id))) set(localStorage, K.photo(id), r.photo);
    if (r.never && !get(localStorage, K.never(id))) set(localStorage, K.never(id), '1');
    notify();
    const localPhoto = get(localStorage, K.photo(id));
    if (localPhoto && !r.photo) push(token, localPhoto, null);
  } catch { /* the database does not have the profile functions yet: the device copy is used */ }
}

export function usePhotoState(id: string) {
  const snap = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => JSON.stringify([get(localStorage, K.photo(id)), get(localStorage, K.never(id)) === '1', get(sessionStorage, K.later(id)) === '1', get(sessionStorage, K.edit(id)) === '1']),
    () => 'null',
  );
  const [photo, never, later, edit] = JSON.parse(snap === 'null' ? '[null,false,false,false]' : snap) as [string | null, boolean, boolean, boolean];
  return { photo, never, later, editing: edit, mustAsk: edit || (!photo && !never && !later) };
}
