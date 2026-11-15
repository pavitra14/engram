/**
 * Logic checks that run in plain Node (no device needed):
 *  - every migration applies cleanly and full-text search works
 *  - the auto-linker groups related thoughts and keeps unrelated ones apart
 * Run with: npm run check
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS } from '../src/db/schema';
import { computeGroups } from '../src/lib/groups';
import { related, relateAll, surfaceTokens, tokenize, whyLinked } from '../src/lib/linker';
import { dayLabel, daysAgo, firstUrl, ftsQuery, highlightRuns, hostOf, titleOf } from '../src/lib/text';

// --- database ---
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for (const sql of MIGRATIONS) db.exec(sql);

const ins = db.prepare(
  `INSERT INTO thoughts (id, kind, body, title, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)`,
);
ins.run('a', 'text', 'Sourdough starter needs feeding tonight', null);
ins.run('b', 'text', 'Train tickets for the Hampi trip', null);
ins.run('c', 'voice', '', null);

const match = (q: string) =>
  db
    .prepare(`SELECT t.id FROM thoughts_fts f JOIN thoughts t ON t.pk = f.rowid WHERE thoughts_fts MATCH ?`)
    .all(ftsQuery(q) as string)
    .map((r: unknown) => (r as { id: string }).id);

assert.deepEqual(match('sourd'), ['a'], 'prefix search finds the thought');
assert.deepEqual(match('hampi trip'), ['b']);
db.prepare(`UPDATE thoughts SET body = ? WHERE id = ?`).run('Rye flour shopping', 'a');
assert.deepEqual(match('sourdough'), [], 'index follows edits');
assert.deepEqual(match('rye'), ['a']);

db.prepare(`INSERT INTO links (a_id, b_id, kind, weight) VALUES ('a', 'b', 'auto', 0.5)`).run();
assert.throws(() => db.prepare(`INSERT INTO links (a_id, b_id, kind, weight) VALUES ('b', 'a', 'auto', 0.5)`).run(), 'links are stored one way round');
db.prepare(`DELETE FROM thoughts WHERE id = 'b'`).run();
assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM links`).get() as { n: number }).n, 0, 'deleting a thought removes its links');
assert.deepEqual(match('hampi'), [], 'deleted thoughts leave the index');

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

console.log(`ok: ${MIGRATIONS.length} migration(s), search, text helpers, linker and groups (${all.length} links in fixture)`);
