// All displayed money and all allocations are integer cents.
export function moneyInput(value) {
  const input = String(value).trim();
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(input)) return null;
  const [whole, fraction = ''] = input.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function percentage(value) {
  const input = String(value).trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(input) || Number(input) > 100) return null;
  return Math.round(Number(input) * 100);
}

// Largest remainder method: no missing or invented cents, stable tie breaking.
export function allocate(cents, weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!total) return weights.map(() => 0);
  const raw = weights.map((weight) => cents * weight / total);
  const result = raw.map(Math.floor);
  const order = raw.map((value, index) => ({ index, remainder: value - result[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = cents - result.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remaining; index++) result[order[index].index]++;
  return result;
}

export function calculate(bill) {
  const { people, items, tax, tip, tipMode } = bill;
  if (!people.length || !items.length) throw new Error('Add people and items first.');
  const taxCents = tax === '' ? 0 : moneyInput(tax);
  const tipValue = tip === '' ? 0 : tipMode === 'percent' ? percentage(tip) : moneyInput(tip);
  if (taxCents === null || tipValue === null) throw new Error('Check tax and tip amounts.');
  const shares = people.map((person) => ({ ...person, subtotal: 0, weight: 0, items: [] }));
  for (const item of items) {
    const assigned = people.map((person) => item.people.includes(person.id) ? 1 : 0);
    const count = assigned.reduce((sum, value) => sum + value, 0);
    if (!count) throw new Error('Assign every item to at least one person.');
    if (!Number.isSafeInteger(item.cents) || item.cents <= 0) throw new Error('Check item prices.');
    const parts = allocate(item.cents, assigned);
    shares.forEach((person, index) => {
      if (!assigned[index]) return;
      person.subtotal += parts[index];
      person.weight += item.cents / count;
      person.items.push({ name: item.name, cents: parts[index], shared: count > 1 });
    });
  }
  const subtotal = items.reduce((sum, item) => sum + item.cents, 0);
  const tipCents = tipMode === 'percent' ? Math.round(subtotal * tipValue / 10000) : tipValue;
  const weights = shares.map((person) => person.weight);
  const taxes = allocate(taxCents, weights);
  const tips = allocate(tipCents, weights);
  shares.forEach((person, index) => {
    person.tax = taxes[index];
    person.tip = tips[index];
    person.total = person.subtotal + person.tax + person.tip;
  });
  return { shares, subtotal, tax: taxCents, tip: tipCents, total: subtotal + taxCents + tipCents };
}

export function validDraft(value) {
  return value && value.version === 1 && typeof value.title === 'string'
    && ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD'].includes(value.currency)
    && ['percent', 'amount'].includes(value.tipMode)
    && typeof value.tax === 'string' && typeof value.tip === 'string'
    && Array.isArray(value.people) && value.people.length <= 30
    && value.people.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    && new Set(value.people.map((p) => p.id)).size === value.people.length
    && Array.isArray(value.items) && value.items.length <= 200
    && value.items.every((i) => i && typeof i.id === 'string' && typeof i.name === 'string'
      && Number.isSafeInteger(i.cents) && i.cents > 0 && i.cents <= 999999999
      && Array.isArray(i.people) && i.people.every((id) => value.people.some((p) => p.id === id)));
}
