import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation, limitView, tableView } from './navigation.mjs';

function browser(previousSite = true) {
  const root = Number(previousSite);
  const entries = Array(root + 1).fill(null);
  let index = root;
  const listeners = new Set();
  let sequence = 0;
  return {
    crypto: { randomUUID: () => String(++sequence) },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    history: {
      get state() { return structuredClone(entries[index]); },
      replaceState(state) { entries[index] = structuredClone(state); },
      pushState(state) { entries.splice(++index, Infinity, structuredClone(state)); },
      go(delta) {
        if (index + delta < 0 || index + delta >= entries.length) return;
        index += delta;
        if (index >= root) listeners.forEach((fn) => fn({ state: this.state }));
      },
      back() { this.go(-1); },
      forward() { this.go(1); },
      get leftSite() { return previousSite && index === 0; },
      get canGoBack() { return index > 0; },
    },
  };
}
const screen = (step, changes) => ({ ...tableView(), step, ...changes });

test('Back visits each wizard step, Forward restores it, then Back can leave the table', () => {
  const host = browser();
  let view;
  const nav = createNavigation(host, (next) => { view = next; });
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  for (const step of [2, 1, 0]) {
    host.history.back();
    assert.equal(view.step, step);
    assert.equal(host.history.leftSite, false);
  }
  host.history.forward();
  assert.equal(view.step, 1);
  host.history.back();
  host.history.back();
  assert.equal(host.history.leftSite, true);
});

test('Back closes nested controls before changing steps; in-app Back does not create loops', () => {
  const host = browser();
  let view;
  const nav = createNavigation(host, (next) => { view = next; });
  nav.to(screen(1));
  nav.to(screen(1, { editing: 'pizza' }));
  host.history.back();
  assert.deepEqual(view, screen(1));
  nav.to(screen(2));
  nav.to(screen(3));
  nav.to(screen(3, { details: ['alex'] }));
  nav.to(screen(3, { details: ['alex'], shareOpen: true }));
  nav.to({ ...view, resetOpen: true });
  host.history.back();
  assert.equal(view.resetOpen, false);
  assert.equal(view.shareOpen, true);
  host.history.back();
  assert.equal(view.shareOpen, false);
  assert.deepEqual(view.details, ['alex']);
  host.history.back();
  assert.deepEqual(view, screen(3));
  nav.to(screen(1));
  assert.deepEqual(view, screen(1));
  host.history.back();
  assert.deepEqual(view, screen(0));
});

test('after New bill, stale Forward adds no empty table and one Back leaves the site', () => {
  const host = browser();
  let view;
  const nav = createNavigation(host, (next) => { view = next; });
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  nav.to(screen(3, { resetOpen: true }));
  nav.reset();
  assert.deepEqual(view, screen(0));
  const fresh = host.history.state;
  host.history.forward();
  assert.deepEqual(view, screen(0));
  assert.deepEqual(host.history.state, fresh);
  host.history.back();
  assert.equal(host.history.leftSite, true);
});

test('expired Forward jumps and repeated resets return to the same new-bill root', () => {
  const host = browser();
  let view;
  let changes = 0;
  const nav = createNavigation(host, (next) => { view = next; changes++; });
  for (let round = 0; round < 2; round++) {
    [1, 2, 3].forEach((step) => nav.to(screen(step)));
    nav.to(screen(3, { resetOpen: true }));
    nav.reset();
    const fresh = host.history.state;
    for (const distance of [1, 3, 4, 1]) {
      const before = changes;
      host.history.go(distance);
      assert.deepEqual(host.history.state, fresh);
      assert.deepEqual(view, screen(0));
      assert.equal(changes, before + 1, 'expired controls are never emitted');
    }
  }
  host.history.back();
  assert.equal(host.history.leftSite, true);
  host.history.forward();
  assert.deepEqual(view, screen(0));
  nav.to(screen(1));
  host.history.back();
  assert.deepEqual(view, screen(0));
  host.history.back();
  assert.equal(host.history.leftSite, true);
});

test('reset and expired Forward preserve a predecessor-free app root', () => {
  const host = browser(false);
  let view;
  const nav = createNavigation(host, (next) => { view = next; });
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  nav.to(screen(3, { resetOpen: true }));
  nav.reset();
  const fresh = host.history.state;
  host.history.forward();
  assert.deepEqual(host.history.state, fresh);
  assert.deepEqual(view, screen(0));
  assert.equal(host.history.canGoBack, false, 'no extra Back stop blocks native exit');
});

