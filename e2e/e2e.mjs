import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://dylanevanswork.github.io/swarm/';
const log = (...a) => console.log(...a);
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };

const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const ctxA = await browser.newContext(), ctxB = await browser.newContext();
const A = await ctxA.newPage(), B = await ctxB.newPage();
const errs = [];
for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', e => errs.push(`${n}: ${e.message}`)); }

log('loading', URL);
const res = await A.goto(URL, { waitUntil: 'load' });
log('status', res.status(), 'title', await A.title());
if (res.status() !== 200) fail('site did not return 200');
await A.waitForFunction(() => typeof Peer !== 'undefined' && !!window.__swarm, null, { timeout: 20000 }).catch(() => fail('page scripts/PeerJS failed to load'));

await A.click('#bCreate');
await A.waitForFunction(() => window.__swarm.state.state === 'lobby', null, { timeout: 25000 }).catch(() => fail('party was not created (signaling server?)'));
const code = await A.evaluate(() => window.__swarm.state.partyCode);
log('party code', code);

// friend opens the invite link (hash auto-join), exactly like a real friend would
await B.goto(URL + '#' + code, { waitUntil: 'load' });
await B.waitForFunction(() => window.__swarm.state.screen === 'game', null, { timeout: 40000 }).catch(() => fail('friend never connected to the party'));
await A.waitForFunction(() => window.__swarm.state.players === 2, null, { timeout: 15000 }).catch(() => fail('host never saw the friend'));
log('connected: host sees 2 players');

// style picking through the real UI, then start
await A.click('.sc[data-i="1"]');
await B.click('.sc[data-i="3"]');
await A.waitForFunction(() => players.map(p => p.sty).join() === '1,3', null, { timeout: 10000 }).catch(async () => fail('styles not synced: ' + await A.evaluate(() => players.map(p => p.sty).join())));
await A.click('#bStart');
await B.waitForFunction(() => window.__swarm.state.state === 'play', null, { timeout: 15000 }).catch(() => fail('game did not start on friend side'));
await A.waitForTimeout(12000);
const sa = await A.evaluate(() => window.__swarm.state), sb = await B.evaluate(() => window.__swarm.state);
log('host', JSON.stringify(sa)); log('friend', JSON.stringify(sb));
if (!(sa.t > 5 && sb.t > 5)) fail('game clock not advancing');
if (Math.abs(sa.t - sb.t) > 2) fail('clocks diverged');
const seeds = await Promise.all([A, B].map(p => p.evaluate(() => mapSeed + '|' + walls.length)));
if (seeds[0] !== seeds[1]) fail('maps differ: ' + seeds.join(' vs '));
log('same map on both:', seeds[0]);
if (errs.length) fail('page errors: ' + errs.join('; '));
log('PASS');
await browser.close();
