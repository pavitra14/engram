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
import { type OpResult, type Remote, type RemoteRow, syncOnce } from '../src/cloud/sync';
import { askPrompt, citedNumbers, cleanAnswer, questionTerms } from '../src/lib/ask.logic';
import { makeBackup, mediaKey, mediaKeys, parseBackup, restoreBackup } from '../src/lib/backup.logic';
import { splitQuick } from '../src/lib/capture.logic';
import { questionFor, streak, weekOf } from '../src/lib/habits';
import { checkItems, progress, toggleCheck } from '../src/lib/checks';
import { computeGroups } from '../src/lib/groups';
import { fileNames, htmlToMarkdown, markdownToHtml, noteToMarkdown, parseKeep, parseTextFile } from '../src/lib/markdown';
import { dueIn, matchProjects, orphaned } from '../src/lib/projects';
import { DECISION_STEP, decisionRecall, dueRecalls, firstRecall, habitDoneToday, habitStreak, milestone, monthRecap, nextRecall, onThisDay, surprise, toggleHabit } from '../src/lib/recall';
import { runSummary, translateArgs } from '../src/lib/translate';
import { parseWhen } from '../src/lib/when';
import { activeBucket, ageBucket, buildMessage, CAP, daysActiveIn, describe, localDay, notesBucket, plan, rememberDay } from '../src/lib/usage.logic';
import { meaningSimilarity, nearMisses, related, relateAll, surfaceTokens, tokenize, whyLinked } from '../src/lib/linker';
import { dayLabel, daysAgo, dueBucket, dueLabel, fileSize, firstUrl, ftsQuery, highlightRuns, hostOf, htmlToText, isFormatted, looksEnglish, nearDuplicate, nextRepeat, peopleIn, renameWikiLink, textToHtml, titleOf, wikiLinks } from '../src/lib/text';

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
  // An English version sits beside the original, is searchable, and goes when the note goes.
  await repo.insertThought(db, { id: 'hi', kind: 'text', title: 'आज बाज़ार जाना है', body: '' });
  await repo.saveTranslation(db, 'hi', 'hi', 'Have to go to the market today', null);
  assert.deepEqual(await found('market'), ['hi'], 'the English words find the note');
  assert.equal((await repo.getThought(db, 'hi'))!.en_title, 'Have to go to the market today');
  assert.equal((await repo.listThoughts(db)).find((t) => t.id === 'hi')!.en_lang, 'hi');
  await repo.saveTranslation(db, 'b', 'en', null, null);
  assert.equal((await repo.getThought(db, 'b'))!.en_lang, null, 'a note already in English shows no translation');
  assert.deepEqual(await repo.idsWithoutTranslation(db), ['c']);
  await repo.deleteThought(db, 'hi');
  assert.equal(await count('translations'), 1);

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

// --- Engram Cloud: two phones and a stand-in server ---
// The stand-in follows the same rules as supabase/migrations/0001 (which is checked
// separately against the real database): revisions, conflicts, tombstones, receipts.
function fakeCloud() {
  let seq = 0;
  const rows = new Map<string, RemoteRow & { revision?: number }>();
  const receipts = new Map<string, { results: OpResult[] }>();
  let dropNextReply = false;
  const remote: Remote = {
    apply: async (batchId, ops) => {
      let answer = receipts.get(batchId);
      if (!answer) {
        const results: OpResult[] = [];
        for (const op of ops) {
          const key = `${op.t}/${op.id}`;
          const had = rows.get(key);
          if (op.t !== 'thoughts') {
            if (op.del) {
              if (had && !had.deleted) rows.set(key, { ...had, deleted: true, seq: ++seq });
            } else rows.set(key, { ...(op.row ?? {}), t: op.t, id: op.id, deleted: false, seq: ++seq });
            results.push({ t: op.t, id: op.id, s: 'ok' });
          } else if (op.del) {
            if (had && !had.deleted) rows.set(key, { t: 'thoughts', id: op.id, deleted: true, body: '', title: null, seq: ++seq, revision: (had.revision ?? 0) + 1 });
            results.push({ t: op.t, id: op.id, s: 'ok' });
          } else if (!had) {
            rows.set(key, { ...(op.row ?? {}), t: 'thoughts', id: op.id, deleted: false, seq: ++seq, revision: 1 });
            results.push({ t: op.t, id: op.id, s: 'ok', rev: 1 });
          } else if (had.deleted) {
            results.push({ t: op.t, id: op.id, s: 'gone' });
          } else if ((op.base ?? null) !== had.revision && [had.title ?? '', had.body ?? '', had.body_html ?? ''].join('\u0000') !== [op.row?.title ?? '', op.row?.body ?? '', op.row?.body_html ?? ''].join('\u0000')) {
            results.push({ t: op.t, id: op.id, s: 'conflict', rev: had.revision });
          } else {
            const revision = (had.revision ?? 0) + 1;
            rows.set(key, { ...(op.row ?? {}), t: 'thoughts', id: op.id, deleted: false, seq: ++seq, revision });
            results.push({ t: op.t, id: op.id, s: 'ok', rev: revision });
          }
        }
        answer = { results };
        receipts.set(batchId, answer);
      }
      if (dropNextReply) {
        dropNextReply = false;
        throw new Error('the reply was lost');
      }
      return answer;
    },
    pull: async (after) => {
      const page = [...rows.values()].filter((r) => r.seq > after).sort((x, y) => x.seq - y.seq).slice(0, 3);
      return { rows: page, cursor: page.length ? page[page.length - 1].seq : after, more: page.length >= 3 };
    },
    thought: async (id) => rows.get(`thoughts/${id}`) ?? null,
  };
  return { remote, rows, loseNextReply: () => (dropNextReply = true) };
}

