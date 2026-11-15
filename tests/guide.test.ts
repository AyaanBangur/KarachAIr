import { beforeAll, describe, expect, it } from 'vitest';
import { AREAS, TYPES, parseArea, parseAreaFuzzy, parseSetting, parseTypes, registerAreas, respond, startChat, type GCtx, type GState } from '../src/lib/guide';
import { units } from './helpers';

const ctx = (): GCtx => ({ name: 'Amina', tasks: [], airFor: () => ({ pm25: 10, label: 'Good', outdoorOk: true, triggered: [] }), today: 'today', rng: () => 0 });
beforeAll(() => registerAreas(units));
const say = (s: GState, t: string) => respond(s, t, ctx());

describe('Hawa knows every Karachi town', () => {
  it('has all 24 units', () => { expect(new Set(AREAS.map((a) => a.unitId)).size).toBe(24); });
  it.each([['Clifton', 'clifton-cantonment'], ['DHA', 'clifton-cantonment'], ['Gulshan', 'gulshan-e-iqbal-town'], ['Jamshed', 'jamshed-town'], ['PECHS', 'jamshed-town'],
    ['North Nazimabad', 'north-nazimabad-town'], ['Liaquatabad', 'liaquatabad-town'], ['Gadap', 'gadap-town'], ['Keamari', 'kiamari-town'], ['Bin Qasim', 'bin-qasim-town'],
    ['Landhi', 'landhi-town'], ['Baldia', 'baldia-town'], ['SITE', 'site-town'], ['New Karachi', 'new-karachi-town'], ['Shah Faisal', 'shah-faisal-town'], ['Saddar', 'saddar-town']])('understands %s', (text, unitId) => {
    expect(AREAS.find((a) => a.name === parseArea(text))?.unitId).toBe(unitId);
  });
  it('forgives typos while asking for the area', () => {
    for (const [typo, unit] of [['Orangey', 'orangi-town'], ['karangee', 'korangi-town'], ['Malear', 'malir-town'], ['Lyary', 'lyari-town']]) expect(AREAS.find((a) => a.name === parseAreaFuzzy(typo))?.unitId).toBe(unit);
  });
  it('does not guess wildly', () => { expect(parseAreaFuzzy('I live near the market')).toBeNull(); expect(parseArea('what is the weather')).toBeNull(); });
});

describe('Hawa understands the six activity choices', () => {
  it('maps each button to its own activity', () => { TYPES.forEach((t) => expect(parseTypes(t.name, [])).toEqual([t.id])); });
  it('accepts two at once and "Surprise me"', () => {
    expect(parseTypes('Plant trees & fight dust, Track air & heat data', [])).toEqual([3, 5]);
    expect(parseTypes('Surprise me', [])).toEqual([1, 2, 3, 4, 5]);
  });
  it('asks only about the six options, not interests', () => {
    let s = startChat(ctx()).state; const o = say(s, 'Saddar'); const q = o.msgs.map((m) => m.text).join(' ');
    expect(q).toMatch(/What would you like to do as a volunteer\?/);
    TYPES.forEach((t) => expect(q).toContain(t.name));
    expect(q).not.toMatch(/planting, spreading|cleaning up/i);
    s = o.state; expect(s.stage).toBe('types');
  });
  it('reads indoor / outdoor', () => { expect(parseSetting('outdoors please')).toBe('Outdoor'); expect(parseSetting('inside')).toBe('Indoor'); expect(parseSetting('either')).toBe('Any'); });
});

describe('Hawa never asks for a nickname or for time', () => {
  it('goes name (from the account) -> area -> activity -> setting', () => {
    const start = startChat(ctx());
    expect(start.state.profile.nick).toBe('Amina');
    expect(start.msgs.map((m) => m.text).join(' ')).not.toMatch(/nickname|how much time|how many hours/i);
    expect(start.state.stage).toBe('area');
  });
});

