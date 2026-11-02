const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const overlay = html.slice(html.indexOf('<div id="loginOverlay">'), html.indexOf('<!-- شاشة اختيار البرنامج -->'));

test('login screen keeps every id auth.js relies on', () => {
    for (const id of ['loginOverlay', 'loginForm', 'loginEmail', 'loginPassword', 'loginError', 'loginBtn', 'forgotBtn']) {
        assert.match(overlay, new RegExp(`id="${id}"`), id);
    }
    assert.match(overlay, /id="loginError" class="login-error hidden"/);
});

test('login screen uses the local association logo and brand line', () => {
    assert.match(overlay, /src="\.\/assets\/brand\/afdalkom-logo-vertical-color\.png"/);
    assert.ok(fs.existsSync(path.join(root, 'assets/brand/afdalkom-logo-vertical-color.png')));
    assert.doesNotMatch(overlay, /postimg/);
    assert.match(overlay, /data-program-brand/);
});

test('login card holds only the reference elements', () => {
    assert.doesNotMatch(overlay, /إظهار/);
    assert.doesNotMatch(overlay, /🕌/);
    assert.match(overlay, /<button type="submit" id="loginBtn" class="login-btn">دخول<\/button>/);
});

test('auth.js restores the new button label after a failed sign-in', () => {
    assert.match(auth, /btn\.textContent = 'دخول';/);
    assert.doesNotMatch(auth, /تسجيل الدخول'/);
});