async function cloudChecks(): Promise<void> {
  const cloud = fakeCloud();
  let n = 0;
  const id = () => `batch-${++n}`;
  // Each "phone" is its own database. repo's tracking switch is shared, as there is one phone per process in real life.
  const a = nodeDb();
  const b = nodeDb();
  await repo.prepare(a);
  await repo.prepare(b);
  const titles = async (db: Db) => (await repo.listThoughts(db)).map((t) => t.title ?? t.body).sort();

  // Before sync is on, nothing is recorded for sending.
  repo.setTracking(false);
  await repo.insertThought(a, { id: 'old', kind: 'text', title: 'Written before signing in', body: '' });
  assert.equal(await repo.outboxCount(a), 0, 'nothing is queued while signed out');

  // Signing in queues what is already on the phone.
  repo.setTracking(true);
  await repo.markEverything(a);
  await repo.insertThought(a, { id: 'n1', kind: 'text', title: 'Sourdough', body: 'feed the starter' });
  await repo.addTag(a, 'n1', 'food');
  await repo.upsertLink(a, 'n1', 'old', 'manual', 1);
  await repo.upsertLink(a, 'n1', 'old2', 'auto', 0.4);
  let done = await syncOnce(a, cloud.remote, id);
  assert.equal(done.sent, 5, 'two thoughts, a tag, its assignment and the hand-made link are sent; the automatic link is not');
  assert.equal(await repo.outboxCount(a), 0);
  assert.equal(await repo.getRev(a, 'n1'), 1);

  // The second phone receives them, across several pages.
  done = await syncOnce(b, cloud.remote, id);
  assert.deepEqual(await titles(b), ['Sourdough', 'Written before signing in']);
  assert.deepEqual((await repo.tagsOf(b, 'n1')).map((t) => t.name), ['food']);
  assert.deepEqual((await repo.listLinks(b)).map((l) => l.kind), ['manual']);
  assert.deepEqual((await repo.searchThoughts(b, 'starter')).map((t) => t.id), ['n1'], 'what arrives is searchable');
  assert.equal(await repo.outboxCount(b), 0, 'receiving queues nothing to send back');
  assert.ok(done.touched.includes('n1'));

  // A to-do set on one phone reaches the other. Alarm ids and file paths never leave.
  await repo.setTodo(b, 'n1', { remindAt: 5000, notifId: 'alarm-on-b', repeat: 'weekly' });
  await syncOnce(b, cloud.remote, id);
  assert.equal(cloud.rows.get('thoughts/n1')!.notif_id, undefined, 'the alarm id is not sent');
  assert.equal('media_path' in cloud.rows.get('thoughts/n1')!, false, 'the file path is not sent');
  await syncOnce(a, cloud.remote, id);
  const onA = (await repo.getThought(a, 'n1'))!;
  assert.equal(onA.todo, 1);
  assert.equal(onA.remind_at, 5000);
  assert.equal(onA.repeat, 'weekly');

  // A lost reply: the same batch goes again and is applied once.
  await repo.updateThought(a, 'old', { title: 'Renamed', body: '', body_html: null });
  cloud.loseNextReply();
  await assert.rejects(syncOnce(a, cloud.remote, id));
  assert.equal(await repo.outboxCount(a), 1, 'a change stays queued until the server has answered');
  await syncOnce(a, cloud.remote, id);
  assert.equal(cloud.rows.get('thoughts/old')!.revision, 2, 'applied once, not twice');
  assert.equal(await repo.outboxCount(a), 0);

  // The same note edited on both phones: neither set of words is lost.
  await syncOnce(b, cloud.remote, id);
  await repo.updateThought(a, 'n1', { title: 'Sourdough', body: 'A says: feed it at night', body_html: null });
  await repo.updateThought(b, 'n1', { title: 'Sourdough', body: 'B says: feed it in the morning', body_html: null });
  await syncOnce(a, cloud.remote, id);
  done = await syncOnce(b, cloud.remote, id);
  assert.equal(done.copies, 1, 'the second phone is told its words were kept as a copy');
  assert.equal((await repo.getThought(b, 'n1'))!.body, 'A says: feed it at night', 'the original takes the first words to arrive');
  const kept = (await repo.listThoughts(b)).find((t) => t.body === 'B says: feed it in the morning' && /from this phone/.test(t.title ?? ''));
  assert.ok(kept);
  assert.equal(kept.todo, 1, 'the copy keeps its to-do');
  assert.equal(kept.repeat, 'weekly', 'and its repeat');
  assert.ok(done.touched.includes(kept.id), 'the copy is handed to the alarms');
  await syncOnce(a, cloud.remote, id);
  assert.ok((await repo.listThoughts(a)).some((t) => t.body === 'B says: feed it in the morning'), 'the copy reaches the first phone too');
  assert.deepEqual(await titles(a), await titles(b), 'both phones end up the same');

  // Deleted on one phone, edited on the other: the deletion stands and the edit survives as a new note.
  await repo.deleteThought(a, 'old');
  await repo.updateThought(b, 'old', { title: 'Renamed', body: 'a late thought', body_html: null });
  await syncOnce(a, cloud.remote, id);
  done = await syncOnce(b, cloud.remote, id);
  assert.equal(await repo.getThought(b, 'old'), null);
  assert.ok((await repo.listThoughts(b)).some((t) => t.body === 'a late thought' && /deleted on another device/.test(t.title ?? '')));
  await syncOnce(a, cloud.remote, id);
  assert.deepEqual(await titles(a), await titles(b));
  assert.equal(cloud.rows.get('thoughts/old')!.body, '', 'the cloud keeps no words of a deleted note');

  // Removing a tag and a hand-made link travels too.
  const tag = (await repo.tagsOf(a, 'n1'))[0];
  await repo.removeTag(a, 'n1', tag.id);
  await syncOnce(a, cloud.remote, id);
  await syncOnce(b, cloud.remote, id);
  assert.deepEqual(await repo.tagsOf(b, 'n1'), []);
  repo.setTracking(false);
}

