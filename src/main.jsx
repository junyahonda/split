import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, Copy, Hash, Leaf, Plus, ReceiptText, RotateCcw, ShieldCheck, Sparkles, Trash2, Users, X } from 'lucide-react';
import { calculate, moneyInput, percentage, validDraft } from './split.mjs';
import { createNavigation, limitView, tableView } from './navigation.mjs';
import './style.css';

const STORAGE = 'split.bill.v1';
const blankBill = () => ({ version: 1, title: '', currency: 'USD', people: [], items: [], tax: '', tip: '18', tipMode: 'percent' });
const uid = () => crypto.randomUUID();
const steps = ['The table', 'The bill', 'Who had what', 'The split'];

function load() {
  try { const draft = JSON.parse(localStorage.getItem(STORAGE)); return validDraft(draft) ? draft : blankBill(); }
  catch { return blankBill(); }
}

function App() {
  const [bill, setBill] = useState(load);
  const [view, setView] = useState(tableView);
  const { step, resetOpen, editing, details, shareOpen } = view;
  const [personName, setPersonName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [feedback, setFeedback] = useState({ message: '' });
  const error = feedback.message;
  // A fresh object also re-announces and reveals an unchanged retry error.
  const setError = (message) => setFeedback({ message });
  const [notice, setNotice] = useState('');
  const [storageOk, setStorageOk] = useState(true);
  const heading = useRef(null);
  const personInput = useRef(null);
  const itemInput = useRef(null);
  const errorAlert = useRef(null);
  const pageActions = useRef(null);
  const navigation = useRef(null);
  const latestBill = useRef(bill);
  latestBill.current = bill;
  const latestInputs = useRef(null);
  latestInputs.current = { personName, itemName, itemPrice };
  const money = (cents) => new Intl.NumberFormat(undefined, { style: 'currency', currency: bill.currency }).format(cents / 100);
  const patch = (values) => { setBill((old) => ({ ...old, ...values })); setError(''); setNotice(''); };
  useEffect(() => {
    navigation.current = createNavigation(window, (next) => {
      setView(next); setError(''); setNotice('');
    }, (next) => limitView(next, latestBill.current, latestInputs.current));
    return () => navigation.current.destroy();
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(bill)); setStorageOk(true); } catch { setStorageOk(false); } }, [bill]);
  useEffect(() => {
    function syncDraft(event) {
      if (event.key !== STORAGE && event.key !== null) return;
      try {
        const incoming = event.newValue ? JSON.parse(event.newValue) : blankBill();
        if (!validDraft(incoming)) return;
        setBill(incoming);
        latestBill.current = incoming;
        navigation.current.reset(); setPersonName(''); setItemName(''); setItemPrice('');
        setError('');
        setNotice('This bill was updated in another tab. You’re seeing the latest version.');
      } catch { /* Ignore invalid drafts from another tab. */ }
    }
    window.addEventListener('storage', syncDraft);
    return () => window.removeEventListener('storage', syncDraft);
  }, []);
  useEffect(() => {
    const item = bill.items.find((item) => item.id === editing);
    setItemName(item?.name || ''); setItemPrice(item ? (item.cents / 100).toFixed(2) : '');
    if (item) itemInput.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!resetOpen) return;
    const escape = (event) => { if (event.key === 'Escape') navigate({ resetOpen: false }); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [resetOpen]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (!error) return;
    errorAlert.current?.focus({ preventScroll: true });
    errorAlert.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [feedback]);
  useEffect(() => {
    if (step !== 1 || bill.tipMode !== 'amount') return;
    let frame;
    function revealActions() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.activeElement;
        if (input?.id !== 'tip' || !pageActions.current) return;
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop || 0;
        const bottom = top + (viewport?.height || window.innerHeight);
        const overflow = pageActions.current.getBoundingClientRect().bottom - bottom + 12;
        const room = input.getBoundingClientRect().top - top - 12;
        // Keep the amount and next action visible together when the IME opens.
        if (overflow > 0 && room > 0) window.scrollBy({ top: Math.min(overflow, room), behavior: 'instant' });
      });
    }
    window.addEventListener('focusin', revealActions);
    window.addEventListener('resize', revealActions);
    window.visualViewport?.addEventListener('resize', revealActions);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('focusin', revealActions);
      window.removeEventListener('resize', revealActions);
      window.visualViewport?.removeEventListener('resize', revealActions);
    };
  }, [step, bill.tipMode]);

  function navigate(updates) { navigation.current.to({ ...view, ...updates }); }
  function go(next) { navigation.current.to({ ...tableView(), step: next }); }
  function openControl(updates) {
    const next = { ...tableView(), step, ...updates };
    if (editing || details.length || shareOpen) navigation.current.replace(next);
    else navigation.current.to(next);
  }
  function toggleDetails(id) {
    if (details.includes(id)) navigate({ details: [] });
    else openControl({ details: [id] });
  }
  function addPerson(event) {
    event.preventDefault();
    const name = personName.trim();
    if (!name) return setError('Enter a name for your table.');
    if (bill.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) return setError('That name is already at the table. Try a nickname.');
    if (bill.people.length >= 30) return setError('This table is full — up to 30 people per bill.');
    patch({ people: [...bill.people, { id: uid(), name }] });
    setPersonName(''); personInput.current?.focus();
  }
  function removePerson(id) {
    patch({ people: bill.people.filter((p) => p.id !== id), items: bill.items.map((i) => ({ ...i, people: i.people.filter((p) => p !== id) })) });
  }
  function addItem(event) {
    event.preventDefault();
    const name = itemName.trim(); const cents = moneyInput(itemPrice);
    if (!name) return setError('Give this item a name.');
    if (/^\d+(\.\d+)?$/.test(itemPrice.trim()) && Number(itemPrice) > 9999999.99) return setError(`Enter a line total no higher than ${money(999999999)}.`);
    if (/^\d+\.\d{3,}$/.test(itemPrice.trim())) return setError('Use at most two decimal places for the item price.');
    if (cents === null || cents <= 0) return setError('Enter a price above zero, with up to two decimal places.');
    if (!editing && bill.items.length >= 200) return setError('You can add up to 200 items to a bill.');
    patch({ items: editing ? bill.items.map((i) => i.id === editing ? { ...i, name, cents } : i) : [...bill.items, { id: uid(), name, cents, people: [] }] });
    if (editing) navigate({ editing: null });
    setItemName(''); setItemPrice(''); itemInput.current?.focus();
  }
  function toggle(itemId, personId) {
    patch({ items: bill.items.map((item) => item.id !== itemId ? item : { ...item, people: item.people.includes(personId) ? item.people.filter((id) => id !== personId) : [...item.people, personId] }) });
  }
  const subtotal = bill.items.reduce((sum, i) => sum + i.cents, 0);
  const unassigned = bill.items.filter((item) => item.people.length === 0).length;
  let result;
  try { result = calculate(bill); } catch { /* Incomplete bills are expected while editing. */ }
  function next() {
    if (step === 0 && personName.trim()) return setError('Tap + to add this person before continuing.');
    if (step === 0 && bill.people.length < 2) return setError('Add at least two people to split a bill.');
    if (step === 1 && (itemName.trim() || itemPrice)) return setError('Add or save your item before continuing.');
    if (step === 1 && !bill.items.length) return setError('Add at least one item from your bill.');
    if (step === 1 && ((bill.tax !== '' && moneyInput(bill.tax) === null) || (bill.tip !== '' && (bill.tipMode === 'percent' ? percentage(bill.tip) : moneyInput(bill.tip)) === null))) return setError('Check tax and tip. Use positive amounts with up to two decimal places; tip percentages can be 0–100.');
    if (step === 2 && unassigned) return setError(`Choose who had each item. ${unassigned} ${unassigned === 1 ? 'item still needs' : 'items still need'} a person.`);
    go(step + 1);
  }
  const summary = result ? `${bill.title || 'Our bill'}\n\n${result.shares.map((p) => `${p.name}: ${money(p.total)} (food ${money(p.subtotal)} + tax ${money(p.tax)} + tip ${money(p.tip)})`).join('\n')}\n\nTotal: ${money(result.total)}\nSplit with https://split.junyahonda.com` : '';
  async function copySummary() {
    try { await navigator.clipboard.writeText(summary); setNotice('Copied! Paste it into your group chat.'); }
    catch { openControl({ shareOpen: true }); setNotice('Select and copy the summary below.'); }
  }
  function reset() { const empty = blankBill(); latestBill.current = empty; setBill(empty); setPersonName(''); setItemName(''); setItemPrice(''); navigation.current.reset(); }
  return <>
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Split home" onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); go(0); } }}><span className="brand-icon"><Hash size={24} strokeWidth={2.6}/></span>split<span className="brand-dot">.</span></a>
        <button className="quiet-button" onClick={() => navigate({ resetOpen: true })}><RotateCcw size={15}/> New bill</button>
      </header>
      <main>
        <div className="intro-kicker"><span className="tiny-dot"/> GOOD FOOD. FAIR SHARES.</div>
        <nav className="stepper" aria-label="Bill progress">{steps.map((name, index) => <button key={name} className={`step ${step === index ? 'active' : ''} ${step > index ? 'complete' : ''}`} disabled={index > step} aria-current={index === step ? 'step' : undefined} onClick={() => go(index)}><span>{step > index ? <Check size={14}/> : `0${index + 1}`}</span><small>{name}</small></button>)}</nav>
        <section className="page-content">
          <div className="page-heading">
            <span className="eyebrow">{['FIRST, YOUR PEOPLE', 'A LITTLE RECEIPT WORK', 'TAP. SHARE. REPEAT.', 'ALL SQUARED UP'][step]}</span>
            <h1 ref={heading} tabIndex={-1}>{[<>Who’s at{' '}<br/>the table?</>, <>What’s on{' '}<br/>the bill?</>, <>Who had{' '}<br/>what?</>, <>Good times.{' '}<br/><span className="green-text">Fair shares.</span></>][step]}</h1>
            <p>{['Round up your people. We’ll handle the math.', 'Add each item, then the tax and tip.', 'Tap a name for each item. Shared something? Tap everyone who had it.', 'Just what you had, plus your share of tax and tip. Every cent accounted for.'][step]}</p>
          </div>
          {step === 0 && <>
            <div className="card table-card">
              <div className="card-top"><span className="section-label"><Users size={17}/> YOUR TABLE</span><span className="count-badge">{bill.people.length} {bill.people.length === 1 ? 'person' : 'people'}</span></div>
              <form className="person-form" onSubmit={addPerson}>
                <label className="sr-only" htmlFor="person">Person’s name</label>
                <input id="person" ref={personInput} placeholder="Add a name…" maxLength={30} value={personName} onChange={(e) => { setPersonName(e.target.value); setError(''); }} autoComplete="off"/>
                <button className="add-button" type="submit" aria-label="Add person"><Plus size={23}/></button>
              </form>
              {bill.people.length ? <div className="people-list">{bill.people.map((person, index) => <div className="person-row" key={person.id}><span className={`avatar color-${index % 5}`}>{person.name.slice(0, 1).toUpperCase()}</span><span>{person.name}</span><button className="icon-button" aria-label={`Remove ${person.name}`} onClick={() => removePerson(person.id)}><X size={17}/></button></div>)}</div> : <div className="empty-table"><div className="table-drawing" aria-hidden="true"><span/><span/><span/><span/><div><Leaf size={25}/></div></div><p>There’s room for everyone.</p><small>Add yourself and your dining companions.</small></div>}
              <div className="hint"><Sparkles size={15}/> Shared plates? You can split those too.</div>
            </div>
            <div className="card settings-card"><label htmlFor="title">Give the bill a name <span>optional</span></label><input id="title" value={bill.title} maxLength={60} onChange={(e) => patch({ title: e.target.value })} placeholder="Friday night dinner"/><div className="currency-row"><label htmlFor="currency">Currency</label><select id="currency" value={bill.currency} onChange={(e) => patch({ currency: e.target.value })}>{['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD'].map((c) => <option key={c} value={c}>{c}</option>)}</select></div></div>
          </>}
          {step === 1 && <>
            <div className="card items-card"><div className="card-top"><span className="section-label"><ReceiptText size={17}/> THE ITEMS</span><span className="count-badge">{bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}</span></div>
              {bill.items.map((item) => <div className="bill-item" key={item.id}><div><strong>{item.name}</strong><button className="text-button" aria-label={`Edit ${item.name}`} onClick={() => openControl({ editing: item.id })}>Edit</button></div><span className="amount">{money(item.cents)}</span><button className="icon-button" aria-label={`Delete ${item.name}`} onClick={() => { patch({ items: bill.items.filter((i) => i.id !== item.id) }); if (editing === item.id) navigate({ editing: null }); }}><Trash2 size={16}/></button></div>)}
              <form onSubmit={addItem} className="item-form"><div><label htmlFor="item">Item name</label><input id="item" ref={itemInput} value={itemName} maxLength={60} placeholder="e.g. Margherita pizza" onChange={(e) => { setItemName(e.target.value); setError(''); }}/></div><div><label htmlFor="price">Line total</label><input id="price" inputMode="decimal" value={itemPrice} placeholder="0.00" onChange={(e) => { setItemPrice(e.target.value); setError(''); }}/></div><button type="submit" className="secondary-button"><Plus size={17}/>{editing ? 'Save item' : 'Add item'}</button>{editing && <button type="button" className="text-button" onClick={() => navigate({ editing: null })}>Cancel edit</button>}</form>
              <div className="subtotal-row"><span>Food & drinks</span><strong>{money(subtotal)}</strong></div>
            </div>
            <div className="card extras-card"><div className="section-label">THE LITTLE EXTRAS</div><label htmlFor="tax">Tax <span>amount from your receipt</span></label><input id="tax" inputMode="decimal" value={bill.tax} placeholder="0.00" onChange={(e) => patch({ tax: e.target.value })}/><div className="tip-label"><label htmlFor="tip">Tip</label><div className="segmented" aria-label="Tip type">
              <button aria-pressed={bill.tipMode === 'percent'} className={bill.tipMode === 'percent' ? 'selected' : ''} onClick={() => { if (bill.tipMode !== 'percent') patch({ tipMode: 'percent', tip: '18' }); }}>Percent</button>
              <button aria-pressed={bill.tipMode === 'amount'} className={bill.tipMode === 'amount' ? 'selected' : ''} onClick={() => { if (bill.tipMode !== 'amount') patch({ tipMode: 'amount', tip: '' }); }}>Amount</button>
            </div></div><div className="tip-input"><input id="tip" inputMode="decimal" value={bill.tip} placeholder="0" onChange={(e) => patch({ tip: e.target.value })}/><span>{bill.tipMode === 'percent' ? '%' : bill.currency}</span></div>{bill.tipMode === 'percent' && <div className="tip-presets">{[0, 15, 18, 20, 25].map((n) => <button aria-pressed={bill.tip === String(n)} className={bill.tip === String(n) ? 'chosen' : ''} onClick={() => patch({ tip: String(n) })} key={n}>{n}%</button>)}</div>}<p className="small-note">Tip is calculated before tax. Both are shared in proportion to what each person had.</p></div>
          </>}
          {step === 2 && <>
            <div className="assignment-status"><span><CircleCheck size={17}/>{bill.items.length - unassigned} of {bill.items.length} assigned</span><span>{money(subtotal)}</span></div>
            {bill.items.map((item, index) => <div className={`card assign-card ${!item.people.length ? 'needs-person' : ''}`} key={item.id}><div className="assign-heading"><span className="item-number">{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong><span className="amount">{money(item.cents)}</span></div><div className="person-chips">{bill.people.map((person, pIndex) => <button key={person.id} aria-pressed={item.people.includes(person.id)} onClick={() => toggle(item.id, person.id)} className={`person-chip ${item.people.includes(person.id) ? 'is-selected' : ''}`}><span className={`mini-avatar color-${pIndex % 5}`}>{person.name.slice(0, 1).toUpperCase()}</span>{person.name}{item.people.includes(person.id) && <Check size={14}/>}</button>)}</div><div className="assign-bottom"><small>{item.people.length ? item.people.length > 1 ? `Shared equally between ${item.people.length} people` : 'All theirs' : 'Choose who had this'}</small><button className="text-button" onClick={() => patch({ items: bill.items.map((i) => i.id === item.id ? { ...i, people: bill.people.map((p) => p.id) } : i) })}>Everyone</button></div></div>)}
            <p className="small-note">Shared items are split equally among the selected people.</p>
          </>}
          {step === 3 && result && <>
            <div className="receipt-total"><div className="receipt-total-top"><span><ReceiptText size={16}/>{bill.title || 'Your table’s total'}</span><span>{bill.currency}</span></div><div className="grand-total">{money(result.total)}</div><div className="receipt-meta"><span>{bill.people.length} people</span><span>•</span><span>{bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}</span><span className="balanced"><Check size={13}/> Balanced to the cent</span></div></div>
            <div className="shares">{result.shares.map((person, index) => <details className="card share-card" key={person.id} open={details.includes(person.id)}><summary onClick={(event) => { event.preventDefault(); toggleDetails(person.id); }}><span className={`avatar color-${index % 5}`}>{person.name.slice(0, 1).toUpperCase()}</span><span className="share-name">{person.name}<small>{person.items.length} {person.items.length === 1 ? 'item' : 'items'}</small></span><strong>{money(person.total)}</strong><ChevronDown className="chevron" size={19}/></summary><div className="share-breakdown">{person.items.map((item, i) => <div key={i}><span>{item.name}{item.shared && <small> shared</small>}</span><span>{money(item.cents)}</span></div>)}<div className="breakdown-subtotal"><span>Food & drinks</span><span>{money(person.subtotal)}</span></div><div><span>Tax</span><span>{money(person.tax)}</span></div><div><span>Tip</span><span>{money(person.tip)}</span></div></div></details>)}</div>
            <div className="bill-totals"><div><span>Food & drinks</span><span>{money(result.subtotal)}</span></div><div><span>Tax</span><span>{money(result.tax)}</span></div><div><span>Tip{bill.tipMode === 'percent' ? ` (${bill.tip || '0'}%)` : ''}</span><span>{money(result.tip)}</span></div><div className="total-line"><strong>Total</strong><strong>{money(result.total)}</strong></div></div>
            <div className="fair-note"><ShieldCheck size={18}/><p>Fair down to the last cent.<small>Tax and tip follow each person’s food & drinks. Rounding pennies are distributed automatically.</small></p></div>
            <button className="primary-button" onClick={copySummary}><Copy size={18}/> Copy the split</button>
            {shareOpen && <label className="share-fallback">Copy this summary<textarea readOnly value={summary} onFocus={(e) => e.target.select()}/></label>}
            <button className="edit-bill-button" onClick={() => go(1)}>Need to change something? Edit bill <ArrowRight size={15}/></button>
          </>}
          {error && <div ref={errorAlert} className="error" role="alert" tabIndex={-1}>{error}</div>}
          {notice && <div className="notice" role="status">{notice}</div>}
          {step < 3 && <div ref={pageActions} className="page-actions">{step > 0 && <button className="back-button" onClick={() => go(step - 1)} aria-label="Back"><ArrowLeft size={20}/></button>}<button className="primary-button" onClick={next}>{['Add the bill', 'Assign the items', 'See the split'][step]}<ArrowRight size={19}/></button></div>}
          <div className="privacy-note"><ShieldCheck size={14}/>{storageOk ? 'Saved on this device. No accounts. No ads.' : 'Device storage unavailable. Keep this tab open.'}</div>
        </section>
      </main>
      <footer>Less math. More good company.<span>made for the table <span className="footer-flower">✳</span></span></footer>
    </div>
    {resetOpen && <div className="modal-backdrop" onClick={() => navigate({ resetOpen: false })}><div className="modal card" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={(e) => e.stopPropagation()}><button className="modal-close icon-button" aria-label="Close dialog" onClick={() => navigate({ resetOpen: false })} autoFocus><X size={20}/></button><span className="brand-icon"><ReceiptText size={25}/></span><h2 id="reset-title">A fresh table?</h2><p>This clears the current bill and everyone’s shares from this device.</p><button className="primary-button" onClick={reset}>Start a new bill <ArrowRight size={18}/></button><button className="edit-bill-button" onClick={() => navigate({ resetOpen: false })}>Keep this bill</button></div></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
