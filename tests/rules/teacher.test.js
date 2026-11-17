// Synthetic data only. Red tests for teacher accounts (card 4-4, section 4-1, R1-R16).
// From the repository root (index.js alone is picked up by "node --test tests/rules"):
// firebase emulators:exec --only firestore --project demo-almahra-rules "node --test --test-concurrency=1 tests/rules/index.js tests/rules/teacher.test.js"
const { before, beforeEach, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const {
  initializeTestEnvironment, assertSucceeds, assertFails
} = require('@firebase/rules-unit-testing');
const {
  doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, deleteField, serverTimestamp
} = require('firebase/firestore');

const projectId = 'demo-almahra-rules';
const probeProjectId = 'demo-almahra-token-probe';
const PROGRAM = 'programs/general';
const SEASON = `${PROGRAM}/seasons/s1`;
const STUDENTS = `${SEASON}/students`;
const DELETED = `${SEASON}/deletedStudents`;
const KEYS = `${PROGRAM}/teacherKeys`;
const T1_CODE = 't1-AAAAAAAAAAAA';
const T2_CODE = 't2-BBBBBBBBBBBB';
const TODAY = '2026-11-16';
const ANON = { firebase: { sign_in_provider: 'anonymous' } };

// Top-level student keys written by the teacher-allowed paths of index.html at dd2b1f4:
// buildEntryPatch 6188-6204 + pinBaseFields 6168-6176, saveGeneralQuickEntry 10172-10200,
// undoLastGeneralEntry 10978-10985, saveStudent edit 11302-11303.
// Conditional keys outside this list (card 3-2b): frontierFix only when absent before the request (q1, R9c/R10),
// tierId/tierManual only as deletes (q2, R11b).
const ALLOWED_UPDATE_KEYS = Object.freeze([
  'history', 'lastDailySurah', 'lastDailyAyah', 'lastDailySardRange', 'frontierBase', 'lastDailyBase',
  'name', 'memorizedJuz', 'parentPhone'
]);
// New general student document: index.html 11308-11309 + generalStudentMembership 2979 (id is the doc id, not a field).
const NEW_STUDENT_FIELDS = Object.freeze([
  'sid', 'name', 'history', 'memorizedJuz', 'parentPhone', 'frontierBase', 'lastDailyBase', 'joinedOn',
  'halaqaId', 'teacherId', 'stage'
]);

let env;
let probeEnv;

const student = (id, halaqaId, teacherId) => ({
  name: `Synthetic student ${id}`, halaqaId, teacherId, stage: 'st1', parentPhone: '0500000000',
  memorizedJuz: 1, history: {}, joinedOn: '2026-09-01', sid: `sid-${id}`, frontierBase: null, lastDailyBase: null
});

const teacherDb = () => env.authenticatedContext('teacher1', ANON).firestore();
const adminDb = () => env.authenticatedContext('admin').firestore();
const readRaw = async path => {
  let snap;
  await env.withSecurityRulesDisabled(async context => { snap = await getDoc(doc(context.firestore(), path)); });
  return snap;
};
// assertFails, with the emulator's reason written to the test output.
const deny = async (t, label, promise) => {
  const err = await assertFails(promise);
  t.diagnostic(`${label}: ${String(err && err.message).replace(/\s+/g, ' ').trim()}`);
  return err;
};

before(async () => {
  assert.ok(projectId.startsWith('demo-'));
  assert.ok(probeProjectId.startsWith('demo-'));
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  }
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')
    }
  });
  // Separate demo project with a one-line probe rule: proves the token claim reaches the rules engine.
  probeEnv = await initializeTestEnvironment({
    projectId: probeProjectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /probe/{id} {
      allow read: if request.auth != null && request.auth.token.firebase.sign_in_provider == 'anonymous';
    }
  }
}`
    }
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/admin'), { role: 'admin', name: 'Synthetic admin' });
    batch.set(doc(db, 'users/teacher1'), { role: 'teacher', programId: 'general', teacherId: 't1', code: T1_CODE });
    batch.set(doc(db, PROGRAM), {
      name: 'general', activeSeasonId: 's1',
      settings: {
        teachers: [{ id: 't1', name: 'Synthetic T1' }, { id: 't2', name: 'Synthetic T2' }],
        halaqas: [
          { id: 'h1', name: 'H1', teacherId: 't1', stageId: 'st1', active: true },
          { id: 'h2', name: 'H2', teacherId: 't1', stageId: 'st1', active: true },
          { id: 'h3', name: 'H3', teacherId: 't2', stageId: 'st1', active: true }
        ]
      }
    });
    batch.set(doc(db, SEASON), { name: 'Synthetic season', status: 'active' });
    batch.set(doc(db, `${STUDENTS}/1`), student(1, 'h1', 't1'));
    batch.set(doc(db, `${STUDENTS}/2`), student(2, 'h2', 't1'));
    batch.set(doc(db, `${STUDENTS}/3`), student(3, 'h3', 't2'));
    batch.set(doc(db, `${KEYS}/t1`), { code: T1_CODE, halaqaIds: ['h1', 'h2'], active: true, createdAt: 1763251200000 });
    batch.set(doc(db, `${KEYS}/t2`), { code: T2_CODE, halaqaIds: ['h3'], active: true, createdAt: 1763251200000 });
    await batch.commit();
  });
});

after(async () => {
  if (env) await env.cleanup();
  if (probeEnv) await probeEnv.cleanup();
});

test('فحص: sign_in_provider يصل إلى القواعد في هذه النسخة من الحزمة', async t => {
  await probeEnv.clearFirestore();
  await probeEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'probe/x'), { synthetic: true }));
  await assertSucceeds(getDoc(doc(probeEnv.authenticatedContext('anon1', ANON).firestore(), 'probe/x')));
  // Default mock token carries sign_in_provider 'custom'.
  await deny(t, 'default token', getDoc(doc(probeEnv.authenticatedContext('anon1').firestore(), 'probe/x')));
});

test('ر1 هوية مجهولة تنشئ users بالرمز الصحيح', async () => {
  const db = env.authenticatedContext('anon1', ANON).firestore();
  const data = { role: 'teacher', programId: 'general', teacherId: 't1', code: T1_CODE };
  await assertSucceeds(setDoc(doc(db, 'users/anon1'), data));
  assert.deepEqual((await readRaw('users/anon1')).data(), data);
});

test('ر2 إنشاء users برمز خطأ أو رمز معلم آخر أو حقل زائد أو دور مشرف مرفوض', async t => {
  const db = env.authenticatedContext('anon1', ANON).firestore();
  const ref = doc(db, 'users/anon1');
  const base = { role: 'teacher', programId: 'general', teacherId: 't1', code: T1_CODE };
  await deny(t, 'wrong code', setDoc(ref, { ...base, code: 't1-ZZZZZZZZZZZZ' }));
  await deny(t, 'other teacher code', setDoc(ref, { ...base, code: T2_CODE }));
  await deny(t, 'extra field', setDoc(ref, { ...base, halaqaIds: ['h1', 'h2', 'h3'] }));
  await deny(t, 'admin role', setDoc(ref, { ...base, role: 'admin' }));
  assert.equal((await readRaw('users/anon1')).exists(), false);
});

// ق5: users create uses the requester's own uid only.
test('ر2ب هوية مجهولة anon1 لا تنشئ users/anon2 ولو بالرمز الصحيح', async t => {
  const db = env.authenticatedContext('anon1', ANON).firestore();
  await deny(t, 'create other uid', setDoc(doc(db, 'users/anon2'),
    { role: 'teacher', programId: 'general', teacherId: 't1', code: T1_CODE }));
  assert.equal((await readRaw('users/anon2')).exists(), false);
});

// Round 2 (card 3-2b q4): role/teacherId/programId frozen; delete denied.
test('ر3 المعلم لا يعدّل role ولا teacherId ولا programId في users ولا يحذفه', async t => {
  const ref = doc(teacherDb(), 'users/teacher1');
  await deny(t, 'update role', updateDoc(ref, { role: 'admin' }));
  await deny(t, 'update teacherId', updateDoc(ref, { teacherId: 't2' }));
  await deny(t, 'update programId', updateDoc(ref, { programId: 'summer' }));
  await deny(t, 'delete', deleteDoc(ref));
  assert.deepEqual((await readRaw('users/teacher1')).data(),
    { role: 'teacher', programId: 'general', teacherId: 't1', code: T1_CODE });
});

// The admin code change is seeded with rules disabled so these cases test only the teacher's
// users update; the admin's own right to write teacherKeys is R16.
const NEW_T1_CODE = 't1-EEEEEEEEEEEE';
const rotateT1Code = () => env.withSecurityRulesDisabled(context =>
  updateDoc(doc(context.firestore(), `${KEYS}/t1`), { code: NEW_T1_CODE }));

test('ر3ب بعد رمز جديد يحدّث المعلم code وحده إلى الرمز الساري', async () => {
  await rotateT1Code();
  await assertSucceeds(updateDoc(doc(teacherDb(), 'users/teacher1'), { code: NEW_T1_CODE }));
  assert.equal((await readRaw('users/teacher1')).data().code, NEW_T1_CODE);
});

test('ر3ب تحديث code إلى رمز خطأ أو مع حقل آخر مرفوض', async t => {
  await rotateT1Code();
  const ref = doc(teacherDb(), 'users/teacher1');
  await deny(t, 'wrong code', updateDoc(ref, { code: 't1-ZZZZZZZZZZZZ' }));
  await deny(t, 'old code of t2', updateDoc(ref, { code: T2_CODE }));
  await deny(t, 'valid code + teacherId', updateDoc(ref, { code: NEW_T1_CODE, teacherId: 't2' }));
  await deny(t, 'valid code + extra field', updateDoc(ref, { code: NEW_T1_CODE, halaqaIds: ['h3'] }));
  assert.equal((await readRaw('users/teacher1')).data().code, T1_CODE);
});

test('ر4 المعلم لا يقرأ teacherKeys', async t => {
  await deny(t, 'get t1', getDoc(doc(teacherDb(), `${KEYS}/t1`)));
  await deny(t, 'list', getDocs(collection(teacherDb(), KEYS)));
});

test('ر5 المعلم يقرأ البرنامج والموسم', async () => {
  const db = teacherDb();
  assert.equal((await assertSucceeds(getDoc(doc(db, PROGRAM)))).data().activeSeasonId, 's1');
  assert.equal((await assertSucceeds(getDoc(doc(db, SEASON)))).exists(), true);
});

// q7: every general season is readable (the UI uses the active one only).
test('ر5ب المعلم يقرأ موسماً ثانياً غير نشط', async () => {
  await env.withSecurityRulesDisabled(context =>
    setDoc(doc(context.firestore(), `${PROGRAM}/seasons/s0`), { name: 'Synthetic old season', status: 'archived' }));
  assert.equal((await assertSucceeds(getDoc(doc(teacherDb(), `${PROGRAM}/seasons/s0`)))).data().status, 'archived');
});

test('ر5 المعلم لا يكتب البرنامج ولا الموسم', async t => {
  const db = teacherDb();
  await deny(t, 'update program', updateDoc(doc(db, PROGRAM), { name: 'x' }));
  await deny(t, 'update season', updateDoc(doc(db, SEASON), { status: 'x' }));
  await deny(t, 'delete season', deleteDoc(doc(db, SEASON)));
});

test('ر6 المعلم يقرأ طالباً في ح1 وفي ح2', async () => {
  const db = teacherDb();
  assert.equal((await assertSucceeds(getDoc(doc(db, `${STUDENTS}/1`)))).data().halaqaId, 'h1');
  assert.equal((await assertSucceeds(getDoc(doc(db, `${STUDENTS}/2`)))).data().halaqaId, 'h2');
});

test('ر7 المعلم لا يقرأ طالباً في ح3', async t => {
  await deny(t, 'get student 3', getDoc(doc(teacherDb(), `${STUDENTS}/3`)));
});

test('ر8 استعلام الطلاب بلا قيد الحلقة مرفوض', async t => {
  await deny(t, 'list all', getDocs(collection(teacherDb(), STUDENTS)));
});

test('ر8 استعلام الطلاب بقيد ح1 وح2 مسموح', async () => {
  const snap = await assertSucceeds(getDocs(query(collection(teacherDb(), STUDENTS), where('halaqaId', 'in', ['h1', 'h2']))));
  assert.deepEqual(snap.docs.map(d => d.id).sort(), ['1', '2']);
});

test('ر8 استعلام الطلاب بقيد يشمل ح3 مرفوض', async t => {
  await deny(t, 'in h1,h3', getDocs(query(collection(teacherDb(), STUDENTS), where('halaqaId', 'in', ['h1', 'h3']))));
});

test('ر9 المعلم يحدّث تسجيل اليوم لطالبه', async () => {
  const p = `history.${TODAY}.`;
  const fields = {
    [p + 'attended']: true,
    [p + 'hijri']: 'synthetic hijri',
    [p + 'absence']: deleteField(),
    [p + 'note']: deleteField(),
    [p + 'entries.e1']: { kind: 'new', surah: 83, from: 9, to: 12, points: 4, at: 1, by: 'teacher1', heardBy: 't1' },
    [p + 'criteria']: { homeprep: 1 },
    [p + 'criteriaPoints']: 2,
    lastDailySurah: 83, lastDailyAyah: 12, lastDailySardRange: null,
    frontierBase: { surah: 83, ayah: 8 },
    lastDailyBase: { surah: 83, ayah: 8, range: null }
  };
  const topLevel = [...new Set(Object.keys(fields).map(key => key.split('.')[0]))];
  assert.ok(topLevel.every(key => ALLOWED_UPDATE_KEYS.includes(key)), topLevel.join(','));
  await assertSucceeds(updateDoc(doc(teacherDb(), `${STUDENTS}/1`), fields));
  const data = (await readRaw(`${STUDENTS}/1`)).data();
  assert.equal(data.history[TODAY].entries.e1.kind, 'new');
  assert.equal(data.history[TODAY].criteriaPoints, 2);
  assert.equal(data.lastDailyAyah, 12);
  assert.deepEqual(data.frontierBase, { surah: 83, ayah: 8 });
});

test('ر9ب تحديث يلمس مفتاحَي تاريخ في history معاً مرفوض', async t => {
  await deny(t, 'two dates', updateDoc(doc(teacherDb(), `${STUDENTS}/1`), {
    [`history.${TODAY}.attended`]: true,
    ['history.2026-11-01.attended']: true
  }));
  assert.deepEqual((await readRaw(`${STUDENTS}/1`)).data().history, {});
});

test('ر9ب تحديث بمفتاح تاريخ واحد مسموح', async () => {
  await assertSucceeds(updateDoc(doc(teacherDb(), `${STUDENTS}/1`), { [`history.${TODAY}.attended`]: true }));
  assert.equal((await readRaw(`${STUDENTS}/1`)).data().history[TODAY].attended, true);
});

// q1: first position of a student without frontierFix is written with today's entry.
test('ر9ج أول إنجاز لطالب بلا frontierFix يكتب history وfrontierFix معاً', async () => {
  const fix = { surah: 83, ayah: 8, at: 1, by: 'teacher1', prev: null };
  await assertSucceeds(updateDoc(doc(teacherDb(), `${STUDENTS}/1`), {
    [`history.${TODAY}.attended`]: true,
    [`history.${TODAY}.entries.e1`]: { kind: 'new', surah: 83, from: 9, to: 12, points: 4, at: 2, by: 'teacher1', heardBy: 't1' },
    frontierFix: fix
  }));
  const data = (await readRaw(`${STUDENTS}/1`)).data();
  assert.deepEqual(data.frontierFix, fix);
  assert.equal(data.history[TODAY].entries.e1.kind, 'new');
});

test('ر10 المعلم لا يغيّر frontierFix موجوداً', async t => {
  const existing = { surah: 78, ayah: 1, at: 1, by: 'admin', prev: null };
  await env.withSecurityRulesDisabled(context =>
    updateDoc(doc(context.firestore(), `${STUDENTS}/2`), { frontierFix: existing }));
  const ref = doc(teacherDb(), `${STUDENTS}/2`);
  await deny(t, 'change frontierFix', updateDoc(ref, { frontierFix: { surah: 1, ayah: 1, at: 2, by: 'teacher1', prev: existing } }));
  await deny(t, 'change frontierFix with entry', updateDoc(ref, {
    [`history.${TODAY}.attended`]: true,
    frontierFix: { surah: 1, ayah: 1, at: 2, by: 'teacher1', prev: existing }
  }));
  await deny(t, 'delete frontierFix', updateDoc(ref, { frontierFix: deleteField() }));
  assert.deepEqual((await readRaw(`${STUDENTS}/2`)).data().frontierFix, existing);
});

test('ر10 المعلم لا يحدّث halaqaId ولا joinedOn ولا tierId', async t => {
  const ref = doc(teacherDb(), `${STUDENTS}/1`);
  await deny(t, 'halaqaId h2', updateDoc(ref, { halaqaId: 'h2' }));
  await deny(t, 'joinedOn', updateDoc(ref, { joinedOn: '2026-01-01' }));
  await deny(t, 'tierId', updateDoc(ref, { tierId: 'tier1' }));
  const data = (await readRaw(`${STUDENTS}/1`)).data();
  assert.equal(data.halaqaId, 'h1');
  assert.equal(data.joinedOn, '2026-09-01');
  assert.equal('frontierFix' in data, false);
  assert.equal('tierId' in data, false);
});

test('ر11 المعلم يعدّل الاسم والأجزاء والجوال لطالبه', async () => {
  await assertSucceeds(updateDoc(doc(teacherDb(), `${STUDENTS}/2`), { name: 'Synthetic renamed', memorizedJuz: 3, parentPhone: '0511111111' }));
  const data = (await readRaw(`${STUDENTS}/2`)).data();
  assert.equal(data.name, 'Synthetic renamed');
  assert.equal(data.memorizedJuz, 3);
  assert.equal(data.parentPhone, '0511111111');
});

// q2: tierId/tierManual may only be deleted (saveStudent edit 11302-11303 always sends both deletes).
const seedTier = () => env.withSecurityRulesDisabled(context =>
  updateDoc(doc(context.firestore(), `${STUDENTS}/2`), { tierId: 'tier1', tierManual: true }));

test('ر11ب تعديل اسم طالب له tierId وtierManual مع حذفهما مسموح', async () => {
  await seedTier();
  await assertSucceeds(updateDoc(doc(teacherDb(), `${STUDENTS}/2`), {
    name: 'Synthetic renamed', memorizedJuz: 2, parentPhone: '0522222222', tierId: deleteField(), tierManual: deleteField()
  }));
  const data = (await readRaw(`${STUDENTS}/2`)).data();
  assert.equal(data.name, 'Synthetic renamed');
  assert.equal('tierId' in data, false);
  assert.equal('tierManual' in data, false);
});

test('ر11ب وضع قيمة لـtierId أو tierManual مرفوض', async t => {
  await seedTier();
  const ref = doc(teacherDb(), `${STUDENTS}/2`);
  await deny(t, 'set tierId', updateDoc(ref, { name: 'x', tierId: 'tier2' }));
  await deny(t, 'set tierManual', updateDoc(ref, { tierManual: false }));
  const data = (await readRaw(`${STUDENTS}/2`)).data();
  assert.equal(data.tierId, 'tier1');
  assert.equal(data.tierManual, true);
});

test('ر12 المعلم لا يحدّث طالباً في ح3 بأي حقل', async t => {
  const ref = doc(teacherDb(), `${STUDENTS}/3`);
  await deny(t, 'history', updateDoc(ref, { [`history.${TODAY}.attended`]: true }));
  await deny(t, 'name', updateDoc(ref, { name: 'x' }));
  await deny(t, 'lastDailyAyah', updateDoc(ref, { lastDailyAyah: 5 }));
  assert.equal((await readRaw(`${STUDENTS}/3`)).data().name, 'Synthetic student 3');
});

test('ر13 المعلم ينشئ طالباً في ح1 بالحقول المسموحة', async () => {
  const data = student(4, 'h1', 't1');
  assert.deepEqual(Object.keys(data).sort(), [...NEW_STUDENT_FIELDS].sort());
  await assertSucceeds(setDoc(doc(teacherDb(), `${STUDENTS}/4`), data));
  assert.deepEqual((await readRaw(`${STUDENTS}/4`)).data(), data);
});

test('ر13 المعلم لا ينشئ طالباً في ح3 ولا بحقل tierId', async t => {
  const db = teacherDb();
  await deny(t, 'create in h3', setDoc(doc(db, `${STUDENTS}/5`), student(5, 'h3', 't2')));
  await deny(t, 'create with tierId', setDoc(doc(db, `${STUDENTS}/6`), { ...student(6, 'h1', 't1'), tierId: 'tier1' }));
  assert.equal((await readRaw(`${STUDENTS}/5`)).exists(), false);
  assert.equal((await readRaw(`${STUDENTS}/6`)).exists(), false);
});

// q3: createGeneralStudentIfAbsent reads the target inside its transaction before creating it.
test('ر13ب المعلم يقرأ مستند طالب غير موجود في الموسم', async () => {
  const snap = await assertSucceeds(getDoc(doc(teacherDb(), `${STUDENTS}/99`)));
  assert.equal(snap.exists(), false);
});

// q14: halaqaId and teacherId create constraints, each isolated.
test('ر13ج إنشاء طالب كل حقوله صحيحة إلا halaqaId = h3 مرفوض', async t => {
  await deny(t, 'h3 with teacherId t1', setDoc(doc(teacherDb(), `${STUDENTS}/8`), student(8, 'h3', 't1')));
  assert.equal((await readRaw(`${STUDENTS}/8`)).exists(), false);
});

test('ر13د إنشاء طالب في h1 بـteacherId = t2 مرفوض', async t => {
  await deny(t, 'h1 with teacherId t2', setDoc(doc(teacherDb(), `${STUDENTS}/9`), student(9, 'h1', 't2')));
  assert.equal((await readRaw(`${STUDENTS}/9`)).exists(), false);
});

// Round 5, q15: the copy key is the student's sid (a unique UUID), not its reusable number,
// and deletedAt is serverTimestamp() (== request.time) written in the same batch as the delete.
const sidOf = id => `sid-${id}`;
const copyOf = async (id, extra = {}) =>
  ({ ...(await readRaw(`${STUDENTS}/${id}`)).data(), studentId: String(id), deletedBy: 'teacher1', deletedAt: serverTimestamp(), ...extra });
const copyAndDelete = (db, id, copy, key = sidOf(id)) => {
  const batch = writeBatch(db);
  batch.set(doc(db, `${DELETED}/${key}`), copy);
  batch.delete(doc(db, `${STUDENTS}/${id}`));
  return batch.commit();
};
const assertUntouched = async (id, keys = [sidOf(id)]) => {
  assert.equal((await readRaw(`${STUDENTS}/${id}`)).exists(), true);
  for (const key of keys) assert.equal((await readRaw(`${DELETED}/${key}`)).exists(), false, `${DELETED}/${key}`);
};
// An earlier deleted student that had the same number but another sid: stored under the
// legacy number key (round 1-4 format) and under its own sid.
const OLD_SID = 'sid-old-1';
const seedOldCopyOfNumber = id => env.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  const old = { ...student(id, 'h1', 't1'), name: `Old student ${id}`, sid: `sid-old-${id}`, studentId: String(id), deletedBy: 'admin', deletedAt: 1 };
  await setDoc(doc(db, `${DELETED}/${id}`), old);
  await setDoc(doc(db, `${DELETED}/sid-old-${id}`), old);
});

test('ر14 المعلم يحذف طالبه بنسخة مفتاحها sid وdeletedAt من الخادم في دفعة واحدة', async () => {
  const original = (await readRaw(`${STUDENTS}/1`)).data();
  await assertSucceeds(copyAndDelete(teacherDb(), 1, await copyOf(1)));
  assert.equal((await readRaw(`${STUDENTS}/1`)).exists(), false);
  const { deletedAt, ...copy } = (await readRaw(`${DELETED}/${sidOf(1)}`)).data();
  assert.deepEqual(copy, { ...original, studentId: '1', deletedBy: 'teacher1' });
  assert.equal(typeof deletedAt?.toMillis, 'function');
  assert.equal((await readRaw(`${DELETED}/1`)).exists(), false);
});

test('ر14ب المعلم لا يحذف طالبه بلا نسخة', async t => {
  await deny(t, 'delete without copy', deleteDoc(doc(teacherDb(), `${STUDENTS}/1`)));
  await assertUntouched(1);
});

test('ر14ج المعلم لا ينشئ نسخة لطالبه بلا حذفه في الدفعة نفسها', async t => {
  await deny(t, 'copy without delete', setDoc(doc(teacherDb(), `${DELETED}/${sidOf(1)}`), await copyOf(1)));
  await assertUntouched(1);
});

test('ر14د دفعة نسخة وحذف باسم مختلف مرفوضة', async t => {
  await deny(t, 'copy with other name', copyAndDelete(teacherDb(), 1, await copyOf(1, { name: 'Forged name' })));
  await assertUntouched(1);
});

test('ر14د دفعة نسخة وحذف بـhistory مختلف مرفوضة', async t => {
  const history = { '2026-11-01': { attended: true, entries: { x: { kind: 'new', points: 99 } } } };
  await deny(t, 'copy with other history', copyAndDelete(teacherDb(), 1, await copyOf(1, { history })));
  await assertUntouched(1);
});

// Round 6, q15b: studentId (string = the student's doc id) must name the student deleted in this batch.
test('ر14م نسخة صحيحة إلا أن studentId يشير إلى طالب آخر في حلقتي أو رقماً لا نصاً مرفوضة', async t => {
  await deny(t, 'studentId of student 2 (h2)', copyAndDelete(teacherDb(), 1, await copyOf(1, { studentId: '2' })));
  await deny(t, 'studentId number', copyAndDelete(teacherDb(), 1, await copyOf(1, { studentId: 1 })));
  await assertUntouched(1);
  assert.equal((await readRaw(`${STUDENTS}/2`)).exists(), true);
});

// Round 4, q13b (+ q15b): the copy must equal the real document exactly, except studentId/deletedBy/deletedAt.
test('ر14ز دفعة نسخة وحذف بـparentPhone مختلف مرفوضة', async t => {
  await deny(t, 'copy with other parentPhone', copyAndDelete(teacherDb(), 1, await copyOf(1, { parentPhone: '0599999999' })));
  await assertUntouched(1);
});

test('ر14ز دفعة نسخة مطابقة مع حقل زائد مرفوضة', async t => {
  await deny(t, 'copy with extra field', copyAndDelete(teacherDb(), 1, await copyOf(1, { note: 'x' })));
  await assertUntouched(1);
});

// q15: an old copy for the same (reused) number must neither block the legit batch nor allow a bare delete.
test('ر14ح نسخة قديمة بالرقم نفسه (sid آخر): الدفعة الصحيحة مسموحة', async () => {
  await seedOldCopyOfNumber(1);
  await assertSucceeds(copyAndDelete(teacherDb(), 1, await copyOf(1)));
  assert.equal((await readRaw(`${STUDENTS}/1`)).exists(), false);
  assert.equal((await readRaw(`${DELETED}/${sidOf(1)}`)).data().deletedBy, 'teacher1');
  assert.equal((await readRaw(`${DELETED}/${OLD_SID}`)).data().name, 'Old student 1');
});

test('ر14ح نسخة قديمة بالرقم نفسه (sid آخر): الحذف وحده مرفوض', async t => {
  await seedOldCopyOfNumber(1);
  await deny(t, 'delete alone with old copy', deleteDoc(doc(teacherDb(), `${STUDENTS}/1`)));
  assert.equal((await readRaw(`${STUDENTS}/1`)).exists(), true);
  assert.equal((await readRaw(`${DELETED}/${sidOf(1)}`)).exists(), false);
});

test('ر14ط deletedAt بقيمة من العميل مرفوض', async t => {
  await deny(t, 'deletedAt Date.now()', copyAndDelete(teacherDb(), 1, await copyOf(1, { deletedAt: Date.now() })));
  await deny(t, 'deletedAt string', copyAndDelete(teacherDb(), 1, await copyOf(1, { deletedAt: 'not-a-time' })));
  await assertUntouched(1);
});

test('ر14ي اسم مستند النسخة = رقم الطالب لا sid مرفوض', async t => {
  await deny(t, 'copy keyed by number', copyAndDelete(teacherDb(), 1, await copyOf(1), '1'));
  await assertUntouched(1, [sidOf(1), '1']);
});

// q18 (reviewer M19, M20): deletedBy must be the teacher, deletedAt must be present.
test('ر14ك نسخة بـdeletedBy لغير المعلم أو بلا deletedAt مرفوضة', async t => {
  await deny(t, 'deletedBy admin', copyAndDelete(teacherDb(), 1, await copyOf(1, { deletedBy: 'admin' })));
  const { deletedAt, ...noDeletedAt } = await copyOf(1);
  await deny(t, 'no deletedAt', copyAndDelete(teacherDb(), 1, noDeletedAt));
  await assertUntouched(1);
});

// q14: each constraint isolated.
test('ر14هـ المعلم لا يحذف طالب ح3 بلا نسخة ولا مع نسخة في دفعة', async t => {
  await deny(t, 'delete h3 alone', deleteDoc(doc(teacherDb(), `${STUDENTS}/3`)));
  await deny(t, 'delete h3 with copy (copy halaqaId h1)', copyAndDelete(teacherDb(), 3, await copyOf(3, { halaqaId: 'h1' })));
  await assertUntouched(3);
});

// q18 (reviewer M18 / A2b): an old copy for an h3 student must not open its delete.
test('ر14ل المعلم لا يحذف طالب ح3 ولو وُجدت له نسخة قديمة', async t => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const old = { ...student(3, 'h3', 't2'), studentId: '3', deletedBy: 'admin', deletedAt: 1 };
    await setDoc(doc(db, `${DELETED}/3`), old);
    await setDoc(doc(db, `${DELETED}/${sidOf(3)}`), old);
  });
  await deny(t, 'delete h3 with old copies', deleteDoc(doc(teacherDb(), `${STUDENTS}/3`)));
  assert.equal((await readRaw(`${STUDENTS}/3`)).exists(), true);
});

test('ر14و المعلم لا ينشئ نسخة لطالب ح3 مع حذفه في الدفعة', async t => {
  await deny(t, 'copy h3 + delete h3', copyAndDelete(teacherDb(), 3, await copyOf(3)));
  await assertUntouched(3);
});

// q13 extra: a forged copy that claims h1 for a real h3 student, without delete.
test('ر14و نسخة لطالب ح3 بحلقة مزوّرة ح1 بلا حذف مرفوضة', async t => {
  await deny(t, 'forged h1 copy of student 3',
    setDoc(doc(teacherDb(), `${DELETED}/${sidOf(3)}`), await copyOf(3, { halaqaId: 'h1', teacherId: 't1' })));
  await assertUntouched(3);
});

test('ر14 الدفعة نفسها لطالب ح3 مرفوضة', async t => {
  await deny(t, 'batch h3', copyAndDelete(teacherDb(), 3, await copyOf(3)));
  await assertUntouched(3);
});

test('ر14 المعلم لا يقرأ deletedStudents', async t => {
  await env.withSecurityRulesDisabled(context =>
    setDoc(doc(context.firestore(), `${DELETED}/${sidOf(1)}`), { ...student(1, 'h1', 't1'), studentId: '1', deletedBy: 'teacher1', deletedAt: 1 }));
  await deny(t, 'get deleted copy', getDoc(doc(teacherDb(), `${DELETED}/${sidOf(1)}`)));
  await deny(t, 'list deleted', getDocs(collection(teacherDb(), DELETED)));
});

test('ر14 المشرف يقرأ deletedStudents', async () => {
  await env.withSecurityRulesDisabled(context =>
    setDoc(doc(context.firestore(), `${DELETED}/${sidOf(1)}`), { ...student(1, 'h1', 't1'), studentId: '1', deletedBy: 'teacher1', deletedAt: 1 }));
  assert.equal((await assertSucceeds(getDoc(doc(adminDb(), `${DELETED}/${sidOf(1)}`)))).data().deletedBy, 'teacher1');
});

// ===== Round 5, q16: create shape exactly (11 keys, history {}, both bases null) =====
test('ر13هـ إنشاء طالب بـhistory فيه يوم مرفوض', async t => {
  const history = { '2026-10-01': { attended: true, entries: { e: { kind: 'new', points: 50 } } } };
  await deny(t, 'history with a day', setDoc(doc(teacherDb(), `${STUDENTS}/10`), { ...student(10, 'h1', 't1'), history }));
  assert.equal((await readRaw(`${STUDENTS}/10`)).exists(), false);
});

test('ر13و إنشاء طالب بحقلين فقط مرفوض', async t => {
  await deny(t, 'two fields only', setDoc(doc(teacherDb(), `${STUDENTS}/11`), { halaqaId: 'h1', teacherId: 't1' }));
  assert.equal((await readRaw(`${STUDENTS}/11`)).exists(), false);
});

test('ر13ز إنشاء طالب بـfrontierBase بقيمة مرفوض', async t => {
  await deny(t, 'frontierBase value', setDoc(doc(teacherDb(), `${STUDENTS}/12`),
    { ...student(12, 'h1', 't1'), frontierBase: { surah: 2, ayah: 286 } }));
  assert.equal((await readRaw(`${STUDENTS}/12`)).exists(), false);
});

// ===== Round 5, q17: writes only in the active season; reads in every general season =====
const ARCHIVED = `${PROGRAM}/seasons/s2`;
const seedArchivedSeason = () => env.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  await setDoc(doc(db, ARCHIVED), { name: 'Synthetic archived season', status: 'archived' });
  await setDoc(doc(db, `${ARCHIVED}/students/20`), { ...student(20, 'h1', 't1') });
});

test('ر6ب المعلم يقرأ طالب حلقته في موسم مؤرشف', async () => {
  await seedArchivedSeason();
  assert.equal((await readRaw(PROGRAM)).data().activeSeasonId, 's1');
  assert.equal((await assertSucceeds(getDoc(doc(teacherDb(), `${ARCHIVED}/students/20`)))).data().halaqaId, 'h1');
});

test('ر12ب المعلم لا يعدّل طالب حلقته في موسم مؤرشف', async t => {
  await seedArchivedSeason();
  await deny(t, 'update in archived season', updateDoc(doc(teacherDb(), `${ARCHIVED}/students/20`), { name: 'changed in archive' }));
  assert.equal((await readRaw(`${ARCHIVED}/students/20`)).data().name, 'Synthetic student 20');
});

test('ر13ح المعلم لا ينشئ طالباً في موسم مؤرشف', async t => {
  await seedArchivedSeason();
  await deny(t, 'create in archived season', setDoc(doc(teacherDb(), `${ARCHIVED}/students/21`), student(21, 'h1', 't1')));
  assert.equal((await readRaw(`${ARCHIVED}/students/21`)).exists(), false);
});

// ===== Round 5, q18: reviewer survivors M6-M9, M11-M14 =====
test('ر5ج المعلم لا يقرأ summer ولا review-day (برنامجاً وموسماً)', async t => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const p of ['summer', 'review-day']) {
      await setDoc(doc(db, `programs/${p}`), { name: p, activeSeasonId: 's1' });
      await setDoc(doc(db, `programs/${p}/seasons/s1`), { name: 'Synthetic season' });
    }
  });
  for (const p of ['summer', 'review-day']) {
    await deny(t, `get programs/${p}`, getDoc(doc(teacherDb(), `programs/${p}`)));
    await deny(t, `get ${p} season`, getDoc(doc(teacherDb(), `programs/${p}/seasons/s1`)));
  }
});

test('ر3ج المعلم لا يحدّث users/teacher2، ومستند بدور viewer لا يحدّث code', async t => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/teacher2'), { role: 'teacher', programId: 'general', teacherId: 't2', code: 't2-OLDOLDOLDOLD' });
    await setDoc(doc(db, 'users/viewer1'), { role: 'viewer', programId: 'general', teacherId: 't1', code: 't1-OLDOLDOLDOLD' });
  });
  await deny(t, 'teacher1 updates users/teacher2', updateDoc(doc(teacherDb(), 'users/teacher2'), { code: T2_CODE }));
  await deny(t, 'viewer updates own code to live t1',
    updateDoc(doc(env.authenticatedContext('viewer1', ANON).firestore(), 'users/viewer1'), { code: T1_CODE }));
  assert.equal((await readRaw('users/teacher2')).data().code, 't2-OLDOLDOLDOLD');
  assert.equal((await readRaw('users/viewer1')).data().code, 't1-OLDOLDOLDOLD');
});

test('ر2ج إنشاء users بهوية غير مجهولة مرفوض', async t => {
  await deny(t, 'custom token create', setDoc(doc(env.authenticatedContext('c1').firestore(), 'users/c1'),
    { role: 'teacher', programId: 'general', teacherId: 't1', code: T1_CODE }));
  assert.equal((await readRaw('users/c1')).exists(), false);
});

test('ر2د إنشاء users بـprogramId summer مرفوض', async t => {
  await deny(t, 'programId summer', setDoc(doc(env.authenticatedContext('a9', ANON).firestore(), 'users/a9'),
    { role: 'teacher', programId: 'summer', teacherId: 't1', code: T1_CODE }));
  assert.equal((await readRaw('users/a9')).exists(), false);
});

test('ر16ب مستند users بدور viewer أو ببرنامج summer مع رمز ساري لا يقرأ طالباً', async t => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/tv'), { role: 'viewer', programId: 'general', teacherId: 't1', code: T1_CODE });
    await setDoc(doc(db, 'users/ts'), { role: 'teacher', programId: 'summer', teacherId: 't1', code: T1_CODE });
  });
  await deny(t, 'role viewer', getDoc(doc(env.authenticatedContext('tv', ANON).firestore(), `${STUDENTS}/1`)));
  await deny(t, 'programId summer', getDoc(doc(env.authenticatedContext('ts', ANON).firestore(), `${STUDENTS}/1`)));
});

const assertAllTeacherAccessDenied = async t => {
  const db = teacherDb();
  await deny(t, 'get student 1', getDoc(doc(db, `${STUDENTS}/1`)));
  await deny(t, 'get student 2', getDoc(doc(db, `${STUDENTS}/2`)));
  await deny(t, 'query h1,h2', getDocs(query(collection(db, STUDENTS), where('halaqaId', 'in', ['h1', 'h2']))));
  await deny(t, 'get program', getDoc(doc(db, PROGRAM)));
  await deny(t, 'get season', getDoc(doc(db, SEASON)));
  await deny(t, 'update student 1', updateDoc(doc(db, `${STUDENTS}/1`), { [`history.${TODAY}.attended`]: true }));
  await deny(t, 'create student 7', setDoc(doc(db, `${STUDENTS}/7`), student(7, 'h1', 't1')));
};

test('ر15 المشرف يغيّر الرمز فتسقط كل قراءات المعلم وكتاباته', async t => {
  await assertSucceeds(getDoc(doc(teacherDb(), `${STUDENTS}/1`)));
  await assertSucceeds(updateDoc(doc(adminDb(), `${KEYS}/t1`), { code: 't1-CCCCCCCCCCCC' }));
  await assertAllTeacherAccessDenied(t);
});

test('ر15 المشرف يجعل active:false فتسقط كل قراءات المعلم وكتاباته', async t => {
  await assertSucceeds(getDoc(doc(teacherDb(), `${STUDENTS}/1`)));
  await assertSucceeds(updateDoc(doc(adminDb(), `${KEYS}/t1`), { active: false }));
  await assertAllTeacherAccessDenied(t);
});

test('ر16 المشرف يقرأ ويكتب teacherKeys', async () => {
  const db = adminDb();
  assert.equal((await assertSucceeds(getDoc(doc(db, `${KEYS}/t1`)))).data().code, T1_CODE);
  await assertSucceeds(setDoc(doc(db, `${KEYS}/t1`), { code: 't1-DDDDDDDDDDDD', halaqaIds: ['h1', 'h2'], active: true, createdAt: 1 }));
  assert.equal((await readRaw(`${KEYS}/t1`)).data().code, 't1-DDDDDDDDDDDD');
});

test('ر16 المشرف يحدّث طالباً في ح3', async () => {
  await assertSucceeds(updateDoc(doc(adminDb(), `${STUDENTS}/3`), { name: 'Admin renamed', [`history.${TODAY}.attended`]: true }));
  assert.equal((await readRaw(`${STUDENTS}/3`)).data().name, 'Admin renamed');
});

test('ر16 هوية بلا users لا تقرأ طالباً', async t => {
  await deny(t, 'anon without users', getDoc(doc(env.authenticatedContext('anon1', ANON).firestore(), `${STUDENTS}/1`)));
  await deny(t, 'custom without users', getDoc(doc(env.authenticatedContext('nobody').firestore(), `${STUDENTS}/1`)));
});

// ===== Round 7: cases closing mutation survivors found by the rules writer (build-mutations-4) =====
// q16 hasAll (R10): every one of the 11 keys is required.
test('ر13ط إنشاء طالب ينقصه name أو sid أو parentPhone أو stage مرفوض', async t => {
  for (const [i, key] of ['name', 'sid', 'parentPhone', 'stage'].entries()) {
    const id = 30 + i;
    const { [key]: _, ...data } = student(id, 'h1', 't1');
    await deny(t, `without ${key}`, setDoc(doc(teacherDb(), `${STUDENTS}/${id}`), data));
    assert.equal((await readRaw(`${STUDENTS}/${id}`)).exists(), false);
  }
});

// q16 (R13): lastDailyBase must be null at create.
test('ر13ي إنشاء طالب بـlastDailyBase بقيمة مرفوض', async t => {
  await deny(t, 'lastDailyBase value', setDoc(doc(teacherDb(), `${STUDENTS}/13`),
    { ...student(13, 'h1', 't1'), lastDailyBase: { surah: 2, ayah: 286, range: null } }));
  assert.equal((await readRaw(`${STUDENTS}/13`)).exists(), false);
});

// q17 (R16 + R17): the delete batch is a write, so it is refused in an archived season.
test('ر14ن دفعة حذف صحيحة لطالب حلقتي في الموسم المؤرشف مرفوضة', async t => {
  await seedArchivedSeason();
  const db = teacherDb();
  const real = (await readRaw(`${ARCHIVED}/students/20`)).data();
  const batch = writeBatch(db);
  batch.set(doc(db, `${ARCHIVED}/deletedStudents/${real.sid}`),
    { ...real, studentId: '20', deletedBy: 'teacher1', deletedAt: serverTimestamp() });
  batch.delete(doc(db, `${ARCHIVED}/students/20`));
  await deny(t, 'copy + delete in archived s2', batch.commit());
  assert.equal((await readRaw(`${ARCHIVED}/students/20`)).exists(), true);
  assert.equal((await readRaw(`${ARCHIVED}/deletedStudents/${real.sid}`)).exists(), false);
});

// q15/q15b (R1 + R5): a copy named after student A's sid but carrying student B's content and studentId.
test('ر14س نسخة باسم sid الطالب أ ومحتوى الطالب ب مع حذف ب مرفوضة', async t => {
  const db = teacherDb();
  const copyB = await copyOf(2);
  // Literal case: copy named sid-1 with B's content and studentId '2', B deleted in the batch.
  let batch = writeBatch(db);
  batch.set(doc(db, `${DELETED}/${sidOf(1)}`), copyB);
  batch.delete(doc(db, `${STUDENTS}/2`));
  await deny(t, 'sid-1 copy of B + delete B', batch.commit());
  // Full theoretical path: B gets its real copy too, and A is deleted with no copy of its own.
  batch = writeBatch(db);
  batch.set(doc(db, `${DELETED}/${sidOf(2)}`), copyB);
  batch.set(doc(db, `${DELETED}/${sidOf(1)}`), copyB);
  batch.delete(doc(db, `${STUDENTS}/1`));
  batch.delete(doc(db, `${STUDENTS}/2`));
  await deny(t, 'sid-1 copy of B + real copy of B + delete A and B', batch.commit());
  await assertUntouched(1);
  await assertUntouched(2);
});

// q15 (R5): the copy's document name must be the student's own sid.
test('ر14ع نسخة صحيحة باسم مستند sid مختلف عن sid الطالب مرفوضة', async t => {
  await deny(t, 'copy named sid-other', copyAndDelete(teacherDb(), 1, await copyOf(1), 'sid-other'));
  await assertUntouched(1, [sidOf(1), 'sid-other']);
});

// ===== Round 8: q20 (reviewer round 2, f6/f7 = probes C3/C4) and q21 =====
// q20 / f6 (guards R1): a new student carrying student 1's sid lends its copy to delete student 1 without a copy of its own.
test('ر14ف طالب جديد بـsid طالب آخر: نسخته + حذفه + حذف الأصلي في دفعة واحدة مرفوضة', async t => {
  const db = teacherDb();
  await assertSucceeds(setDoc(doc(db, `${STUDENTS}/20`), { ...student(20, 'h1', 't1'), sid: sidOf(1) }));
  const batch = writeBatch(db);
  batch.set(doc(db, `${DELETED}/${sidOf(1)}`), await copyOf(20));
  batch.delete(doc(db, `${STUDENTS}/20`));
  batch.delete(doc(db, `${STUDENTS}/1`));
  await deny(t, 'copy of 20 at sid-1 + delete 20 + delete 1', batch.commit());
  assert.equal((await readRaw(`${STUDENTS}/1`)).exists(), true);
  assert.equal((await readRaw(`${STUDENTS}/20`)).exists(), true);
  assert.equal((await readRaw(`${DELETED}/${sidOf(1)}`)).exists(), false);
});

// q20 / f7 (guards R2): an old copy (studentId '1', earlier deletedAt) must not open a later bare delete.
test('ر14ص حذف صحيح ثم إعادة إنشاء بالـsid نفسه ثم حذفه وحده مرفوض', async t => {
  await assertSucceeds(copyAndDelete(teacherDb(), 1, await copyOf(1)));
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), `${STUDENTS}/1`), student(1, 'h1', 't1')));
  await deny(t, 'delete recreated 1 alone', deleteDoc(doc(teacherDb(), `${STUDENTS}/1`)));
  assert.equal((await readRaw(`${STUDENTS}/1`)).exists(), true);
});

// q21: create refuses a sid that already has a copy in deletedStudents.
test('ر13ك إنشاء طالب صحيح بـsid له نسخة في deletedStudents مرفوض', async t => {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), `${DELETED}/${sidOf(40)}`),
    { ...student(40, 'h1', 't1'), studentId: '40', deletedBy: 'teacher1', deletedAt: 1 }));
  await deny(t, 'create with deleted sid', setDoc(doc(teacherDb(), `${STUDENTS}/40`), student(40, 'h1', 't1')));
  assert.equal((await readRaw(`${STUDENTS}/40`)).exists(), false);
});

// ===== New-paused card (2026-11-17), T11: newPaused is written by the admin only; rules stay unchanged =====
// Shape (Fable s1): newPaused = [{ reason: 'exam'|'circumstance', from: 'YYYY-MM-DD', to: null|'YYYY-MM-DD' }].
const PAUSED = Object.freeze([{ reason: 'exam', from: '2026-11-10', to: null }]);
const seedPaused = (id = 1) => env.withSecurityRulesDisabled(context =>
  updateDoc(doc(context.firestore(), `${STUDENTS}/${id}`), { newPaused: PAUSED.map(p => ({ ...p })) }));

test('ت11أ المعلم لا يضع newPaused لطالبه (تحديث يضيف الحقل) مرفوض', async t => {
  await deny(t, 'teacher adds newPaused', updateDoc(doc(teacherDb(), `${STUDENTS}/1`), { newPaused: [{ reason: 'exam', from: TODAY, to: null }] }));
  assert.equal('newPaused' in (await readRaw(`${STUDENTS}/1`)).data(), false);
});

test('ت11ب المعلم لا يرفع newPaused ولا يحذفه لطالب متوقف مرفوض', async t => {
  await seedPaused();
  await deny(t, 'teacher lifts newPaused', updateDoc(doc(teacherDb(), `${STUDENTS}/1`), { newPaused: [{ ...PAUSED[0], to: TODAY }] }));
  await deny(t, 'teacher deletes newPaused', updateDoc(doc(teacherDb(), `${STUDENTS}/1`), { newPaused: deleteField() }));
  await deny(t, 'teacher writes history + newPaused', updateDoc(doc(teacherDb(), `${STUDENTS}/1`), {
    [`history.${TODAY}.attended`]: true, newPaused: []
  }));
  assert.deepEqual((await readRaw(`${STUDENTS}/1`)).data().newPaused, PAUSED);
});

test('ت11ج المعلم لا ينشئ طالباً فيه newPaused مرفوض', async t => {
  await deny(t, 'create with newPaused', setDoc(doc(teacherDb(), `${STUDENTS}/30`), { ...student(30, 'h1', 't1'), newPaused: [{ reason: 'exam', from: TODAY, to: null }] }));
  assert.equal((await readRaw(`${STUDENTS}/30`)).exists(), false);
});

test('ت11د تحديث المعلم المقيّد (تسجيل اليوم، الاسم) لطالب فيه newPaused مقبول والحقل باقٍ كما هو', async () => {
  await seedPaused();
  const p = `history.${TODAY}.`;
  await assertSucceeds(updateDoc(doc(teacherDb(), `${STUDENTS}/1`), {
    [p + 'attended']: true, [p + 'hijri']: 'synthetic hijri', [p + 'absence']: deleteField(), [p + 'note']: deleteField(),
    [p + 'entries.e1']: { kind: 'review', surah: 1, from: 1, to: 7, points: 2, at: 1, by: 'teacher1', heardBy: 't1' },
    lastDailySurah: 1, lastDailyAyah: 7, lastDailySardRange: null
  }));
  await assertSucceeds(updateDoc(doc(teacherDb(), `${STUDENTS}/1`), { name: 'Synthetic renamed', tierId: deleteField(), tierManual: deleteField() }));
  const data = (await readRaw(`${STUDENTS}/1`)).data();
  assert.deepEqual(data.newPaused, PAUSED);
  assert.equal(data.history[TODAY].entries.e1.kind, 'review');
  assert.equal(data.name, 'Synthetic renamed');
});

test('ت11هـ المشرف يضع newPaused ويرفعه مقبول', async () => {
  await assertSucceeds(updateDoc(doc(adminDb(), `${STUDENTS}/1`), { newPaused: [{ reason: 'exam', from: TODAY, to: null }] }));
  assert.deepEqual((await readRaw(`${STUDENTS}/1`)).data().newPaused, [{ reason: 'exam', from: TODAY, to: null }]);
  await assertSucceeds(updateDoc(doc(adminDb(), `${STUDENTS}/1`), { newPaused: [{ reason: 'exam', from: '2026-11-10', to: TODAY }] }));
  assert.deepEqual((await readRaw(`${STUDENTS}/1`)).data().newPaused, [{ reason: 'exam', from: '2026-11-10', to: TODAY }]);
  await assertSucceeds(updateDoc(doc(adminDb(), `${STUDENTS}/3`), { newPaused: [{ reason: 'circumstance', from: TODAY, to: null }] }));
});

test('ت11و المعلم يقرأ طالب حلقته وفيه newPaused (get واستعلام in) مقبول والحقل في المقروء', async () => {
  await seedPaused();
  const one = await assertSucceeds(getDoc(doc(teacherDb(), `${STUDENTS}/1`)));
  assert.deepEqual(one.data().newPaused, PAUSED);
  const snap = await assertSucceeds(getDocs(query(collection(teacherDb(), STUDENTS), where('halaqaId', 'in', ['h1', 'h2']))));
  assert.deepEqual(snap.docs.find(d => d.id === '1').data().newPaused, PAUSED);
});

test('ت11ز المعلم يحذف طالباً متوقفاً بنسخة تحمل newPaused مقبول؛ ونسخة بلا الحقل مرفوضة', async t => {
  await seedPaused();
  const { newPaused, ...withoutField } = await copyOf(1);
  await deny(t, 'copy without newPaused', copyAndDelete(teacherDb(), 1, withoutField));
  await assertUntouched(1);
  await assertSucceeds(copyAndDelete(teacherDb(), 1, await copyOf(1)));
  assert.equal((await readRaw(`${STUDENTS}/1`)).exists(), false);
  assert.deepEqual((await readRaw(`${DELETED}/${sidOf(1)}`)).data().newPaused, PAUSED);
});
