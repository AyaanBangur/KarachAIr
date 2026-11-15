// Missions an organization posts for its own volunteers. They reuse the shared database's mission functions, so the
// "indoor / outdoor" choice is stored as a prefix on the details text (outdoor missions need an adult and safe air).
import type { Mission as PostedMission } from './logs';
import type { Mission } from './service';

export type Where = 'indoor' | 'outdoor';
export const POST_HOURS = 2;
export const encodeDetails = (where: Where, text: string) => `[${where}] ${text.trim()}`;
export function decodeDetails(d: string): { where: Where; text: string } {
  const m = d.match(/^\[(indoor|outdoor)\]\s*([\s\S]*)$/);
  return m ? { where: m[1] as Where, text: m[2] } : { where: 'indoor', text: d };
}
/** The posted mission in the same shape as the built-in ones, so accepting it follows the same path. */
export function toMission(p: PostedMission, orgName: string): Mission {
  const { where, text } = decodeDetails(p.details);
  return { id: `org-${p.id}`, tier: '2', tierLabel: `Posted by ${orgName}`, hours: POST_HOURS, min: POST_HOURS, max: POST_HOURS, where, focus: 'air', title: p.title, desc: text, trigger: `New from ${orgName}` };
}