// --- streaks, the week, and the daily question ---
{
  const at = (daysBack: number, hour = 12) => new Date(2026, 10, 16 - daysBack, hour).getTime();
  const nowH = at(0, 18);
  assert.equal(streak([], nowH), 0);
  assert.equal(streak([{ created_at: at(0) }, { created_at: at(1) }, { created_at: at(2) }, { created_at: at(4) }], nowH), 3);
  assert.equal(streak([{ created_at: at(1) }, { created_at: at(2) }], nowH), 2, 'not having written yet today keeps yesterday\'s streak');
  assert.equal(streak([{ created_at: at(2) }], nowH), 0, 'a missed day ends it');
  const w = weekOf(
    [
      { created_at: at(0) },
      { created_at: at(0) },
      { created_at: at(6) },
      { created_at: at(9), todo: 1, done_at: at(1) },
      { created_at: at(9), todo: 1, done_at: null, remind_at: at(2) },
      { created_at: at(30), todo: 1, done_at: null, remind_at: null },
    ],
    nowH,
  );
  assert.deepEqual([w.captured, w.done, w.open, w.overdue], [3, 1, 2, 1]);
  assert.deepEqual(w.perDay, [1, 0, 0, 0, 0, 0, 2]);
  assert.equal(questionFor(nowH), questionFor(at(0, 1)), 'one question for the whole day');
  assert.notEqual(questionFor(nowH), questionFor(at(1)));
}

// --- a quick line is a title ---
assert.deepEqual(splitQuick('  Call the bank  '), { title: 'Call the bank', body: '' });
assert.deepEqual(splitQuick('Trip ideas\n\nHampi in January\nBook the train'), { title: 'Trip ideas', body: 'Hampi in January\nBook the train' });
assert.deepEqual(splitQuick('x'.repeat(200)), { title: null, body: 'x'.repeat(200) }, 'a very long line is body text, not a title');

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


