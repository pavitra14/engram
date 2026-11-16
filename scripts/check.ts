/**
 * Logic checks that run in plain Node (no device needed):
 *  - every migration applies cleanly and full-text search works
 *  - the auto-linker groups related thoughts and keeps unrelated ones apart
 * Run with: npm run check
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import type { Db } from '../src/db/db';
import { importLegacy, LEGACY_MIGRATIONS } from '../src/db/legacy';
import * as repo from '../src/db/repo';
import { plainDDL } from '../src/db/schema';
import { computeGroups } from '../src/lib/groups';
import { meaningSimilarity, related, relateAll, surfaceTokens, tokenize, whyLinked } from '../src/lib/linker';
import { dayLabel, daysAgo, dueBucket, dueLabel, fileSize, firstUrl, ftsQuery, highlightRuns, hostOf, htmlToText, isFormatted, nextRepeat, textToHtml, titleOf } from '../src/lib/text';

// --- database ---
// The same repo code the phone runs, against node:sqlite. On the phone the tables are
// PowerSync views; here they are plain tables with the same columns and no constraints.
function nodeDb(raw = new DatabaseSync(':memory:'), ddl = true): Db {
  if (ddl) raw.exec(plainDDL());
  type P = Parameters<ReturnType<DatabaseSync['prepare']>['run']>;
  const self: Db = {
    run: async (sql, params = []) => {
      raw.prepare(sql).run(...(params as P));
    },
    all: async <T,>(sql: string, params: unknown[] = []) => raw.prepare(sql).all(...(params as P)).map((r) => ({ ...(r as object) })) as T[],
    first: async <T,>(sql: string, params: unknown[] = []) => {
      const r = raw.prepare(sql).get(...(params as P));
      return r ? ({ ...(r as object) } as T) : null;
    },
    tx: async (fn) => {
      raw.exec('BEGIN');
      try {
        const out = await fn(self);
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return self;
}

async function databaseChecks(): Promise<void> {
  const db = nodeDb();
  await repo.prepare(db);
  assert.ok(repo.hasSearchIndex(), 'full-text search is available');
  const count = async (table: string) => (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
  const found = async (q: string) => (await repo.searchThoughts(db, q)).map((t) => t.id);

  await repo.insertThought(db, { id: 'a', kind: 'text', body: 'Sourdough starter needs feeding tonight', created_at: 1 });
  await repo.insertThought(db, { id: 'b', kind: 'text', body: 'Train tickets for the Hampi trip', created_at: 2 });
  await repo.insertThought(db, { id: 'c', kind: 'video', body: '', title: 'holiday.mp4', file_name: 'holiday.mp4', created_at: 3 });
  assert.deepEqual(await found('sourd'), ['a'], 'prefix search finds the thought');
  assert.deepEqual(await found('hampi trip'), ['b']);
  assert.deepEqual(await found('holiday'), ['c'], 'file names are searchable');
  await repo.updateThought(db, 'a', { title: 'Shopping', body: 'Rye flour', body_html: '<html><p><b>Rye</b> flour</p></html>' });
  assert.deepEqual(await found('sourdough'), [], 'the index follows edits');
  assert.deepEqual(await found('rye'), ['a']);
  assert.deepEqual(await found('shopping'), ['a'], 'titles are searched');
  const a = (await repo.getThought(db, 'a'))!;
  assert.equal(a.title, 'Shopping');
  assert.equal(a.todo, 0);
  assert.equal(a.priority, 0);

  // A link is stored once, whichever way round it is given, and a manual link is never downgraded.
  await repo.upsertLink(db, 'b', 'a', 'manual', 1);
  await repo.upsertLink(db, 'a', 'b', 'auto', 0.2);
  assert.deepEqual(await repo.listLinks(db), [{ a_id: 'a', b_id: 'b', kind: 'manual', weight: 1 }]);
  await repo.upsertLink(db, 'a', 'c', 'auto', 0.3);
  await repo.upsertLink(db, 'c', 'a', 'auto', 0.6);
  assert.equal(await count('links'), 2);
  assert.equal((await repo.neighboursOf(db, 'a')).find((n) => n.id === 'c')!.weight, 0.6, 'the weight is updated in place');
  await repo.replaceAutoLinks(db, [{ a: 'b', b: 'c', score: 0.4 }]);
  assert.deepEqual((await repo.listLinks(db)).map((l) => `${l.a_id}${l.b_id}${l.kind}`).sort(), ['abmanual', 'bcauto'], 'rebuilding keeps manual links');

  await repo.addTag(db, 'a', 'Food');
  await repo.addTag(db, 'a', '#food');
  await repo.addTag(db, 'b', 'food');
  assert.equal(await count('tags'), 1, 'a tag exists once whatever its capitals');
  assert.equal(await count('thought_tags'), 2);

  await repo.setMeta(db, 'appearance', 'light');
  await repo.setMeta(db, 'appearance', 'black');
  assert.equal(await count('meta'), 1);
  assert.equal(await repo.getMeta(db, 'appearance'), 'black');

  await repo.setTodo(db, 'a', { remindAt: 5000, notifId: 'n1', repeat: 'weekly' });
  await repo.setTodo(db, 'b', { remindAt: null, notifId: null, repeat: 'daily' });
  await repo.setPriority(db, 'b', true);
  const open = await repo.listOpenTodos(db);
  assert.deepEqual(open.map((t) => t.id), ['a', 'b'], 'timed to-dos come first');
  assert.equal(open[0].repeat, 'weekly');
  assert.equal(open[1].repeat, null, 'a to-do with no time cannot repeat');
  assert.equal(open[1].priority, 1);
  await repo.setDone(db, 'a', true);
  assert.deepEqual((await repo.listOpenTodos(db)).map((t) => t.id), ['b']);
  assert.deepEqual((await repo.listDoneTodos(db)).map((t) => t.id), ['a']);

  const vec = new Float32Array([0.25, -1, 3.5, 1e-7]);
  assert.deepEqual([...repo.hexToVector(repo.vectorToHex(vec))], [...vec], 'a vector survives being stored as text');
  await repo.saveEmbedding(db, 'a', 'm', vec);
  await repo.saveEmbedding(db, 'a', 'm', new Float32Array([1, 2]));
  assert.deepEqual([...(await repo.loadEmbeddings(db, 'm')).get('a')!], [1, 2]);
  assert.deepEqual(await repo.idsWithoutEmbedding(db, 'm'), ['c', 'b']);

  // Deleting a thought removes everything that hung off it. Nothing in the database enforces this; repo.ts does.
  await repo.deleteThought(db, 'a');
  assert.deepEqual((await repo.listLinks(db)).map((l) => l.a_id + l.b_id), ['bc']);
  assert.equal(await count('thought_tags'), 1);
  assert.equal(await count('embeddings'), 0);
  assert.deepEqual(await found('rye'), []);
  await repo.deleteThought(db, 'b');
  assert.equal(await count('tags'), 0, 'a tag nobody uses is removed');
  await repo.wipeAll(db);
  assert.equal(await count('thoughts'), 0);
  assert.equal(await repo.getMeta(db, 'appearance'), 'black', 'settings survive deleting everything');

  // --- carrying thoughts over from the old database ---
  for (const upTo of [1, LEGACY_MIGRATIONS.length]) {
    const old = new DatabaseSync(':memory:');
    old.exec('PRAGMA foreign_keys = OFF');
    for (const sql of LEGACY_MIGRATIONS.slice(0, upTo)) old.exec(sql);
    const put = old.prepare(`INSERT INTO thoughts (id, kind, body, title, created_at, updated_at) VALUES (?, 'text', ?, ?, ?, ?)`);
    put.run('x', 'Sourdough starter', null, 10, 11);
    put.run('y', 'Hampi trip', 'Travel', 20, 21);
    old.exec(`INSERT INTO links (a_id, b_id, kind, weight) VALUES ('x', 'y', 'manual', 1)`);
    old.exec(`INSERT INTO tags (id, name) VALUES ('t', 'food'); INSERT INTO thought_tags VALUES ('x', 't')`);
    old.exec(`INSERT INTO meta (key, value) VALUES ('appearance', 'black')`);
    if (upTo > 1) old.exec(`UPDATE thoughts SET todo = 1, remind_at = 99 WHERE id = 'y'`);

    const fresh = nodeDb();
    await repo.prepare(fresh);
    const moved = await importLegacy(fresh, async (sql) => old.prepare(sql).all() as Record<string, unknown>[]);
    assert.equal(moved, 2, `both thoughts come across from a version ${upTo} database`);
    const y = (await repo.getThought(fresh, 'y'))!;
    assert.equal(y.title, 'Travel');
    assert.equal(y.created_at, 20, 'dates are kept');
    assert.equal(y.todo, upTo > 1 ? 1 : 0);
    assert.equal(y.remind_at, upTo > 1 ? 99 : null);
    assert.deepEqual(await repo.listLinks(fresh), [{ a_id: 'x', b_id: 'y', kind: 'manual', weight: 1 }]);
    assert.deepEqual(await repo.tagsOf(fresh, 'x'), [{ id: 't', name: 'food' }]);
    assert.equal(await repo.getMeta(fresh, 'appearance'), 'black');
    assert.deepEqual((await repo.searchThoughts(fresh, 'sourdough')).map((t) => t.id), ['x'], 'search works on what came across');
  }
}

// --- text helpers ---
assert.equal(firstUrl('see https://example.com/a?b=1, later'), 'https://example.com/a?b=1');
assert.equal(hostOf('https://www.Example.com/x'), 'example.com');
assert.equal(titleOf({ title: null, body: '', kind: 'voice', url: null }), 'Voice note');
assert.equal(ftsQuery('  "; DROP -- '), '"drop"*');
assert.equal(ftsQuery('!!!'), null);

// --- linker ---
assert.deepEqual(tokenize('The running shoes'), ['runn', 'shoe']);
const docs = [
  { id: '1', text: 'Sourdough: feed the starter at night, bake in the morning' },
  { id: '2', text: 'Sourdough crumb was too dense, try a longer proof' },
  { id: '3', text: 'Trip to Hampi in January, check the train' },
  { id: '4', text: 'Hampi: rent a scooter, sunrise at Matanga hill' },
  { id: '5', text: 'Quarterly tax filing is due', url: 'https://tax.example/file' },
  { id: '6', text: 'Read later', url: 'https://tax.example/guide' },
];
const hits = related(docs[0], docs).map((h) => h.id);
assert.deepEqual(hits, ['2'], `sourdough links to sourdough only, got ${hits}`);
assert.deepEqual(related(docs[2], docs).map((h) => h.id), ['4']);
assert.ok(related(docs[5], docs).some((h) => h.id === '5'), 'same website links two thoughts');
const all = relateAll(docs);
assert.ok(all.every((l) => l.a < l.b), 'pairs are ordered');
assert.equal(new Set(all.map((l) => `${l.a}-${l.b}`)).size, all.length, 'no duplicate pairs');
assert.ok(!all.some((l) => l.a === '1' && l.b === '3'), 'unrelated thoughts stay apart');

assert.deepEqual(surfaceTokens('Feeding starters')[1], { stem: 'starter', surface: 'starters' });
assert.equal(whyLinked(docs[0], docs[1]), 'Both mention sourdough');
assert.equal(whyLinked(docs[4], docs[5]), 'Both from tax.example');

// --- groups ---
const grouped = computeGroups(
  docs.map((d, i) => ({ id: d.id, text: d.text, created_at: i })),
  all.map((l) => ({ a: l.a, b: l.b, weight: l.score })),
);
const named = new Map(grouped.groups.map((g) => [g.name, g.members.slice().sort()]));
assert.deepEqual(named.get('Sourdough'), ['1', '2'], `groups: ${[...named.keys()]}`);
assert.deepEqual(named.get('Hampi'), ['3', '4']);
assert.equal(grouped.groupOf.get('1'), grouped.groupOf.get('2'));
assert.notEqual(grouped.groupOf.get('1'), grouped.groupOf.get('3'));
assert.equal(new Set(grouped.groups.map((g) => g.id)).size, grouped.groups.length, 'group ids are unique');
const again = computeGroups(
  docs.map((d, i) => ({ id: d.id, text: d.text, created_at: i })).reverse(),
  all.map((l) => ({ a: l.a, b: l.b, weight: l.score })).reverse(),
);
assert.deepEqual(again.groups.map((g) => g.id), grouped.groups.map((g) => g.id), 'grouping does not depend on input order');
assert.deepEqual(computeGroups([{ id: 'x', text: 'alone', created_at: 1 }], []).loose, ['x']);

// --- dates and highlights ---
const noon = new Date(2026, 10, 16, 12).getTime();
assert.equal(dayLabel(noon - 3_600_000, noon), 'Today');
assert.equal(dayLabel(noon - 20 * 3_600_000, noon), 'Yesterday');
assert.equal(daysAgo(noon - 13 * 3_600_000, noon), 1, 'late last night counts as yesterday');
assert.deepEqual(highlightRuns('Sourdough crumb', 'sour'), [{ text: 'Sour', hit: true }, { text: 'dough crumb', hit: false }]);
assert.deepEqual(highlightRuns('a (b', '('), [{ text: 'a (b', hit: false }]);

// --- linking by meaning ---
{
  const unit = (v: number[]) => {
    const norm = Math.hypot(...v);
    return new Float32Array(v.map((x) => x / norm));
  };
  const car = { id: 'car', text: 'The car is due for an oil change', vec: unit([1, 0.1, 0]) };
  const garage = { id: 'garage', text: 'Book the vehicle in for maintenance', vec: unit([0.9, 0.3, 0]) };
  const bread = { id: 'bread', text: 'Feed the sourdough starter', vec: unit([0, 0.1, 1]) };
  assert.deepEqual(related({ ...car, vec: undefined }, [{ ...garage, vec: undefined }, bread]), [], 'no shared words, no link');
  assert.deepEqual(related(car, [garage, bread]).map((h) => h.id), ['garage'], 'close meaning links them');
  assert.ok(meaningSimilarity(car.vec, bread.vec) < 0.2);
  assert.equal(meaningSimilarity(car.vec, new Float32Array(2)), 0, 'vectors of different sizes never match');
  assert.equal(whyLinked(car, garage), 'Similar meaning');

  // Real sentence vectors are all somewhat alike. Thirty thoughts in three topics, where even
  // unrelated ones score about 0.4, must still come out as three groups and not one.
  const topics = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const crowd = Array.from({ length: 30 }, (_, i) => {
    const t = topics[i % 3];
    const wobble = [Math.sin(i * 1.7) * 0.25, Math.cos(i * 2.3) * 0.25, Math.sin(i * 0.9) * 0.25];
    // A large shared component makes every pair similar, as the model does.
    return { id: `c${String(i).padStart(2, '0')}`, text: `note number ${i} zq${i}`, vec: unit([t[0] + wobble[0] + 0.9, t[1] + wobble[1] + 0.9, t[2] + wobble[2] + 0.9]) };
  });
  assert.ok(meaningSimilarity(crowd[0].vec, crowd[1].vec) > 0.5, 'the fixture really is crowded');
  const crowdLinks = relateAll(crowd);
  const topicOf = (id: string) => Number(id.slice(1)) % 3;
  const wrong = crowdLinks.filter((l) => topicOf(l.a) !== topicOf(l.b)).length;
  assert.ok(crowdLinks.length >= 20, `expected a connected crowd, got ${crowdLinks.length} links`);
  assert.ok(wrong <= crowdLinks.length * 0.1, `${wrong} of ${crowdLinks.length} links cross topics`);
  const crowdGroups = computeGroups(
    crowd.map((d, i) => ({ id: d.id, text: d.text, created_at: i })),
    crowdLinks.map((l) => ({ a: l.a, b: l.b, weight: l.score })),
  );
  assert.ok(crowdGroups.groups.length >= 3, `one blob would be wrong; got ${crowdGroups.groups.length} groups`);
  assert.ok(Math.max(...crowdGroups.groups.map((x) => x.members.length)) <= 14, 'no group swallows the rest');
  const one = related(crowd[0], crowd).map((h) => h.id);
  assert.ok(one.length > 0 && one.every((id) => topicOf(id) === 0), `a single thought links within its topic: ${one}`);
  const g = computeGroups(
    [car, garage, bread].map((d, i) => ({ id: d.id, text: d.text, created_at: i })),
    relateAll([car, garage, bread]).map((l) => ({ a: l.a, b: l.b, weight: l.score })),
  );
  assert.equal(g.groupOf.get('car'), g.groupOf.get('garage'), 'and they share a group');
  assert.deepEqual(g.loose, ['bread']);
}

// --- due times and sizes ---
assert.equal(dueLabel(noon + 30 * 60_000, noon), 'In 30 min');
assert.equal(dueLabel(noon + 5 * 3_600_000, noon), 'Today, 5:00 pm');
assert.equal(dueLabel(noon + 21 * 3_600_000, noon), 'Tomorrow, 9:00 am');
assert.equal(dueLabel(noon - 3_600_000, noon), 'Overdue since 11:00 am');
assert.equal(dueLabel(noon - 30 * 3_600_000, noon), 'Overdue since yesterday');
assert.equal(fileSize(1536), '2 KB');
assert.equal(fileSize(5 * 1024 * 1024), '5.0 MB');

// --- formatted notes ---
assert.equal(htmlToText('<html><h2>Plan</h2><ul><li>Buy <b>rye</b> &amp; salt</li><li>Bake</li></ul><p>Done</p></html>'), 'Plan\nBuy rye & salt\nBake\nDone');
assert.equal(isFormatted('<html><p>plain words</p><br></html>'), false, 'paragraphs alone are not formatting');
assert.equal(isFormatted('<html><p>some <b>bold</b></p></html>'), true);
assert.equal(htmlToText(textToHtml('one <two>\n\nthree & four')), 'one <two>\n\nthree & four', 'plain words survive a round trip');

// --- repeating reminders and the parts of the to-do list ---
const nineAm = new Date(2026, 0, 31, 9, 0).getTime();
assert.equal(nextRepeat(nineAm, 'daily', nineAm + 1), new Date(2026, 1, 1, 9, 0).getTime());
assert.equal(nextRepeat(nineAm, 'weekly', nineAm + 15 * 86_400_000), new Date(2026, 1, 21, 9, 0).getTime(), 'skips occurrences already missed');
assert.equal(nextRepeat(nineAm, 'monthly', nineAm + 1), new Date(2026, 1, 28, 9, 0).getTime(), 'the 31st falls back to a short month\'s last day');
assert.equal(dueBucket(null, noon), 'No date');
assert.equal(dueBucket(noon - 1, noon), 'Overdue');
assert.equal(dueBucket(noon + 3_600_000, noon), 'Today');
assert.equal(dueBucket(noon + 24 * 3_600_000, noon), 'Tomorrow');
assert.equal(dueBucket(noon + 3 * 86_400_000, noon), 'This week');
assert.equal(dueBucket(noon + 30 * 86_400_000, noon), 'Later');

databaseChecks()
  .then(() => console.log(`ok: database, old-database import, search, text helpers, formatted notes, linker, meaning, groups and reminders (${all.length} links in fixture)`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
