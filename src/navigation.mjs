import { moneyInput, percentage } from './split.mjs';

export const tableView = () => ({ step: 0, resetOpen: false, editing: null, details: [], shareOpen: false });

export function limitView(view, bill, inputs) {
  const extrasValid = (bill.tax === '' || moneyInput(bill.tax) !== null)
    && (bill.tip === '' || (bill.tipMode === 'percent' ? percentage(bill.tip) : moneyInput(bill.tip)) !== null);
  const maxStep = bill.people.length < 2 || inputs.personName.trim() ? 0
    : !bill.items.length || !extrasValid || inputs.itemName.trim() || inputs.itemPrice ? 1
    : bill.items.some((item) => !item.people.length) ? 2 : 3;
  const step = Math.min(view.step, maxStep);
  return { ...view, step, editing: step === 1 && bill.items.some((item) => item.id === view.editing) ? view.editing : null,
    details: step === 3 ? view.details.filter((id) => bill.people.some((person) => person.id === id)) : [],
    shareOpen: step === 3 && view.shareOpen };
}

const validView = (view) => view && Number.isInteger(view.step) && view.step >= 0 && view.step <= 3
  && typeof view.resetOpen === 'boolean' && (view.editing === null || typeof view.editing === 'string')
  && Array.isArray(view.details) && view.details.every((id) => typeof id === 'string')
  && typeof view.shareOpen === 'boolean';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Each screen or open control is a real history entry, not a Back-button trap.
// Trails let in-app Back/step links reuse earlier entries, even after a reload.
export function createNavigation(host, onChange, normalize = (view) => view) {
  const key = 'splitNavigation';
  const read = (state) => {
    const saved = state?.[key];
    return saved && typeof saved.id === 'string' && Array.isArray(saved.trail)
      && saved.trail.length && saved.trail.every(validView) ? saved : null;
  };
  let entry = read(host.history.state) || { id: host.crypto.randomUUID(), trail: [tableView()] };
  let restarting = false;
  let busy = false;
  const view = () => entry.trail.at(-1);
  const replace = () => host.history.replaceState({ ...host.history.state, [key]: entry }, '');
  const emit = (previous) => onChange(view(), previous);
  entry.trail = entry.trail.map(normalize);
  replace();

  function startOver(previous) {
    entry = { id: host.crypto.randomUUID(), trail: [tableView()] };
    replace();
    emit(previous);
  }
  function pop(event) {
    const previous = view();
    busy = false;
    if (restarting) {
      restarting = false;
      startOver(previous);
      return;
    }
    const incoming = read(event.state);
    // replaceState cannot remove Forward history. Leave an expired entry intact
    // and traverse back to the new bill's root instead of turning it into a
    // second empty table (which would consume an extra Back press). Its trail
    // also handles jumping several entries ahead via the browser history menu.
    // Always accept a root: after a fresh load on an expired step, Back must
    // reach the newer bill's root rather than skip it (or traverse out of range).
    if (incoming && incoming.id !== entry.id && incoming.trail.length > 1) {
      busy = true;
      host.history.go(1 - incoming.trail.length);
      return;
    }
    if (!incoming) {
      entry.trail = [tableView()];
    } else {
      entry = { ...incoming, trail: incoming.trail.map(normalize) };
    }
    replace();
    emit(previous);
  }
  host.addEventListener('popstate', pop);
  emit(null);

  return {
    replace(next) {
      if (busy) return;
      const previous = view();
      entry = { ...entry, trail: [...entry.trail.slice(0, -1), normalize(next)] };
      replace();
      emit(previous);
    },
    to(next) {
      if (busy) return;
      next = normalize(next);
      if (same(next, view())) return;
      const previous = view();
      const earlier = entry.trail.findLastIndex((candidate) => same(candidate, next));
      if (earlier !== -1) {
        busy = true;
        host.history.go(earlier - entry.trail.length + 1);
      } else {
        entry = { ...entry, trail: [...entry.trail, next] };
        host.history.pushState({ [key]: entry }, '');
        emit(previous);
      }
    },
    reset() {
      if (restarting) return;
      const distance = entry.trail.length - 1;
      if (distance) {
        restarting = busy = true;
        host.history.go(-distance);
      } else {
        startOver(view());
      }
    },
    destroy() { host.removeEventListener('popstate', pop); },
  };
}
