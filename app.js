/* Générateur de factures – fonctionne entièrement dans le navigateur (localStorage). */
(function () {
  'use strict';

  const STORAGE_KEY = 'facturation.factures.v1';
  const SELLER_KEY = 'facturation.vendeur.v1';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const form = $('#invoice-form');
  const itemsBody = $('#items-table tbody');
  const preview = $('#invoice-preview');
  const viewList = $('#view-list');
  const viewForm = $('#view-form');

  let editingId = null;

  // ---------- Utilitaires ----------
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function num(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoney(amount, currency) {
    const rounded = Math.round(amount * 100) / 100;
    const str = rounded.toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    return `${str} ${currency || ''}`.trim();
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Stockage ----------
  function loadInvoices() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveInvoices(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function nextInvoiceNumber(list) {
    const year = new Date().getFullYear();
    let max = 0;
    list.forEach((inv) => {
      const m = /(\d+)$/.exec(inv.number || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `FAC-${year}-${String(max + 1).padStart(3, '0')}`;
  }

  // ---------- Calculs ----------
  function computeTotals(data) {
    const subtotal = data.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0);
    const discount = subtotal * (num(data.discountRate) / 100);
    const base = subtotal - discount;
    const tax = base * (num(data.taxRate) / 100);
    const total = base + tax;
    return { subtotal, discount, tax, total };
  }

  // ---------- Lecture / écriture du formulaire ----------
  function addItemRow(item = { desc: '', qty: 1, price: 0 }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input name="desc" placeholder="Ex : Poulet entier frais" value="${esc(item.desc)}" /></td>
      <td><input name="qty" type="number" min="0" step="any" value="${esc(item.qty)}" /></td>
      <td><input name="price" type="number" min="0" step="any" value="${esc(item.price)}" /></td>
      <td class="num line-total">0</td>
      <td><button type="button" class="btn btn-danger btn-small remove-item" title="Supprimer l'article">✕</button></td>`;
    itemsBody.appendChild(tr);
    return tr;
  }

  function readItems() {
    return $$('tr', itemsBody).map((tr) => ({
      desc: tr.querySelector('[name=desc]').value,
      qty: tr.querySelector('[name=qty]').value,
      price: tr.querySelector('[name=price]').value
    }));
  }

  function readForm() {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) data[k] = v;
    data.items = readItems();
    return data;
  }

  function fillForm(inv) {
    form.reset();
    Object.keys(inv).forEach((k) => {
      const el = form.elements[k];
      if (el && k !== 'items') el.value = inv[k] ?? '';
    });
    itemsBody.innerHTML = '';
    (inv.items && inv.items.length ? inv.items : [{ desc: '', qty: 1, price: 0 }])
      .forEach((it) => addItemRow(it));
    refresh();
  }

  function emptyInvoice() {
    const list = loadInvoices();
    const seller = JSON.parse(localStorage.getItem(SELLER_KEY) || '{}');
    return {
      sellerName: seller.sellerName || '',
      sellerAddress: seller.sellerAddress || '',
      sellerPhone: seller.sellerPhone || '',
      sellerEmail: seller.sellerEmail || '',
      clientName: '', clientAddress: '', clientPhone: '', clientEmail: '',
      number: nextInvoiceNumber(list),
      date: todayISO(),
      dueDate: '',
      currency: 'FCFA',
      taxRate: 0,
      discountRate: 0,
      notes: 'Merci pour votre confiance !',
      items: [{ desc: '', qty: 1, price: 0 }]
    };
  }

  // ---------- Rendu ----------
  function renderPreview(data) {
    const t = computeTotals(data);
    const cur = data.currency;
    const rows = data.items
      .filter((it) => it.desc || num(it.qty) || num(it.price))
      .map((it) => `
        <tr>
          <td>${esc(it.desc)}</td>
          <td class="num">${esc(it.qty)}</td>
          <td class="num">${formatMoney(num(it.price), cur)}</td>
          <td class="num">${formatMoney(num(it.qty) * num(it.price), cur)}</td>
        </tr>`).join('');

    preview.innerHTML = `
      <div class="invoice-head">
        <div>
          <h2>FACTURE</h2>
        </div>
        <div class="invoice-meta">
          <div><strong>N° :</strong> ${esc(data.number)}</div>
          <div><strong>Date :</strong> ${esc(formatDate(data.date))}</div>
          ${data.dueDate ? `<div><strong>Échéance :</strong> ${esc(formatDate(data.dueDate))}</div>` : ''}
        </div>
      </div>

      <div class="invoice-parties">
        <div>
          <h4>Émetteur</h4>
          <p><strong>${esc(data.sellerName)}</strong></p>
          <p>${esc(data.sellerAddress)}</p>
          ${data.sellerPhone ? `<p>Tél. : ${esc(data.sellerPhone)}</p>` : ''}
          ${data.sellerEmail ? `<p>${esc(data.sellerEmail)}</p>` : ''}
        </div>
        <div>
          <h4>Facturé à</h4>
          <p><strong>${esc(data.clientName)}</strong></p>
          <p>${esc(data.clientAddress)}</p>
          ${data.clientPhone ? `<p>Tél. : ${esc(data.clientPhone)}</p>` : ''}
          ${data.clientEmail ? `<p>${esc(data.clientEmail)}</p>` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Qté</th>
            <th class="num">Prix unitaire</th>
            <th class="num">Montant</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" class="muted">Aucun article</td></tr>'}</tbody>
      </table>

      <div class="invoice-totals">
        <div><span>Sous-total</span><span>${formatMoney(t.subtotal, cur)}</span></div>
        ${num(data.discountRate) ? `<div><span>Remise (${num(data.discountRate)} %)</span><span>- ${formatMoney(t.discount, cur)}</span></div>` : ''}
        ${num(data.taxRate) ? `<div><span>TVA (${num(data.taxRate)} %)</span><span>${formatMoney(t.tax, cur)}</span></div>` : ''}
        <div class="grand"><span>Total à payer</span><span>${formatMoney(t.total, cur)}</span></div>
      </div>

      ${data.notes ? `<div class="invoice-notes">${esc(data.notes)}</div>` : ''}
    `;
  }

  function updateTotalsPreview(data) {
    const t = computeTotals(data);
    const cur = data.currency;
    $('#prev-subtotal').textContent = formatMoney(t.subtotal, cur);
    $('#prev-discount').textContent = formatMoney(t.discount, cur);
    $('#prev-tax').textContent = formatMoney(t.tax, cur);
    $('#prev-total').textContent = formatMoney(t.total, cur);
    $$('#items-table tbody tr').forEach((tr) => {
      const qty = tr.querySelector('[name=qty]').value;
      const price = tr.querySelector('[name=price]').value;
      tr.querySelector('.line-total').textContent = formatMoney(num(qty) * num(price), cur);
    });
  }

  function refresh() {
    const data = readForm();
    updateTotalsPreview(data);
    renderPreview(data);
  }

  function renderList() {
    const list = loadInvoices().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const tbody = $('#invoice-table tbody');
    tbody.innerHTML = '';
    $('#list-empty').classList.toggle('hidden', list.length > 0);
    $('#invoice-table').classList.toggle('hidden', list.length === 0);

    list.forEach((inv) => {
      const total = computeTotals(inv).total;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(inv.number)}</td>
        <td>${esc(formatDate(inv.date))}</td>
        <td>${esc(inv.clientName)}</td>
        <td class="num">${formatMoney(total, inv.currency)}</td>
        <td>
          <button class="btn btn-secondary btn-small" data-action="view" data-id="${esc(inv.id)}">Ouvrir</button>
          <button class="btn btn-secondary btn-small" data-action="dup" data-id="${esc(inv.id)}">Dupliquer</button>
          <button class="btn btn-danger btn-small" data-action="del" data-id="${esc(inv.id)}">Supprimer</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // ---------- Navigation ----------
  function showView(name) {
    viewList.classList.toggle('hidden', name !== 'list');
    viewForm.classList.toggle('hidden', name !== 'form');
    if (name === 'list') renderList();
  }

  // ---------- Actions ----------
  function newInvoice() {
    editingId = null;
    fillForm(emptyInvoice());
    showView('form');
  }

  function openInvoice(id, { duplicate = false } = {}) {
    const inv = loadInvoices().find((x) => x.id === id);
    if (!inv) return;
    if (duplicate) {
      editingId = null;
      const copy = { ...inv, number: nextInvoiceNumber(loadInvoices()), date: todayISO() };
      delete copy.id;
      fillForm(copy);
    } else {
      editingId = id;
      fillForm(inv);
    }
    showView('form');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.items.some((it) => it.desc.trim())) {
      alert('Ajoutez au moins un article avec une description.');
      return;
    }
    const list = loadInvoices();
    const sellerInfo = {
      sellerName: data.sellerName,
      sellerAddress: data.sellerAddress,
      sellerPhone: data.sellerPhone,
      sellerEmail: data.sellerEmail
    };
    localStorage.setItem(SELLER_KEY, JSON.stringify(sellerInfo));

    if (editingId) {
      const idx = list.findIndex((x) => x.id === editingId);
      if (idx >= 0) list[idx] = { ...data, id: editingId };
    } else {
      if (list.some((x) => x.number === data.number)) {
        alert(`Le numéro ${data.number} existe déjà. Choisissez un autre numéro.`);
        return;
      }
      editingId = uid();
      list.push({ ...data, id: editingId });
    }
    saveInvoices(list);
    alert('Facture enregistrée ✔');
  });

  $('#btn-add-item').addEventListener('click', () => {
    addItemRow();
    refresh();
  });

  itemsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-item');
    if (!btn) return;
    btn.closest('tr').remove();
    if (!itemsBody.children.length) addItemRow();
    refresh();
  });

  form.addEventListener('input', refresh);

  $('#btn-print').addEventListener('click', () => {
    refresh();
    window.print();
  });

  $('#btn-reset').addEventListener('click', () => {
    if (confirm('Réinitialiser le formulaire ?')) newInvoice();
  });

  $('#btn-new').addEventListener('click', newInvoice);
  $('#btn-list').addEventListener('click', () => showView('list'));

  $('#invoice-table').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'view') openInvoice(id);
    if (action === 'dup') openInvoice(id, { duplicate: true });
    if (action === 'del') {
      const list = loadInvoices();
      const inv = list.find((x) => x.id === id);
      if (inv && confirm(`Supprimer la facture ${inv.number} ?`)) {
        saveInvoices(list.filter((x) => x.id !== id));
        renderList();
      }
    }
  });

  // ---------- Démarrage ----------
  newInvoice();
})();
