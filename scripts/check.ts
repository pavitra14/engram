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
import { splitQuick } from '../src/lib/capture.logic';
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
  assert.ok((await repo.listThoughts(b)).some((t) => t.body === 'B says: feed it in the morning' && /from this phone/.test(t.title ?? '')));
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

databaseChecks()
  .then(cloudChecks)
  .then(() => console.log(`ok: database, old-database import, cloud sync between two phones, search, text helpers, formatted notes, linker, meaning, groups and reminders (${all.length} links in fixture)`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