// --- reminders in plain words ---
// `noon` is Monday 16 November 2026, 12:00.
const at = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo, d, h, mi).getTime();
const whenIs = (text: string) => parseWhen(text, noon)?.at ?? null;
assert.equal(whenIs('Call the bank Friday 10am'), at(2026, 10, 20, 10));
assert.equal(whenIs('renew passport in 2 weeks'), at(2026, 10, 30));
assert.equal(whenIs('Dentist tomorrow'), at(2026, 10, 17));
assert.equal(whenIs('dinner with Meera tonight'), at(2026, 10, 16, 20));
assert.equal(whenIs('dinner tonight at 8'), at(2026, 10, 16, 20));
assert.equal(whenIs('stand-up today 5pm'), at(2026, 10, 16, 17));
assert.equal(whenIs('stand-up today 9am'), null, 'a time already gone today sets nothing');
assert.equal(whenIs('today was a good day'), null, '"today" alone says nothing about when');
assert.equal(whenIs('take the bread out in 20 minutes'), noon + 20 * 60_000);
assert.equal(whenIs('check the oven in an hour'), noon + 3_600_000);
assert.equal(whenIs('plan the trip next week'), at(2026, 10, 23));
assert.equal(whenIs('review budget next Friday'), at(2026, 10, 27), '"next Friday" is the one in the week after this');
assert.equal(whenIs('gym on Monday 6:30 pm'), at(2026, 10, 16, 18, 30), 'today, when the day named is today and the time is still ahead');
assert.equal(whenIs('gym on Monday'), at(2026, 10, 23), 'with no time, a weekday named on that weekday means the next one');
assert.equal(whenIs('market on Sat'), at(2026, 10, 21));
assert.equal(whenIs('pay rent 3 Dec'), at(2026, 11, 3));
assert.equal(whenIs('birthday Dec 3 at 18:30'), at(2026, 11, 3, 18, 30));
assert.equal(whenIs('file taxes 3 Jan'), at(2027, 0, 3), 'a date already past this year means next year');
assert.equal(whenIs('report due on the 20th'), at(2026, 10, 20));
assert.equal(whenIs('call mum at 6'), at(2026, 10, 16, 18), '"at 6" with no am or pm is the next six on the clock in waking hours');
assert.equal(whenIs('take pill 7am'), at(2026, 10, 17, 7), 'a clock time already past is tomorrow');
assert.equal(whenIs('Sourdough crumb was too dense'), null);
assert.equal(whenIs('The 3 body problem'), null);
assert.equal(whenIs('I may go for a run'), null, 'the word may is not the month');
assert.equal(whenIs('Sat on the bench and thought, the sun was out'), null, '"Sat" and "sun" are words, not days, unless they follow on, next or this');
assert.equal(whenIs('https://example.com/friday-10am'), null, 'web addresses are never read for dates');
assert.equal(parseWhen('Call the bank Friday 10am', noon)?.phrase, 'Friday 10am');

// --- check boxes inside notes ---
const boxes = '<html><h2>Before we go</h2><ul data-type="checkbox"><li checked>Book <b>train</b></li><li>Rent a scooter</li><li></li></ul><ul><li>not a box</li></ul><ul data-type="checkbox"><li>Offline maps</li></ul></html>';
assert.deepEqual(checkItems(boxes), [
  { index: 0, text: 'Book train', done: true },
  { index: 1, text: 'Rent a scooter', done: false },
  { index: 3, text: 'Offline maps', done: false },
]);
const ticked = toggleCheck(boxes, 1, true);
assert.equal(ticked, boxes.replace('<li>Rent a scooter</li>', '<li checked>Rent a scooter</li>'), 'only that box changes');
assert.equal(toggleCheck(ticked, 1, false), boxes, 'ticking and unticking gives the note back unchanged');
assert.equal(toggleCheck(boxes, 0, false), boxes.replace('<li checked>', '<li>'));
assert.equal(toggleCheck(boxes, 3, true).endsWith('<li checked>Offline maps</li></ul></html>'), true);
assert.deepEqual(progress([boxes, null, '<html><p>none</p></html>']), { done: 1, total: 3, next: 'Rent a scooter' });
assert.deepEqual(checkItems('<html><ul><li checked>plain list</li></ul></html>'), [], 'an ordinary list is not check boxes');

// --- remember this, on this day, surprise, milestones, the month ---
const first = firstRecall(noon);
assert.deepEqual(first, { step: 0, at: at(2026, 10, 17) });
assert.deepEqual(nextRecall(0, noon), { step: 1, at: at(2026, 10, 19) });
assert.deepEqual(nextRecall(3, noon), { step: 4, at: at(2027, 0, 15) });
assert.equal(nextRecall(4, noon), null, 'after the fifth showing it stops');
assert.equal(nextRecall(DECISION_STEP, noon), null, 'a decision comes back once');
assert.equal(decisionRecall(noon).at, at(2027, 1, 14));
assert.deepEqual(dueRecalls([{ id: 'x', recall_step: 0, recall_at: noon - 5 }, { id: 'y', recall_step: 1, recall_at: noon + 5 }, { id: 'z', recall_step: null, recall_at: null }, { id: 'w', recall_step: 2, recall_at: noon - 50 }], noon).map((t) => t.id), ['w', 'x']);
const past = [{ id: 'm1', created_at: at(2026, 9, 16, 8) }, { id: 'y1', created_at: at(2025, 10, 16, 23) }, { id: 'no', created_at: at(2026, 9, 15) }];
assert.equal(onThisDay(past, noon)?.thought.id, 'y1', 'the furthest back wins');
assert.equal(onThisDay(past.slice(0, 1), noon)?.ago, 'A month ago today');
assert.equal(onThisDay(past.slice(2), noon), null);
assert.equal(onThisDay([{ id: 'x', created_at: at(2026, 2, 1) }], at(2026, 2, 31, 12)), null, 'the 31st has no match in a shorter month');
assert.equal(surprise(past, 0.99, noon)?.id, 'no');
assert.equal(surprise([], 0.5, noon), null);
assert.equal(milestone(100, 3, [])?.key, 'notes-100');
assert.equal(milestone(100, 3, ['notes-10', 'notes-50', 'notes-100']), null, 'each milestone shows once');
assert.equal(milestone(12, 7, ['notes-10'])?.text, '7 days in a row.');
const month = monthRecap(
  [
    { id: 'a', created_at: at(2026, 10, 2), updated_at: at(2026, 10, 2) },
    { id: 'b', created_at: at(2026, 10, 3) },
    { id: 'c', created_at: at(2026, 10, 3, 15), todo: 1, done_at: at(2026, 10, 5) },
    { id: 'd', created_at: at(2026, 10, 4) },
    { id: 'e', created_at: at(2026, 9, 30), todo: 1, done_at: at(2026, 10, 1) },
  ],
  (id) => (id === 'a' ? null : 'Sourdough'),
  noon,
);
assert.equal(month.notes, 4);
assert.equal(month.done, 2);
assert.equal(month.days, 3);
assert.deepEqual(month.busiest, { day: at(2026, 10, 3, 0), count: 2 });
assert.equal(month.longestStreak, 3);
assert.deepEqual(month.topGroup, { name: 'Sourdough', count: 3 });
assert.equal(month.forgotten, 'a');
assert.equal(monthRecap([], () => null, noon, -1).label.includes('October'), true);
let habit = { id: 'h', name: 'Read', days: [] as number[] };
assert.equal(habitDoneToday(habit, noon), false);
habit = toggleHabit(habit, noon - 86_400_000);
habit = toggleHabit(habit, noon);
assert.equal(habitStreak(habit, noon), 2);
assert.equal(habitStreak(toggleHabit(habit, noon), noon), 1, 'unticking today keeps the streak that ran through yesterday');
assert.equal(habitStreak(habit, noon + 3 * 86_400_000), 0);