describe('saying hi again', () => {
  it('greets back and keeps going when nothing has happened yet', () => {
    const o = say(startChat(ctx()).state, 'hi'); expect(o.msgs.length).toBeGreaterThan(1); expect(o.state.ask).toBeUndefined(); expect(o.state.stage).toBe('area');
  });
  it('offers to continue or start new when there is an old conversation', () => {
    const mid = say(startChat(ctx()).state, 'Saddar').state; const o = say(mid, 'hello');
    expect(o.state.ask).toBe('resume'); expect(o.msgs.at(-1)?.chips).toEqual(['Continue where we left off', 'Start a new conversation']);
  });
  it('continue picks up at the same question; new starts again from the area question and clears the screen', () => {
    const asked = say(say(startChat(ctx()).state, 'Saddar').state, 'hey').state;
    const cont = say(asked, 'Continue where we left off'); expect(cont.state.stage).toBe('types'); expect(cont.state.ask).toBeUndefined(); expect(cont.state.profile.area).toBe('Saddar');
    const fresh = say(asked, 'Start a new conversation'); expect(fresh.state.stage).toBe('area'); expect(fresh.state.profile.area).toBeNull(); expect(fresh.reset).toBe(true);
  });
  it('asks again when the answer is unclear, and stop words end the chat', () => {
    const asked = say(say(startChat(ctx()).state, 'Saddar').state, 'hi').state;
    expect(say(asked, 'banana').state.ask).toBe('resume');
    expect(say(asked, 'bye').state.stage).toBe('ended');
  });
  it('works after a finished chat too', () => {
    let s = startChat(ctx()).state; for (const t of ['Saddar', 'trees', 'either', "that's enough"]) s = say(s, t).state;
    expect(s.stage).toBe('ended'); const o = say(s, 'hi'); expect(o.state.ask).toBe('resume'); expect(say(o.state, 'continue').state.stage).not.toBe('ended');
  });
});

describe('privacy', () => {
  it('refuses phone numbers and emails typed into the chat', () => {
    const o = say(startChat(ctx()).state, 'call me on 03001234567'); expect(o.msgs[0].text).toMatch(/contact details/i);
    expect(say(startChat(ctx()).state, 'me@example.com').msgs[0].text).toMatch(/contact details/i);
  });
});

describe("Hawa's trained activity model", () => {
  it('has a clean, leak-free split and beats the baselines on test sentences it never saw', async () => {
    const { allExamples, activityProbs } = await import('../src/lib/intent');
    const ex = allExamples(), bases = (sp: string) => new Set(ex.filter((e) => e.split === sp).map((e) => e.base));
    expect([...bases('test')].filter((b) => bases('train').has(b) || bases('val').has(b))).toEqual([]);
    const test = ex.filter((e) => e.split === 'test'), acc = test.filter((e) => activityProbs(e.text)[0].label === e.label).length / test.length;
    const majority = Math.max(...[0, 1, 2, 3, 4, 5].map((l) => test.filter((e) => e.label === l).length)) / test.length;
    expect(acc).toBeGreaterThan(majority + 0.3); expect(acc).toBeGreaterThan(0.75);
  });
  it('returns a probability distribution', async () => {
    const { activityProbs } = await import('../src/lib/intent'); const p = activityProbs('plant more trees'); expect(p.reduce((a, c) => a + c.p, 0)).toBeCloseTo(1, 5); expect(p[0].label).toBe(3);
  });
  it('keeps combinations from the rules, and says nothing for off-topic answers', async () => {
    const { decideActivity } = await import('../src/lib/intent');
    expect(decideActivity('trees and masks', [3, 4])).toEqual([3, 4]); expect(decideActivity('i like cricket', null)).toBeNull();
  });
  it('never overrides an answer the rules already understood', () => {
    const s0 = respond(startChat(ctx()).state, 'Saddar', ctx()).state; expect(respond(s0, 'Plant trees & fight dust', ctx()).state.profile.types).toEqual([3]);
  });
});
