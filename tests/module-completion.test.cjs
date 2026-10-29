/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('content edits invalidate sign-offs atomically and preserve prior dates', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE "Module" (id TEXT PRIMARY KEY, title TEXT, description TEXT, icon TEXT);
      CREATE TABLE "Subsection" (id TEXT PRIMARY KEY, title TEXT, description TEXT, "moduleId" TEXT);
      CREATE TABLE "Lesson" (id TEXT PRIMARY KEY, title TEXT, content JSONB, "subsectionId" TEXT, "order" INT);
      CREATE TABLE "LessonCompletion" ("lessonId" TEXT, "userId" TEXT, "isCompleted" BOOLEAN, "completedAt" TIMESTAMP);
      INSERT INTO "Module" VALUES ('m', 'Module', '', ''), ('other', 'Other', '', '');
      INSERT INTO "Subsection" VALUES ('s', 'Section', '', 'm'), ('other', 'Other', '', 'other');
      INSERT INTO "Lesson" VALUES ('l', 'Lesson', '{}', 's', 0), ('other', 'Other', '{}', 'other', 0);
      INSERT INTO "LessonCompletion" VALUES ('l', 'u', true, '2026-10-01'), ('other', 'u', true, '2026-10-01'), ('l', 'unstarted', false, '2026-10-01');
    `);
    await db.exec(readFileSync(require('node:path').join(__dirname, '../prisma/migrations/20261029160000_module_completion_out_of_date/migration.sql'), 'utf8'));
    const state = async () => (await db.query(`SELECT "isCompleted", "isOutOfDate", "completedAt"::TEXT AS date FROM "LessonCompletion" WHERE "lessonId"='l' AND "userId"='u'`)).rows[0];
    const initial = await state();
    await db.exec(`UPDATE "Module" SET title=title, icon='new'; UPDATE "Lesson" SET "order"=1;`);
    assert.deepEqual(await state(), initial);
    for (const change of [
      `UPDATE "Module" SET description='Updated' WHERE id='m'`,
      `UPDATE "Lesson" SET content='{"text":"updated"}' WHERE id='l'`,
      `UPDATE "Subsection" SET title='Updated' WHERE id='s'`,
      `INSERT INTO "Lesson" VALUES ('new', 'New', '{}', 's', 2)`,
      `DELETE FROM "Lesson" WHERE id='new'`,
    ]) {
      await db.exec(`UPDATE "LessonCompletion" SET "isCompleted"=true, "isOutOfDate"=false WHERE "lessonId"='l' AND "userId"='u'`);
      await db.exec(change);
      assert.deepEqual(await state(), { ...initial, isCompleted: false, isOutOfDate: true });
    }
    assert.equal((await db.query(`SELECT "isCompleted" FROM "LessonCompletion" WHERE "lessonId"='other'`)).rows[0].isCompleted, true);
    assert.equal((await db.query(`SELECT "isOutOfDate" FROM "LessonCompletion" WHERE "userId"='unstarted'`)).rows[0].isOutOfDate, false);
    await db.exec(`UPDATE "LessonCompletion" SET "isCompleted"=true, "isOutOfDate"=false WHERE "lessonId"='l' AND "userId"='u';`);
    await db.exec(`BEGIN; UPDATE "Module" SET title='Rolled back' WHERE id='m'; ROLLBACK;`);
    assert.deepEqual(await state(), initial);
  } finally { await db.close(); }
});