// --- names and projects follow a group's members ---
const g = (id: string, members: string[]) => ({ id, name: id, members, tone: 0, near: [], newest: 0 });
const proj = (id: string, members: string[]) => ({ id, name: `P${id}`, goal: null, due_at: null, members, notif_id: null });
const carried = matchProjects([g('g1', ['a', 'b', 'c', 'x']), g('g2', ['d', 'e'])], [proj('1', ['a', 'b', 'c']), proj('2', ['d', 'e', 'f', 'q']), proj('3', ['a', 'b'])]);
assert.equal(carried.get('g1')?.id, '1', 'the name stays when new thoughts join, and the larger overlap wins a group');
assert.equal(carried.has('g2'), false, 'half the members is not "most of them"');
assert.deepEqual(orphaned([g('g1', ['a', 'b', 'c'])], [proj('1', ['a', 'b', 'c']), proj('9', ['zz'])]).map((p) => p.id), ['9']);
assert.equal(matchProjects([g('gA', ['a', 'b']), g('gB', ['c'])], [proj('1', ['a', 'b', 'c'])]).get('gA')?.id, '1', 'after a split the name follows the larger part');
assert.equal(dueIn(noon + 5 * 86_400_000, noon), 'Due in 5 days');
assert.equal(dueIn(noon - 86_400_000, noon), 'A day past its date');

// --- Markdown out and in, Google Keep in ---
const md = htmlToMarkdown('<html><h2>Plan</h2><p>Some <b>bold</b> and <i>slanted</i> &amp; more</p><ul data-type="checkbox"><li checked>One</li><li>Two</li></ul><ol><li>First</li><li>Second</li></ol><blockquote>Said</blockquote></html>');
assert.equal(md, '## Plan\n\nSome **bold** and *slanted* & more\n\n- [x] One\n- [ ] Two\n\n1. First\n2. Second\n\n> Said');
assert.equal(htmlToMarkdown(markdownToHtml(md)), md, 'Markdown survives a round trip through the editor format');
const file = noteToMarkdown({ title: 'Hampi trip', body: 'plain', body_html: null, url: null, created_at: Date.UTC(2026, 0, 2), tags: ['travel', '@meera'], links: ['Pack list'] });
assert.equal(file, '---\ncreated: 2026-01-02T00:00:00.000Z\ntags: [travel, @meera]\n---\n\n# Hampi trip\n\nplain\n\n## Linked\n\n- [[Pack list]]\n');
const back = parseTextFile('Hampi trip.md', file);
assert.deepEqual(back, { title: 'Hampi trip', body: 'plain', html: null, tags: ['travel', '@meera'], created_at: Date.UTC(2026, 0, 2) });
assert.equal(parseTextFile('notes/Shopping.txt', 'milk\neggs')?.title, 'Shopping');
assert.equal(parseTextFile('a.md', '# Title\n\n- [ ] one\n- [x] two')?.html, '<html><ul data-type="checkbox"><li>one</li><li checked>two</li></ul></html>');
assert.equal(parseTextFile('.md', '   '), null);
assert.deepEqual(fileNames(['A/B', 'a b', '', 'A:B']), ['A B', 'a b 2', 'Untitled', 'A B 3']);
const keep = parseKeep(JSON.stringify({ title: 'Shop', listContent: [{ text: 'Milk', isChecked: true }, { text: 'Eggs <6>', isChecked: false }], labels: [{ name: 'home' }], createdTimestampUsec: 1700000000000000 }));
assert.deepEqual(keep, { title: 'Shop', body: 'Milk\nEggs <6>', html: '<html><ul data-type="checkbox"><li checked>Milk</li><li>Eggs &lt;6&gt;</li></ul></html>', tags: ['home'], created_at: 1700000000000 });
assert.equal(parseKeep(JSON.stringify({ title: 'x', textContent: 'y', isTrashed: true })), null, "notes in Keep's bin are left behind");
assert.equal(parseKeep('{"app":"engram"}'), null);
assert.equal(parseKeep('not json'), null);