test('a reset from an earlier step collapses a remaining Forward branch, including after reload', () => {
  const host = browser();
  let view;
  let nav = createNavigation(host, (next) => { view = next; });
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  nav.to(screen(1));
  nav.reset(); // A draft update in another tab can reset without opening a dialog.
  nav.destroy();
  nav = createNavigation(host, (next) => { view = next; });
  const fresh = host.history.state;
  host.history.go(3);
  assert.deepEqual(host.history.state, fresh);
  assert.deepEqual(view, screen(0));
  host.history.back();
  assert.equal(host.history.leftSite, true);
});

test('a fresh load on an expired step can Back to the newer root and keep navigating', () => {
  for (const previousSite of [true, false]) {
    const host = browser(previousSite);
    let view;
    let maxStep = 3;
    const normalize = (next) => ({ ...next, step: Math.min(next.step, maxStep) });
    let nav = createNavigation(host, (next) => { view = next; }, normalize);
    [1, 2, 3].forEach((step) => nav.to(screen(step)));
    nav.reset();
    const fresh = host.history.state;
    nav.destroy();
    // Session restore / a fresh document can initialize on an expired entry
    // without the old document's popstate listener having bounced it back.
    host.history.forward();
    maxStep = 0;
    nav = createNavigation(host, (next) => { view = next; }, normalize);
    host.history.back();
    assert.deepEqual(host.history.state, fresh, 'the newer root is not skipped');
    assert.deepEqual(view, screen(0));
    assert.equal(host.history.leftSite, false);
    maxStep = 3;
    nav.to(screen(1));
    assert.deepEqual(view, screen(1), 'no out-of-range traversal leaves navigation busy');
    host.history.back();
    assert.deepEqual(view, screen(0));
    assert.equal(host.history.canGoBack, previousSite);
    nav.destroy();
  }
});

test('switching an editor in place lets Back cancel editing rather than reopen another item', () => {
  const host = browser();
  let view;
  const nav = createNavigation(host, (next) => { view = next; });
  nav.to(screen(1));
  nav.to(screen(1, { editing: 'pizza' }));
  nav.replace(screen(1, { editing: 'pasta' }));
  host.history.back();
  assert.deepEqual(view, screen(1));
});

test('switching between breakdown and manual copy leaves just one dismissible control', () => {
  const host = browser();
  let view;
  const nav = createNavigation(host, (next) => { view = next; });
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  nav.to(screen(3, { details: ['alex'] }));
  nav.replace(screen(3, { shareOpen: true }));
  assert.deepEqual(view.details, []);
  nav.replace(screen(3, { details: ['bea'] }));
  assert.equal(view.shareOpen, false);
  nav.to(screen(3));
  host.history.back();
  assert.deepEqual(view, screen(2));
});

test('reload retains usable navigation; Forward is validated against the latest bill', () => {
  const host = browser();
  let view;
  let limit = 3;
  const normalize = (next) => ({ ...next, step: Math.min(next.step, limit) });
  let nav = createNavigation(host, (next) => { view = next; }, normalize);
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  nav.destroy();
  nav = createNavigation(host, (next) => { view = next; }, normalize);
  assert.equal(view.step, 3);
  nav.to(screen(1));
  limit = 1; // Items were deleted or tax/tip became invalid.
  host.history.forward();
  assert.equal(view.step, 1);
  host.history.forward();
  assert.equal(view.step, 1);
});

test('Forward cannot skip a typed person or item, and saved content remains reachable', () => {
  const host = browser();
  const bill = { people: [{ id: 'a' }, { id: 'b' }], items: [{ id: 'pizza', people: ['a'] }], tax: '', tip: '18', tipMode: 'percent' };
  const inputs = { personName: '', itemName: '', itemPrice: '' };
  let view;
  const nav = createNavigation(host, (next) => { view = next; }, (next) => limitView(next, bill, inputs));
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  nav.to(screen(0));
  inputs.personName = 'Cam';
  host.history.forward();
  assert.equal(view.step, 0);
  inputs.personName = '';
  nav.to(screen(1));
  inputs.itemName = 'Fries';
  host.history.forward();
  assert.equal(view.step, 1);
  inputs.itemName = '';
  inputs.itemPrice = '9';
  assert.equal(limitView(screen(3), bill, inputs).step, 1);
  inputs.itemPrice = '';
  nav.to(screen(2));
  nav.to(screen(3));
  assert.equal(view.step, 3);
});
