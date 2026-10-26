'use strict';

const API_BASE = '/api';
const STORAGE_KEY = 'paisatrack.transactions.v1';
const palette = ['#168467','#8b79d8','#f0a45d','#e16c75','#4e9fca','#d5bd53','#7c9a79','#a8799d','#8c9baa','#d38b66'];
const categoryIcons = {Food:'🍜',Transport:'🚌',Shopping:'🛍️',Bills:'🧾',Health:'💊',Education:'📚',Entertainment:'🎬',Salary:'💼',Freelance:'💻',Other:'✦'};
const $ = (id) => document.getElementById(id);
const els = {
  dialog:$('transactionDialog'), form:$('transactionForm'), id:$('transactionId'), title:$('titleInput'), amount:$('amountInput'), date:$('dateInput'), category:$('categoryInput'), note:$('noteInput'),
  month:$('monthFilter'), search:$('searchInput'), typeFilter:$('typeFilter'), categoryFilter:$('categoryFilter'), rows:$('transactionRows'), tableEmpty:$('tableEmpty'), recent:$('recentList'), toast:$('toast')
};
let transactions = loadTransactions();
let toastTimer;

function loadTransactions(){
  try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(data) ? data.filter(isValidTransaction) : []; }
  catch { return []; }
}
function isValidTransaction(t){ return t && typeof t.id === 'string' && typeof t.title === 'string' && Number.isFinite(Number(t.amount)) && Number(t.amount) > 0 && ['income','expense'].includes(t.type) && typeof t.date === 'string'; }
function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  syncCollection('/transactions/sync', transactions);
}
async function syncCollection(path, items){
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(items)
    });
    if(!response.ok) throw new Error(`API returned ${response.status}`);
  } catch(error) {
    console.error(`Could not save ${path} to the backend:`, error);
    showToast('Backend unavailable. Changes are cached in this browser.');
  }
}
async function loadCollection(path){
  const response = await fetch(`${API_BASE}${path}`);
  if(!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}
function localISODate(date = new Date()){ const d = new Date(date.getTime() - date.getTimezoneOffset()*60000); return d.toISOString().slice(0,10); }
function money(value){ return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(value)||0); }
function monthKey(date){ return String(date || '').slice(0,7); }
function formatDate(date){ if(!date) return '—'; return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
function escapeHTML(value){ return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function selectedMonth(){ return els.month.value || localISODate().slice(0,7); }
function monthTransactions(){ return transactions.filter(t => monthKey(t.date) === selectedMonth()); }
function getTotals(items){ return items.reduce((totals,t) => { totals[t.type] += Number(t.amount); return totals; },{income:0,expense:0}); }
function showToast(message){ els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>els.toast.classList.remove('show'),2600); }
function openDialog(transaction){
  els.form.reset(); els.id.value = transaction?.id || ''; els.title.value = transaction?.title || ''; els.amount.value = transaction?.amount ?? ''; els.date.value = transaction?.date || localISODate(); els.category.value = transaction?.category || 'Food'; els.note.value = transaction?.note || '';
  const type = transaction?.type || 'expense'; const radio = els.form.querySelector(`input[name="type"][value="${type}"]`); if(radio) radio.checked = true;
  $('dialogTitle').textContent = transaction ? 'Edit transaction' : 'Add transaction'; $('saveTransactionBtn').textContent = transaction ? 'Save changes' : 'Save transaction'; els.dialog.showModal(); setTimeout(()=>els.title.focus(),50);
}
function closeDialog(){ els.dialog.close(); }
function renderSummary(){
  const totals = getTotals(monthTransactions()); const balance = totals.income - totals.expense; const rate = totals.income > 0 ? Math.max(0,Math.min(100,((totals.income-totals.expense)/totals.income)*100)) : 0;
  $('balanceAmount').textContent = money(balance); $('incomeAmount').textContent = money(totals.income); $('expenseAmount').textContent = money(totals.expense); $('savingsRate').textContent = `${Math.round(rate)}%`; $('savingsProgress').style.width = `${rate}%`;
  $('todayLabel').textContent = new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function renderCategoryFilter(){
  const old = els.categoryFilter.value; const categories = [...new Set(transactions.map(t=>t.category).filter(Boolean))].sort();
  els.categoryFilter.innerHTML = '<option value="all">All categories</option>' + categories.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
  if(categories.includes(old)) els.categoryFilter.value = old;
}
function renderDonut(){
  const expenses = monthTransactions().filter(t=>t.type==='expense'); const sums = {};
  expenses.forEach(t=>{ const c=t.category||'Other'; sums[c]=(sums[c]||0)+Number(t.amount); });
  const sorted = Object.entries(sums).sort((a,b)=>b[1]-a[1]); const total = sorted.reduce((sum,item)=>sum+item[1],0);
  $('donutTotal').textContent = total >= 100000 ? `₹${(total/100000).toFixed(1)}L` : total >= 1000 ? `₹${(total/1000).toFixed(1)}k` : money(total).replace('.00','');
  $('categoryCount').textContent = `${sorted.length} categor${sorted.length===1?'y':'ies'}`;
  if(!total){ $('donutChart').style.background='conic-gradient(#edf1f4 0 100%)'; $('categoryLegend').innerHTML='<div class="empty-state small-empty">Add expenses to see your breakdown.</div>'; return; }
  let cursor=0; const stops=sorted.map(([cat,amount],i)=>{const start=cursor;cursor+=amount/total*100;return `${palette[i%palette.length]} ${start}% ${cursor}%`;});
  $('donutChart').style.background=`conic-gradient(${stops.join(',')})`;
  $('categoryLegend').innerHTML=sorted.slice(0,6).map(([cat,amount],i)=>`<div class="legend-row"><span class="legend-dot" style="background:${palette[i%palette.length]}"></span><span title="${escapeHTML(cat)}">${escapeHTML(cat)}</span><strong>${Math.round(amount/total*100)}%</strong></div>`).join('');
}
function renderRecent(){
  const items=[...transactions].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt).slice(0,4);
  if(!items.length){els.recent.innerHTML='<div class="empty-state">No transactions yet.<br />Add your first transaction to get started.</div>';return;}
  els.recent.innerHTML=items.map(t=>`<div class="recent-item"><div class="transaction-icon">${categoryIcons[t.category]||'✦'}</div><div class="recent-details"><strong>${escapeHTML(t.title)}</strong><small>${escapeHTML(t.category||'Other')} · ${formatDate(t.date)}</small></div><div class="recent-amount ${t.type==='income'?'positive':'negative'}">${t.type==='income'?'+':'−'}${money(t.amount)}</div></div>`).join('');
}
function filteredTransactions(){
  const q=els.search.value.trim().toLowerCase(); const type=els.typeFilter.value; const category=els.categoryFilter.value;
  return [...transactions].filter(t=>monthKey(t.date)===selectedMonth()).filter(t=>type==='all'||t.type===type).filter(t=>category==='all'||t.category===category).filter(t=>!q||[t.title,t.category,t.note,t.date].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
}
function renderTable(){
  const items=filteredTransactions(); els.rows.innerHTML=items.map(t=>`<tr><td><div class="transaction-name"><div class="transaction-icon">${categoryIcons[t.category]||'✦'}</div><div><strong title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</strong>${t.note?`<small title="${escapeHTML(t.note)}">${escapeHTML(t.note)}</small>`:''}</div></div></td><td><span class="category-pill">${escapeHTML(t.category||'Other')}</span></td><td>${formatDate(t.date)}</td><td><span class="type-pill ${t.type}">${t.type==='income'?'Income':'Expense'}</span></td><td class="amount-cell ${t.type==='income'?'positive':'negative'}">${t.type==='income'?'+':'−'}${money(t.amount)}</td><td><div class="action-buttons"><button class="icon-btn" data-action="edit" data-id="${t.id}" aria-label="Edit ${escapeHTML(t.title)}" title="Edit">✎</button><button class="icon-btn" data-action="delete" data-id="${t.id}" aria-label="Delete ${escapeHTML(t.title)}" title="Delete">×</button></div></td></tr>`).join('');
  els.tableEmpty.style.display=items.length?'none':'block'; $('rowCount').textContent=`Showing ${items.length} transaction${items.length===1?'':'s'}`;
}
function render(){ renderSummary();renderCategoryFilter();renderDonut();renderRecent();renderTable(); }
function exportCSV(){
  const items=filteredTransactions(); if(!items.length){showToast('There are no transactions to export for this view.');return;}
  const headers=['Title','Type','Category','Amount (INR)','Date','Note']; const quote=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const csv=[headers,...items.map(t=>[t.title,t.type,t.category,t.amount,t.date,t.note])].map(row=>row.map(quote).join(',')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`paisatrack-${selectedMonth()}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('CSV report exported successfully.');
}

$('openAddBtn').addEventListener('click',()=>openDialog()); $('closeDialogBtn').addEventListener('click',closeDialog); $('cancelDialogBtn').addEventListener('click',closeDialog);
els.dialog.addEventListener('click',e=>{if(e.target===els.dialog)closeDialog();});
els.form.addEventListener('submit',e=>{
  e.preventDefault(); const amount=Number(els.amount.value); if(!Number.isFinite(amount)||amount<=0){showToast('Please enter an amount greater than zero.');return;}
  const existingId=els.id.value; const type=els.form.querySelector('input[name="type"]:checked').value; const existing=transactions.find(t=>t.id===existingId);
  const item={id:existingId||`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title:els.title.value.trim(),amount:Math.round(amount*100)/100,type,date:els.date.value,category:els.category.value,note:els.note.value.trim(),createdAt:existing?.createdAt||Date.now()};
  if(!item.title||!item.date){showToast('Please complete the required fields.');return;}
  if(existingId) transactions=transactions.map(t=>t.id===existingId?item:t); else transactions.push(item);
  persist();closeDialog();render();showToast(existingId?'Transaction updated.':'Transaction added successfully.');
});
[els.month,els.search,els.typeFilter,els.categoryFilter].forEach(el=>el.addEventListener(el===els.month?'change':'input',render));
els.rows.addEventListener('click',e=>{const button=e.target.closest('button[data-action]');if(!button)return;const t=transactions.find(item=>item.id===button.dataset.id);if(!t)return;if(button.dataset.action==='edit')openDialog(t);if(button.dataset.action==='delete'){if(confirm(`Delete “${t.title}”? This cannot be undone.`)){transactions=transactions.filter(item=>item.id!==t.id);persist();render();showToast('Transaction deleted.');}}});
$('exportBtn').addEventListener('click',exportCSV);
$('clearAllBtn').addEventListener('click',()=>{if(!transactions.length){showToast('There is no saved data to clear.');return;}if(confirm('Delete all transactions saved in this browser? This cannot be undone.')){transactions=[];persist();render();showToast('All transaction data cleared.');}});
els.month.value=localISODate().slice(0,7);render();

// Split-bill module: group-aware equal splits, personal-share tracking, and full settlement history.
const SPLIT_STORAGE_KEY = 'paisatrack.splitBills.v2';
const SETTLEMENT_STORAGE_KEY = 'paisatrack.settlementHistory.v1';
const MY_NAME_KEY = 'paisatrack.myName.v1';
const splitForm = $('splitBillForm');
const splitBillsList = $('splitBillList');
let splitBills = loadSplitBills();
let settlementHistory = loadSettlementHistory();
let myName = localStorage.getItem(MY_NAME_KEY) || '';
$('yourName').value = myName;
function loadSplitBills(){
  try {
    const data = JSON.parse(localStorage.getItem(SPLIT_STORAGE_KEY) || localStorage.getItem('paisatrack.splitBills.v1') || '[]');
    return Array.isArray(data) ? data.filter(b => b && typeof b.id === 'string' && typeof b.title === 'string' && Number(b.amount) > 0 && typeof b.payer === 'string' && Array.isArray(b.participants)).map(b=>({...b,group:normalizePerson(b.group||'General'),settled:Boolean(b.settled)})) : [];
  } catch { return []; }
}
function loadSettlementHistory(){
  try { const data=JSON.parse(localStorage.getItem(SETTLEMENT_STORAGE_KEY)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.id==='string'&&x.from&&x.to&&Number(x.amount)>0):[]; } catch { return []; }
}
function persistSplitBills(){
  localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(splitBills));
  syncCollection('/split-bills/sync', splitBills);
}
function persistSettlements(){
  localStorage.setItem(SETTLEMENT_STORAGE_KEY, JSON.stringify(settlementHistory));
  syncCollection('/settlements/sync', settlementHistory);
}
function normalizePerson(name){ return String(name || '').trim().replace(/\s+/g,' '); }
function cents(amount){ return Math.round((Number(amount) || 0) * 100); }
function splitBillShare(bill){ return bill.participants.length ? Number((Number(bill.amount) / bill.participants.length).toFixed(2)) : 0; }
function escapeAttr(value){ return escapeHTML(value).replace(/`/g,'&#96;'); }
function renderGroupFilter(){
  const filter=$('groupFilter'); const old=filter.value;
  const groups=[...new Set(splitBills.map(b=>normalizePerson(b.group||'General')).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  filter.innerHTML='<option value="all">All groups</option>'+groups.map(g=>`<option value="${escapeAttr(g)}">${escapeHTML(g)}</option>`).join('');
  if(groups.includes(old))filter.value=old;
}
function visibleBills(){const group=$('groupFilter').value;return splitBills.filter(b=>group==='all'||normalizePerson(b.group||'General')===group);}
function renderSplitBills(){
  renderGroupFilter();
  const visible=visibleBills();
  const open = splitBills.filter(b => !b.settled);
  $('openBillCount').textContent = String(open.length);
  $('openBillTotal').textContent = money(open.reduce((sum,b)=>sum+Number(b.amount),0));
  const people = new Set(open.flatMap(b => [...b.participants, b.payer]));
  $('splitPeopleCount').textContent = String(people.size);
  if(!visible.length){ splitBillsList.innerHTML='<div class="empty-state">No bills in this view yet. Add a group expense above to get started.</div>'; }
  else {
    splitBillsList.innerHTML = [...visible].sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).map(b=>{
      const share=splitBillShare(b);const peopleText=b.participants.join(', ');
      return `<article class="split-bill-card"><div class="split-bill-top"><div><h4>${escapeHTML(b.title)}</h4><div class="split-bill-meta"><span class="group-tag">${escapeHTML(b.group||'General')}</span><br>${escapeHTML(b.category||'Other')} · ${formatDate(b.date)}<br>Paid by <strong>${escapeHTML(b.payer)}</strong></div></div><div class="split-bill-amount">${money(b.amount)}</div></div><span class="split-status ${b.settled?'settled':''}">${b.settled?'✓ Settled':'● Open bill'}</span><p class="split-participants"><strong>Participants (${b.participants.length}):</strong> ${escapeHTML(peopleText)}</p><div class="split-share"><span>Equal share per person</span><strong>${money(share)}</strong></div>${b.personalTransactionId?'<p class="personal-share-note">✓ Your share is included in personal expenses</p>':''}<div class="split-card-actions"><button type="button" data-split-action="share" data-id="${escapeAttr(b.id)}">Copy summary</button><button type="button" data-split-action="toggle" data-id="${escapeAttr(b.id)}">${b.settled?'Reopen':'Mark settled'}</button><button type="button" class="danger" data-split-action="delete" data-id="${escapeAttr(b.id)}">Delete</button></div></article>`;
    }).join('');
  }
  renderSettlements();renderSettlementHistory();
}
function calculateTransfers(groupFilter='all'){
  const netByGroup=new Map();
  splitBills.filter(b=>!b.settled&&(groupFilter==='all'||normalizePerson(b.group||'General')===groupFilter)).forEach(b=>{
    const group=normalizePerson(b.group||'General');if(!netByGroup.has(group))netByGroup.set(group,new Map());const net=netByGroup.get(group);
    const amountCents=cents(b.amount);const participants=[...new Set(b.participants.map(normalizePerson).filter(Boolean))];if(!participants.length)return;
    const base=Math.floor(amountCents/participants.length);const remainder=amountCents-base*participants.length;
    participants.forEach((name,index)=>net.set(name,(net.get(name)||0)-base-(index<remainder?1:0)));
    const payer=normalizePerson(b.payer);net.set(payer,(net.get(payer)||0)+amountCents);
  });
  // Recorded payments reduce the debtor's outstanding balance and the creditor's receivable.
  settlementHistory.forEach(payment=>{
    if(groupFilter!=='all'&&normalizePerson(payment.group||'General')!==groupFilter)return;
    const group=normalizePerson(payment.group||'General');if(!netByGroup.has(group))return;const net=netByGroup.get(group);const amount=cents(payment.amount);
    net.set(normalizePerson(payment.from),(net.get(normalizePerson(payment.from))||0)+amount);
    net.set(normalizePerson(payment.to),(net.get(normalizePerson(payment.to))||0)-amount);
  });
  const transfers=[];
  for(const [group,net] of netByGroup){
    const debtors=[],creditors=[];for(const [name,value] of net){if(value < -1)debtors.push({name,amount:-value});else if(value>1)creditors.push({name,amount:value});}
    debtors.sort((a,b)=>b.amount-a.amount);creditors.sort((a,b)=>b.amount-a.amount);let i=0,j=0;
    while(i<debtors.length&&j<creditors.length){const amount=Math.min(debtors[i].amount,creditors[j].amount);if(amount>0)transfers.push({from:debtors[i].name,to:creditors[j].name,amount,group});debtors[i].amount-=amount;creditors[j].amount-=amount;if(debtors[i].amount<2)i++;if(creditors[j].amount<2)j++;}
  }
  return transfers;
}
function renderSettlements(){
  const list=$('settlementList');const filter=$('groupFilter').value;const open=splitBills.some(b=>!b.settled&&(filter==='all'||normalizePerson(b.group||'General')===filter));
  if(!open){list.innerHTML='<div class="empty-state">Add an open bill in this group to calculate settlements.</div>';return;}
  const transfers=calculateTransfers(filter);
  if(!transfers.length){list.innerHTML='<div class="empty-state">Everyone is settled up. No payments are needed.</div>';return;}
  list.innerHTML=transfers.map((t,i)=>`<div class="settlement-row settlement-row-rich"><span><small>${escapeHTML(t.group)}</small><br><strong>${escapeHTML(t.from)}</strong> pays <strong>${escapeHTML(t.to)}</strong></span><div class="settlement-action"><strong class="owes">${money(t.amount/100)}</strong><button type="button" class="record-payment-btn" data-transfer-index="${i}" data-from="${escapeAttr(t.from)}" data-to="${escapeAttr(t.to)}" data-group="${escapeAttr(t.group)}" data-amount="${(t.amount/100).toFixed(2)}">Record full payment</button></div></div>`).join('');
}
function addSplitBill(event){
  event.preventDefault();
  const title=$('billTitle').value.trim();const amount=Number($('billAmount').value);const payer=normalizePerson($('billPayer').value);const date=$('billDate').value;const group=normalizePerson($('billGroup').value)||'General';
  const participants=[...new Set($('billPeople').value.split(',').map(normalizePerson).filter(Boolean))];
  if(!title||!Number.isFinite(amount)||amount<=0||!payer||!date||!participants.length||!group){showToast('Please complete all required split-bill fields.');return;}
  if(!participants.some(p=>p.toLocaleLowerCase()===payer.toLocaleLowerCase())){showToast('Include the person who paid in the participant list so the split is fair.');return;}
  const bill={id:`bill-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title,amount:Math.round(amount*100)/100,payer,participants,date,category:$('billCategory').value,group,settled:false,createdAt:Date.now()};
  myName=normalizePerson($('yourName').value);if(myName)localStorage.setItem(MY_NAME_KEY,myName);
  const myParticipant=participants.find(p=>p.toLocaleLowerCase()===myName.toLocaleLowerCase());
  if(myName&&myParticipant){
    const shareCents=Math.floor(cents(bill.amount)/participants.length);const remainder=cents(bill.amount)-shareCents*participants.length;const idx=participants.findIndex(p=>p.toLocaleLowerCase()===myName.toLocaleLowerCase());const personalShare=(shareCents+(idx<remainder?1:0))/100;
    const tx={id:`split-exp-${bill.id}`,title:`${title} (your share)`,amount:personalShare,type:'expense',date,category:bill.category==='Food'?'Food':bill.category==='Travel'?'Transport':bill.category==='Shopping'?'Shopping':bill.category==='Entertainment'?'Entertainment':'Other',note:`Personal share for ${group}; full group bill ${money(bill.amount)}.`,createdAt:Date.now(),splitBillId:bill.id};
    transactions.push(tx);persist();bill.personalTransactionId=tx.id;render();
  }
  splitBills.push(bill);persistSplitBills();splitForm.reset();$('billDate').value=localISODate();$('billGroup').value=group;$('yourName').value=myName;renderSplitBills();showToast(myName&&myParticipant?'Bill added; only your share was added to expenses.':'Split bill added successfully.');
}
splitForm.addEventListener('submit',addSplitBill);
splitBillsList.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-split-action]');if(!button)return;const bill=splitBills.find(b=>b.id===button.dataset.id);if(!bill)return;const action=button.dataset.splitAction;
  if(action==='toggle'){bill.settled=!bill.settled;persistSplitBills();renderSplitBills();showToast(bill.settled?'Bill marked as settled.':'Bill reopened.');}
  else if(action==='delete'){if(confirm(`Delete split bill “${bill.title}”?${bill.personalTransactionId?' Its linked personal-share transaction will also be removed.':''}`)){if(bill.personalTransactionId){transactions=transactions.filter(t=>t.id!==bill.personalTransactionId);persist();render();}splitBills=splitBills.filter(b=>b.id!==bill.id);persistSplitBills();renderSplitBills();showToast('Split bill deleted.');}}
  else if(action==='share'){const text=`${bill.title}\nGroup: ${bill.group||'General'}\nTotal: ${money(bill.amount)}\nPaid by: ${bill.payer}\nParticipants: ${bill.participants.join(', ')}\nEqual share: ${money(splitBillShare(bill))}\nDate: ${formatDate(bill.date)}\nStatus: ${bill.settled?'Settled':'Open'}`;try{await navigator.clipboard.writeText(text);showToast('Bill summary copied to clipboard.');}catch{window.prompt('Copy this split-bill summary:',text);}}
});
$('groupFilter').addEventListener('change',renderSplitBills);
$('settlementList').addEventListener('click',event=>{
  const button=event.target.closest('button[data-transfer-index]');if(!button)return;
  const from=normalizePerson(button.dataset.from),to=normalizePerson(button.dataset.to),group=normalizePerson(button.dataset.group),amount=Number(button.dataset.amount);
  if(!from||!to||!Number.isFinite(amount)||amount<=0)return;
  if(!confirm(`Record the full payment of ${money(amount)} from ${from} to ${to} for group “${group}”? This will update outstanding balances.`))return;
  settlementHistory.push({id:`settlement-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,from,to,group,amount:Math.round(amount*100)/100,date:localISODate(),createdAt:Date.now()});persistSettlements();renderSplitBills();showToast('Full settlement recorded.');
});
function renderSettlementHistory(){
  const list=$('settlementHistoryList');const filter=$('groupFilter').value;const items=[...settlementHistory].filter(x=>filter==='all'||normalizePerson(x.group||'General')===filter).sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.createdAt||0)-Number(a.createdAt||0));
  $('settlementCount').textContent=`${items.length} payment${items.length===1?'':'s'}`;
  if(!items.length){list.innerHTML='<div class="empty-state">No settlements recorded yet.</div>';return;}
  list.innerHTML=items.map(x=>`<div class="settlement-history-row"><div><strong>${escapeHTML(x.from)}</strong> paid <strong>${escapeHTML(x.to)}</strong><small>${escapeHTML(x.group||'General')} · ${formatDate(x.date)}</small></div><strong>${money(x.amount)}</strong></div>`).join('');
}
$('exportSplitBtn').addEventListener('click',()=>{
  const items=visibleBills();if(!items.length){showToast('There are no split bills in this view to export.');return;}
  const headers=['Group','Title','Amount INR','Paid By','Participants','Participant Count','Equal Share INR','Date','Category','Status'];const quote=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const csv=[headers,...items.map(b=>[b.group||'General',b.title,b.amount,b.payer,b.participants.join('; '),b.participants.length,splitBillShare(b),b.date,b.category,b.settled?'Settled':'Open'])].map(row=>row.map(quote).join(',')).join('\r\n');downloadCSV(csv,`paisatrack-split-bills-${localISODate()}.csv`,'Split bills exported successfully.');
});
$('exportSettlementBtn').addEventListener('click',()=>{
  const filter=$('groupFilter').value;const items=settlementHistory.filter(x=>filter==='all'||normalizePerson(x.group||'General')===filter);if(!items.length){showToast('There is no settlement history in this view to export.');return;}
  const headers=['Date','Group','Paid By','Paid To','Amount INR'];const quote=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const csv=[headers,...items.map(x=>[x.date,x.group||'General',x.from,x.to,x.amount])].map(row=>row.map(quote).join(',')).join('\r\n');downloadCSV(csv,`paisatrack-settlements-${localISODate()}.csv`,'Settlement history exported successfully.');
});
function downloadCSV(csv,filename,message){const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast(message);}
$('yourName').addEventListener('change',()=>{myName=normalizePerson($('yourName').value);if(myName)localStorage.setItem(MY_NAME_KEY,myName);else localStorage.removeItem(MY_NAME_KEY);});
$('billDate').value=localISODate();
renderSplitBills();

// Load persistent server data on startup. Existing browser data is uploaded once if the database is empty.
(async function bootstrapBackend(){
  try {
    const [serverTransactions, serverBills, serverSettlements] = await Promise.all([
      loadCollection('/transactions'), loadCollection('/split-bills'), loadCollection('/settlements')
    ]);
    const localTransactions = loadTransactions();
    const localBills = loadSplitBills();
    const localSettlements = loadSettlementHistory();

    if (serverTransactions.length) {
      transactions = serverTransactions;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } else if (localTransactions.length) {
      transactions = localTransactions;
      await syncCollection('/transactions/sync', transactions);
    } else { transactions = []; }

    if (serverBills.length) {
      splitBills = serverBills;
      localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(splitBills));
    } else if (localBills.length) {
      splitBills = localBills;
      await syncCollection('/split-bills/sync', splitBills);
    } else { splitBills = []; }

    if (serverSettlements.length) {
      settlementHistory = serverSettlements;
      localStorage.setItem(SETTLEMENT_STORAGE_KEY, JSON.stringify(settlementHistory));
    } else if (localSettlements.length) {
      settlementHistory = localSettlements;
      await syncCollection('/settlements/sync', settlementHistory);
    } else { settlementHistory = []; }

    render();
    renderSplitBills();
    showToast('Connected to MySQL database.');
  } catch (error) {
    console.error('Backend startup sync failed:', error);
    showToast('Backend not connected. Start Spring Boot to sync with MySQL.');
  }
})();