// --- [[links]], @people, English or not, near-duplicates ---
assert.deepEqual(wikiLinks('See [[Pack list]] and [[Hampi trip|the trip]], again [[Pack list]]. Not [[]] or [[a\nb]].'), ['Pack list', 'Hampi trip']);
assert.equal(renameWikiLink('See [[pack list]] and [[Pack list|mine]]', 'Pack list', 'Packing'), 'See [[Packing]] and [[Packing|mine]]');
assert.deepEqual(peopleIn('Ask @Meera and (@sam_k), not me@example.com or @ alone'), ['@meera', '@sam_k']);
assert.equal(looksEnglish('Call the bank about the new card'), true);
assert.equal(looksEnglish('Milk'), true, 'a word or two is taken as English');
assert.equal(looksEnglish('कल बैंक जाना है'), false);
assert.equal(looksEnglish('Acheter du pain et des œufs pour demain matin'), false);
assert.equal(looksEnglish('Comprar pan y huevos para manana temprano'), false, 'Latin letters with no common English word are sent to the translator');
assert.equal(looksEnglish('https://example.com 42'), true);
assert.equal(nearDuplicate('Sourdough crumb was too dense, try a longer proof', [{ id: 'a', text: 'Hampi trip' }, { id: 'b', text: 'sourdough crumb too dense: try longer proof' }])?.id, 'b');
assert.equal(nearDuplicate('Sourdough crumb was too dense', [{ id: 'b', text: 'Sourdough starter needs feeding tonight' }]), null);
assert.equal(nearDuplicate('Milk', [{ id: 'b', text: 'Milk' }]), null, 'too short to call a repeat');

// --- link suggestions ---
const linkedNow = new Set(all.map((l) => `${l.a}:${l.b}`));
const maybe = nearMisses(docs, linkedNow);
assert.ok(maybe.every((m) => !linkedNow.has(`${m.a}:${m.b}`) && m.a < m.b), 'suggestions never repeat a link that exists');
if (maybe.length > 0) assert.equal(nearMisses(docs, new Set([...linkedNow, `${maybe[0].a}:${maybe[0].b}`])).some((m) => m.a === maybe[0].a && m.b === maybe[0].b), false, 'a dismissed pair is not suggested again');

// --- ask your notes: the plain parts ---
assert.deepEqual(questionTerms('What did I decide about the Hampi trip?'), ['decide', 'hampi', 'trip']);
assert.deepEqual(questionTerms('the of and'), []);
assert.equal(askPrompt(' When is it? ', [{ id: 'a', title: 'Trip', text: 'January', when: '2 days ago' }]), 'Notes:\n\n[1] Trip (2 days ago)\nJanuary\n\nQuestion: When is it?');
assert.equal(cleanAnswer('<think>hmm</think> January [1]<|im_end|>'), 'January [1]');
assert.equal(cleanAnswer('<think>still thinking'), '', 'an unfinished thought is not shown');
assert.deepEqual(citedNumbers('January [2], by train [1] [2] [9]', 3), [2, 1]);

