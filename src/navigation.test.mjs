import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation, tableView } from './navigation.mjs';

function browser() {
  const entries = [null, null]; // Arrived from another site.
  let index = 1;
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
        if (index) listeners.forEach((fn) => fn({ state: this.state }));
      },
      back() { this.go(-1); },
      forward() { this.go(1); },
      get leftSite() { return index === 0; },
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

test('reset collapses old history, and stale Forward never restores an old bill view', () => {
  const host = browser();
  let view;
  const nav = createNavigation(host, (next) => { view = next; });
  [1, 2, 3].forEach((step) => nav.to(screen(step)));
  nav.to(screen(3, { resetOpen: true }));
  nav.reset();
  assert.deepEqual(view, screen(0));
  host.history.forward();
  assert.deepEqual(view, screen(0));
  host.history.back();
  host.history.back();
  assert.equal(host.history.leftSite, true);
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
