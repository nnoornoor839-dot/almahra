// Synthetic data only. From the repository root:
// firebase emulators:exec --only firestore --project demo-almahra-rules "node --test tests/rules"
const { before, beforeEach, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const {
  initializeTestEnvironment, assertSucceeds, assertFails
} = require('@firebase/rules-unit-testing');
const {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch
} = require('firebase/firestore');

const projectId = 'demo-almahra-rules';
const programs = ['general', 'summer', 'review-day'];
const levels = ['program', 'season', 'student'];
const paths = program => [
  `programs/${program}`,
  `programs/${program}/seasons/s1`,
  `programs/${program}/seasons/s1/students/1`
];
const oldPaths = ['events/old', 'events/old/students/1', 'students/1', 'test_students/1'];
const unknownPath = 'programs/general/seasons/s1/knightsLog/x';
let env;

before(async () => {
  assert.ok(projectId.startsWith('demo-'));
  // Never accept a remote host or a real project supplied by the environment.
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
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/admin'), { role: 'admin', name: 'Synthetic admin' });
    batch.set(doc(db, 'users/member'), { role: 'member', name: 'Synthetic member' });
    batch.set(doc(db, 'users/other'), { role: 'member', name: 'Synthetic other' });
    for (const program of programs) {
      const [programPath, seasonPath, studentPath] = paths(program);
      batch.set(doc(db, programPath), { name: program, activeSeasonId: 's1' });
      batch.set(doc(db, seasonPath), { name: 'Synthetic season', status: 'active' });
      batch.set(doc(db, studentPath), { name: 'Synthetic student', points: 0 });
    }
    for (const path of [...oldPaths, unknownPath]) {
      batch.set(doc(db, path), { synthetic: true });
    }
    await batch.commit();
  });
});

after(async () => {
  if (env) await env.cleanup();
});

for (const [level, path] of paths('general').entries()) {
  test(`admin can create, update and delete general ${levels[level]}`, async () => {
    // Remove only this fixture with rules disabled so setDoc tests creation.
    await env.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), path)));
    const ref = doc(env.authenticatedContext('admin').firestore(), path);
    await assertSucceeds(setDoc(ref, { synthetic: true, value: 1 }));
    await assertSucceeds(updateDoc(ref, { value: 2 }));
    assert.equal((await assertSucceeds(getDoc(ref))).data().value, 2);
    await assertSucceeds(deleteDoc(ref));
    assert.equal((await assertSucceeds(getDoc(ref))).exists(), false);
  });
}

test('admin can create general and its first season in one batch', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    // A genuinely absent program and season, as on first initialization.
    for (const path of paths('general')) batch.delete(doc(db, path));
    await batch.commit();
  });
  const db = env.authenticatedContext('admin').firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'programs/general'), { name: 'Synthetic general', activeSeasonId: 's1' });
  batch.set(doc(db, 'programs/general/seasons/s1'), { name: 'Synthetic first season', status: 'active', measure: '1441' });
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, 'programs/general'))).data().activeSeasonId, 's1');
  assert.equal((await getDoc(doc(db, 'programs/general/seasons/s1'))).exists(), true);
});

for (const program of ['summer', 'review-day']) {
  for (const [level, path] of paths(program).entries()) {
    test(`admin cannot create, update or delete ${program} ${levels[level]}`, async () => {
      const db = env.authenticatedContext('admin').firestore();
      const ref = doc(db, path);
      await assertFails(updateDoc(ref, { forbidden: true }));
      await assertFails(deleteDoc(ref));
      await env.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), path)));
      await assertFails(setDoc(ref, { synthetic: true }));
      await env.withSecurityRulesDisabled(async context => {
        assert.equal((await getDoc(doc(context.firestore(), path))).exists(), false);
      });
    });
  }
}

test('a mixed general and summer batch fails atomically', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'programs/general'), { name: 'Must not persist' });
  batch.update(doc(db, 'programs/summer'), { name: 'Must not persist' });
  await assertFails(batch.commit());
  for (const program of ['general', 'summer']) {
    assert.equal((await getDoc(doc(db, `programs/${program}`))).data().name, program);
  }
});

for (const program of programs) {
  test(`admin can read all three ${program} levels and list students`, async () => {
    const db = env.authenticatedContext('admin').firestore();
    for (const path of paths(program)) {
      assert.equal((await assertSucceeds(getDoc(doc(db, path)))).exists(), true);
    }
    const students = await assertSucceeds(getDocs(collection(db, `programs/${program}/seasons/s1/students`)));
    assert.deepEqual(students.docs.map(student => student.id), ['1']);
  });
}

for (const identity of ['member', 'visitor']) {
  for (const program of programs) {
    test(`${identity} cannot read or write any ${program} level or list students`, async () => {
      const db = (identity === 'member' ? env.authenticatedContext('member') : env.unauthenticatedContext()).firestore();
      for (const path of paths(program)) {
        const ref = doc(db, path);
        await assertFails(getDoc(ref));
        await assertFails(updateDoc(ref, { forbidden: true }));
        await assertFails(deleteDoc(ref));
      }
      await assertFails(getDocs(collection(db, `programs/${program}/seasons/s1/students`)));
      await env.withSecurityRulesDisabled(async context => {
        const seedDb = context.firestore();
        const batch = writeBatch(seedDb);
        for (const path of paths(program)) batch.delete(doc(seedDb, path));
        await batch.commit();
      });
      for (const path of paths(program)) {
        await assertFails(setDoc(doc(db, path), { synthetic: true }));
      }
    });
  }
}

test('a member can read only their own user document and cannot write users', async () => {
  const db = env.authenticatedContext('member').firestore();
  await assertSucceeds(getDoc(doc(db, 'users/member')));
  await assertFails(getDoc(doc(db, 'users/other')));
  await assertFails(getDoc(doc(db, 'users/admin')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(setDoc(doc(db, 'users/new-user'), { role: 'admin' }));
  await assertFails(updateDoc(doc(db, 'users/member'), { role: 'admin' }));
  await assertFails(deleteDoc(doc(db, 'users/member')));
});

test('an admin can read, list, create, update and delete users', async () => {
  const db = env.authenticatedContext('admin').firestore();
  await assertSucceeds(getDoc(doc(db, 'users/other')));
  assert.equal((await assertSucceeds(getDocs(collection(db, 'users')))).size, 3);
  const ref = doc(db, 'users/new-user');
  await assertSucceeds(setDoc(ref, { role: 'member' }));
  await assertSucceeds(updateDoc(ref, { name: 'Synthetic new user' }));
  await assertSucceeds(deleteDoc(ref));
});

test('a visitor cannot read, list or write users', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'users/member')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(setDoc(doc(db, 'users/new-user'), { role: 'member' }));
  await assertFails(updateDoc(doc(db, 'users/member'), { role: 'admin' }));
  await assertFails(deleteDoc(doc(db, 'users/member')));
});

for (const path of [...oldPaths, unknownPath]) {
  test(`admin is denied at closed or undefined path ${path}`, async () => {
    const db = env.authenticatedContext('admin').firestore();
    const ref = doc(db, path);
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, path.slice(0, path.lastIndexOf('/')))));
    await assertFails(updateDoc(ref, { forbidden: true }));
    await assertFails(deleteDoc(ref));
    await env.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), path)));
    await assertFails(setDoc(ref, { synthetic: true }));
  });
}