async function localChecks(): Promise<void> {
  const db = nodeDb();
  await repo.prepare(db);
  const a = await repo.insertThought(db, { id: 'a', kind: 'text', title: 'Pack list', body: 'power bank, hat', created_at: 1 });
  await repo.insertThought(db, { id: 'b', kind: 'image', body: '', media_path: 'file:///x.png', created_at: 2 });
  await repo.insertThought(db, { id: 'c', kind: 'text', title: 'Trip', body: 'see [[Pack list]]', created_at: 3 });
  await repo.upsertLink(db, 'a', 'c', 'auto', 0.5);

  // Words read from a picture are searchable and belong to the picture.
  assert.deepEqual((await repo.imagesNotRead(db)).map((r) => r.id), ['b']);
  await repo.saveImageText(db, 'b', 'RECEIPT Total 420 rupees');
  assert.deepEqual((await repo.searchThoughts(db, 'receipt')).map((t) => t.id), ['b']);
  assert.equal((await repo.getThought(db, 'b'))?.seen_text, 'RECEIPT Total 420 rupees');
  assert.deepEqual(await repo.imagesNotRead(db), []);

  // [[links]] find their note by title; mentions are found for renaming.
  assert.equal((await repo.findByTitle(db, 'pack LIST'))?.id, 'a');
  assert.deepEqual((await repo.mentioning(db, 'Pack list')).map((t) => t.id), ['c']);

  // Pinning and parking are this phone's own; they are not queued for the cloud.
  repo.setTracking(true);
  await repo.setPinned(db, 'a', true);
  await repo.setRecall(db, 'a', 0, 99);
  await repo.setList(db, 'a', 'someday');
  await repo.addFocus(db, 'a', 25);
  await repo.addFocus(db, 'a', 5);
  await repo.trashThought(db, 'c');
  assert.equal(await repo.outboxCount(db), 0, 'local marks record nothing for sending');
  repo.setTracking(false);
  const marked = (await repo.getThought(db, 'a'))!;
  assert.ok(marked.pinned);
  assert.equal(marked.recall_at, 99);
  assert.equal(marked.list, 'someday');
  assert.equal(marked.focus_min, 30);
  assert.equal(a.pinned, null);

  // The trash: out of every list and search, links kept, back as it was on restore.
  assert.deepEqual((await repo.listThoughts(db)).map((t) => t.id), ['b', 'a']);
  assert.deepEqual(await repo.searchThoughts(db, 'trip'), []);
  assert.deepEqual(await repo.neighboursOf(db, 'a'), []);
  assert.equal(await repo.countThoughts(db), 2);
  assert.deepEqual((await repo.listTrash(db)).map((t) => t.id), ['c']);
  assert.deepEqual(await repo.listTrash(db, 5), [], 'nothing is old enough to throw away yet');
  await repo.restoreThought(db, 'c');
  assert.deepEqual((await repo.searchThoughts(db, 'trip')).map((t) => t.id), ['c']);
  assert.deepEqual((await repo.neighboursOf(db, 'a')).map((t) => t.id), ['c']);

  // A pair marked unrelated loses its automatic link and is remembered.
  await repo.dismissPair(db, 'c', 'a');
  assert.deepEqual(await repo.neighboursOf(db, 'a'), []);
  assert.deepEqual([...(await repo.dismissedPairs(db))], ['a:c']);

  // What the person said about a group is stored once and updated in place.
  const pid = await repo.saveProject(db, { name: 'Hampi', goal: null, due_at: null, members: ['a', 'c'], notif_id: null });
  await repo.saveProject(db, { id: pid, name: 'Hampi in January', goal: 'Go', due_at: 5, members: ['a', 'c', 'b'], notif_id: null });
  assert.deepEqual(await repo.listProjects(db), [{ id: pid, name: 'Hampi in January', goal: 'Go', due_at: 5, members: ['a', 'c', 'b'], notif_id: null }]);
  await repo.deleteProject(db, pid);
  assert.deepEqual(await repo.listProjects(db), []);

  await repo.deleteThought(db, 'b');
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM image_text'))!.n, 0, 'a deleted picture takes its words with it');
}

// Translation: every key reaches Android with a value, and the summary never contradicts itself.
assert.ok(Object.values(translateArgs(['hola'])).every((v) => v !== undefined && v !== null), 'no key is undefined');
assert.equal(translateArgs(['x']).sourceLangCode, 'auto');
assert.equal(runSummary({ made: 0, checked: 3, failed: 0, problem: null }), 'On. None of your notes needed translating.');
const oneFailed = runSummary({ made: 0, checked: 0, failed: 1, problem: { kind: 'other', message: 'Cannot convert [object Object] to a Kotlin type' } });
assert.match(oneFailed, /^On\. Nothing was translated\. 1 note could not be translated\./);
assert.doesNotMatch(oneFailed, /needed translating|Kotlin/, 'no contradiction and no raw error');
assert.match(runSummary({ made: 2, checked: 2, failed: 1, problem: { kind: 'pack', message: 'x' } }), /2 notes have an English version now\. 1 note could not .* language pack/);

async function backupChecks(): Promise<void> {
  const a = nodeDb();
  await repo.prepare(a);
  await repo.insertThought(a, { id: 'p', kind: 'image', title: 'Receipt', body: '', media_path: 'file:///data/media/x.png', created_at: 1 });
  await repo.insertThought(a, { id: 'q', kind: 'text', title: 'Call the bank', body: 'about the card', created_at: 2 });
  await repo.insertThought(a, { id: 'r', kind: 'text', title: 'Old idea', body: '', created_at: 3 });
  await repo.setTodo(a, 'q', { remindAt: 9_000_000_000_000, notifId: 'alarm-here', repeat: 'monthly' });
  await repo.setPriority(a, 'q', true);
  await repo.setPinned(a, 'q', true);
  await repo.setRecall(a, 'q', 2, 77);
  await repo.setList(a, 'q', 'someday');
  await repo.addFocus(a, 'q', 25);
  await repo.trashThought(a, 'r');
  await repo.addTag(a, 'q', 'money');
  await repo.upsertLink(a, 'p', 'q', 'manual', 1);

  const backup = parseBackup(JSON.stringify(await makeBackup(a, 5)));
  assert.equal(backup.thoughts.length, 3, 'the trash is in the backup too');
  assert.ok(backup.thoughts.every((t) => t.notif_id === null), 'alarm ids stay on the phone that made them');
  assert.throws(() => parseBackup('{"app":"other"}'), /not an Engram backup/);

  // Files are keyed by note id, so two files with one name cannot collide; old backups are still found by name.
  assert.equal(mediaKey({ id: 'p', media_path: 'file:///data/media/x.png' }), 'media/p-x.png');
  assert.deepEqual(mediaKeys({ id: 'p', media_path: 'file:///m/a%20b.png' }), ['media/p-a b.png', 'media/a b.png']);

  const b = nodeDb();
  await repo.prepare(b);
  const asked: string[] = [];
  const done = await restoreBackup(b, backup, async (t) => {
    asked.push(t.id);
    return 'file:///new/x.png';
  });
  assert.deepEqual(done, { added: 3, skipped: 0, files: 1, ids: ['q', 'p', 'r'] });
  assert.deepEqual(asked, ['p'], 'only notes with a file ask for one');
  const q = (await repo.getThought(b, 'q'))!;
  const before = (await repo.getThought(a, 'q'))!;
  for (const k of ['todo', 'remind_at', 'repeat', 'priority', 'done_at', 'pinned', 'recall_step', 'recall_at', 'list', 'focus_min', 'created_at'] as const) {
    assert.deepEqual(q[k], before[k], `${k} survives a backup and restore`);
  }
  assert.equal(q.notif_id, null, 'a new alarm is made on the restoring phone, not copied');
  assert.ok((await repo.getThought(b, 'r'))!.trashed_at, 'a trashed note goes back to the trash');
  assert.equal((await repo.getThought(b, 'p'))!.media_path, 'file:///new/x.png');
  assert.deepEqual((await repo.tagsOf(b, 'q')).map((t) => t.name), ['money']);
  assert.equal((await repo.listLinks(b)).length, 1);
  // Restoring twice adds nothing.
  assert.deepEqual(await restoreBackup(b, backup, async () => null), { added: 0, skipped: 3, files: 0, ids: [] });
}

async function usageChecks(): Promise<void> {
  const db = nodeDb();
  await repo.prepare(db);
  // Counts add up per day and metric, and a day is deleted on its own.
  await repo.addUsage(db, '2026-11-16', 10);
  await repo.addUsage(db, '2026-11-16', 10, 2);
  await repo.addUsage(db, '2026-11-17', 1);
  assert.deepEqual(await repo.usageDays(db), ['2026-11-16', '2026-11-17']);
  assert.deepEqual(await repo.usageFor(db, '2026-11-16'), [{ metric: 10, uses: 3 }]);
  await repo.clearUsage(db, '2026-11-16');
  assert.deepEqual(await repo.usageDays(db), ['2026-11-17']);
  await repo.clearUsage(db);
  assert.deepEqual(await repo.usageDays(db), [], 'saying no deletes everything waiting');

  // Only finished days are sent, at most a week of them; older ones are dropped.
  const days = ['2026-11-01', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-17'];
  assert.deepEqual(plan(days, '2026-11-17'), { send: days.slice(1, 8), drop: ['2026-11-01'] });
  assert.deepEqual(plan(['2026-11-17'], '2026-11-17'), { send: [], drop: [] }, 'today waits until it is over');

  // The message carries known actions only, capped, and nothing else.
  const m = buildMessage('2026-11-16', '0.8.0', [{ metric: 10, uses: 4 }, { metric: 11, uses: 9000 }, { metric: 999, uses: 2 }, { metric: 50, uses: 1 }, { metric: 21, uses: 0 }], [53, 50, 53], [71, 81, 91]);
  assert.deepEqual(m, { day: '2026-11-16', v: '0.8.0', a: { '10': 4, '11': CAP }, s: [50, 53], b: [71, 81, 91] });
  assert.deepEqual(Object.keys(m).sort(), ['a', 'b', 's', 'v', 'day'].sort(), 'no id, no time, no content');
  assert.ok(describe(m).includes('Typed a quick thought: 4'));

  // The rough ranges.
  assert.deepEqual([1, 2, 3, 4, 6, 7].map(activeBucket), [70, 71, 71, 72, 72, 73]);
  const D = 86_400_000;
  assert.deepEqual([0, 7, 28, 91].map((d) => ageBucket(0, d * D)), [80, 81, 82, 83]);
  assert.deepEqual([0, 9, 10, 99, 100, 1000].map(notesBucket), [90, 90, 91, 91, 92, 93]);
  const seen = rememberDay(rememberDay(['2026-11-10'], '2026-11-16'), '2026-11-16');
  assert.deepEqual(seen, ['2026-11-16', '2026-11-10']);
  assert.equal(daysActiveIn(['2026-11-16', '2026-11-10', '2026-11-09'], '2026-11-16'), 2, 'only the 7 days ending that day count');
  assert.match(localDay(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
}

databaseChecks()
  .then(cloudChecks)
  .then(localChecks)
  .then(backupChecks)
  .then(usageChecks)
  .then(() => console.log(`ok: backup round trip, usage counts, database, trash and local marks, projects, dates in plain words, check boxes, recall, Markdown, old-database import, cloud sync between two phones, search, text helpers, formatted notes, linker, meaning, groups and reminders (${all.length} links in fixture)`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
