const STORAGE_KEY = "kakeibo_transactions";
const BUDGET_KEY = "kakeibo_budgets";

const EXPENSE_CATEGORIES = [
  "食費", "日用品", "交通費", "住居", "光熱費",
  "通信費", "娯楽", "医療", "衣服・美容", "その他",
];
const INCOME_CATEGORIES = ["給与", "賞与", "副業", "臨時収入", "その他"];

const CATEGORY_COLORS = {
  "食費": "#d9693f", "日用品": "#c9a227", "交通費": "#3f8fb0", "住居": "#2f5d8a",
  "光熱費": "#e0a03a", "通信費": "#6a76c9", "娯楽": "#b35a9c", "医療": "#3fa37a",
  "衣服・美容": "#d4708a", "その他": "#8a8f98",
};

const DEFAULT_BUDGETS = {
  "食費": 60000, "日用品": 10000, "交通費": 10000, "住居": 85000, "光熱費": 15000,
  "通信費": 8000, "娯楽": 20000, "医療": 5000, "衣服・美容": 10000, "その他": 10000,
};

const $ = (id) => document.getElementById(id);

const monthInput = $("monthInput");
const txForm = $("txForm");
const dateInput = $("dateInput");
const categoryInput = $("categoryInput");
const amountInput = $("amountInput");
const memoInput = $("memoInput");
const typeRadios = txForm.elements["type"];
const filterInput = $("filterInput");

// ---- storage ----------------------------------------------------------

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートモード等）では画面上だけで動かす
  }
}

let transactions = readJson(STORAGE_KEY);
let budgets = readJson(BUDGET_KEY) || { ...DEFAULT_BUDGETS };
if (!Array.isArray(transactions)) {
  transactions = buildSampleData();
}

function save() {
  writeJson(STORAGE_KEY, transactions);
  writeJson(BUDGET_KEY, budgets);
}

// ---- date helpers (ローカル時刻で扱う。toISOString は UTC なので使わない) ----

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMonthKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function shiftMonth(monthKey, diff) {
  const [y, m] = monthKey.split("-").map(Number);
  return toMonthKey(new Date(y, m - 1 + diff, 1));
}

function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}年${m}月`;
}

// ---- calculation ------------------------------------------------------

function formatYen(amount) {
  const sign = amount < 0 ? "-" : "";
  return sign + "¥" + Math.round(Math.abs(amount)).toLocaleString("ja-JP");
}

function txOfMonth(monthKey) {
  return transactions.filter((t) => t.date.startsWith(monthKey));
}

function totalsOf(list) {
  let income = 0;
  let expense = 0;
  for (const t of list) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

function expenseByCategory(list) {
  const map = {};
  for (const t of list) {
    if (t.type !== "expense") continue;
    map[t.category] = (map[t.category] || 0) + t.amount;
  }
  return map;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ---- render -----------------------------------------------------------

function currentMonth() {
  return monthInput.value || toMonthKey(new Date());
}

function render() {
  const monthKey = currentMonth();
  const monthTx = txOfMonth(monthKey);
  const now = totalsOf(monthTx);
  const prev = totalsOf(txOfMonth(shiftMonth(monthKey, -1)));

  $("sampleBanner").hidden = !transactions.some((t) => t.sample);

  renderSummary(now, prev);
  renderBudget(monthKey, monthTx);
  renderBreakdown(monthTx);
  renderTrend(monthKey);
  renderList(monthTx);
}

function deltaText(nowVal, prevVal, goodWhenUp) {
  if (!prevVal) return { text: "前月の記録なし", cls: "" };
  const diff = nowVal - prevVal;
  const pct = (diff / prevVal) * 100;
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "±";
  const good = diff === 0 ? null : (diff > 0) === goodWhenUp;
  return {
    text: `前月比 ${arrow}${formatYen(Math.abs(diff))}（${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%）`,
    cls: good === null ? "" : good ? "good" : "bad",
  };
}

function setDelta(el, d) {
  el.textContent = d.text;
  el.className = "delta " + d.cls;
}

function renderSummary(now, prev) {
  $("totalIncome").textContent = formatYen(now.income);
  $("totalExpense").textContent = formatYen(now.expense);

  const balEl = $("totalBalance");
  balEl.textContent = (now.balance > 0 ? "+" : "") + formatYen(now.balance);
  balEl.className = "value num " + (now.balance >= 0 ? "income" : "expense");

  setDelta($("incomeDelta"), deltaText(now.income, prev.income, true));
  setDelta($("expenseDelta"), deltaText(now.expense, prev.expense, false));
  $("balanceNote").textContent = now.balance >= 0 ? "黒字" : "赤字：支出が収入を上回っています";
  $("balanceNote").className = "delta " + (now.balance >= 0 ? "good" : "bad");

  const rateEl = $("savingRate");
  const noteEl = $("savingNote");
  if (now.income > 0) {
    const rate = (now.balance / now.income) * 100;
    rateEl.textContent = `${rate.toFixed(1)}%`;
    // 目安：手取りの 20% 以上を残せていれば良好、10% 未満は要見直し
    let note = "目安 20% 以上";
    let cls = "";
    if (rate >= 20) { note = "良好（目安 20% 以上）"; cls = "good"; }
    else if (rate < 10) { note = "要見直し（目安 20% 以上）"; cls = "bad"; }
    noteEl.textContent = note;
    noteEl.className = "delta " + cls;
  } else {
    rateEl.textContent = "—";
    noteEl.textContent = "収入を記録すると計算します";
    noteEl.className = "delta";
  }
}

function renderBudget(monthKey, monthTx) {
  const spent = expenseByCategory(monthTx);
  const rows = EXPENSE_CATEGORIES
    .filter((c) => (budgets[c] || 0) > 0 || spent[c])
    .map((c) => ({ cat: c, budget: budgets[c] || 0, spent: spent[c] || 0 }));

  const totalBudget = EXPENSE_CATEGORIES.reduce((s, c) => s + (budgets[c] || 0), 0);
  const totalSpent = Object.values(spent).reduce((s, v) => s + v, 0);
  const remain = totalBudget - totalSpent;

  // 今月なら残り日数で 1 日あたりの使える額を出す
  const today = new Date();
  let perDay = "";
  if (monthKey === toMonthKey(today) && totalBudget > 0) {
    const daysLeft = daysInMonth(monthKey) - today.getDate() + 1;
    perDay = remain > 0
      ? `残り${daysLeft}日・1日あたり <b class="num">${formatYen(remain / daysLeft)}</b> まで使えます`
      : `残り${daysLeft}日・予算を使い切っています`;
  }

  const budgetTotalEl = $("budgetTotal");
  if (totalBudget === 0) {
    budgetTotalEl.innerHTML = `<p class="hint">予算が未設定です。「予算を編集」から設定してください。</p>`;
  } else {
    const pct = Math.min(100, (totalSpent / totalBudget) * 100);
    const state = totalSpent > totalBudget ? "over" : pct >= 80 ? "warn" : "ok";
    budgetTotalEl.innerHTML = `
      <div class="bt-line">
        <span>予算残り</span>
        <b class="num ${state}">${formatYen(remain)}</b>
      </div>
      <div class="bar"><i class="${state}" style="width:${pct}%"></i></div>
      <div class="bt-sub"><span class="num">${formatYen(totalSpent)} / ${formatYen(totalBudget)}</span>${perDay ? `<span>${perDay}</span>` : ""}</div>`;
  }

  $("budgetList").innerHTML = rows.map((r) => {
    if (!r.budget) {
      return `<li><span class="b-cat">${r.cat}</span><span class="pill">予算なし</span><span class="b-num num">${formatYen(r.spent)}</span></li>`;
    }
    const ratio = r.spent / r.budget;
    const state = ratio > 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
    const label = ratio > 1 ? `${formatYen(r.spent - r.budget)} 超過` : `${Math.round(ratio * 100)}%`;
    return `<li>
      <span class="b-cat">${r.cat}</span>
      <span class="pill ${state}">${label}</span>
      <span class="b-num num">${formatYen(r.spent)} / ${formatYen(r.budget)}</span>
      <div class="bar"><i class="${state}" style="width:${Math.min(100, ratio * 100)}%"></i></div>
    </li>`;
  }).join("");
}

function renderBreakdown(monthTx) {
  const entries = Object.entries(expenseByCategory(monthTx)).sort((a, b) => b[1] - a[1]);
  const empty = entries.length === 0;
  $("breakdown").hidden = empty;
  $("breakdownEmpty").hidden = !empty;
  if (empty) return;

  const total = entries.reduce((s, [, v]) => s + v, 0);
  let deg = 0;
  const parts = entries.map(([cat, amt]) => {
    const next = deg + (amt / total) * 360;
    const seg = `${CATEGORY_COLORS[cat] || "#8a8f98"} ${deg}deg ${next}deg`;
    deg = next;
    return seg;
  });
  $("donut").style.background = `conic-gradient(${parts.join(", ")})`;
  $("donutTotal").textContent = formatYen(total);

  $("legend").innerHTML = entries.map(([cat, amt]) => `
    <li>
      <span class="swatch" style="background:${CATEGORY_COLORS[cat] || "#8a8f98"}"></span>
      <span class="cat">${cat}</span>
      <span class="num">${formatYen(amt)}</span>
      <span class="pct num">${((amt / total) * 100).toFixed(1)}%</span>
    </li>`).join("");
}

function niceMax(v) {
  if (v <= 0) return 100000;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * exp >= v) return m * exp;
  }
  return 10 * exp;
}

function renderTrend(monthKey) {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(monthKey, -i));
  const data = months.map((m) => ({ m, ...totalsOf(txOfMonth(m)) }));
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.expense))));

  const W = 520, H = 230, left = 52, right = 8, top = 12, bottom = 34;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const y = (v) => top + plotH - (v / max) * plotH;
  const groupW = plotW / months.length;
  const barW = Math.min(22, groupW / 3);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="直近6か月の収入と支出">`;
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const yy = y(v);
    const label = v >= 10000 ? `${(v / 10000).toLocaleString("ja-JP")}万` : v.toLocaleString("ja-JP");
    svg += `<line x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}" class="grid-line"/>`;
    svg += `<text x="${left - 6}" y="${yy + 4}" text-anchor="end" class="axis">${label}</text>`;
  }
  data.forEach((d, i) => {
    const cx = left + groupW * i + groupW / 2;
    const isCur = d.m === monthKey;
    svg += `<rect x="${cx - barW - 1}" y="${y(d.income)}" width="${barW}" height="${top + plotH - y(d.income)}" class="bar-income${isCur ? "" : " dim"}" rx="2"><title>${monthLabel(d.m)} 収入 ${formatYen(d.income)}</title></rect>`;
    svg += `<rect x="${cx + 1}" y="${y(d.expense)}" width="${barW}" height="${top + plotH - y(d.expense)}" class="bar-expense${isCur ? "" : " dim"}" rx="2"><title>${monthLabel(d.m)} 支出 ${formatYen(d.expense)}</title></rect>`;
    const [, mm] = d.m.split("-").map(Number);
    svg += `<text x="${cx}" y="${H - 12}" text-anchor="middle" class="axis${isCur ? " cur" : ""}">${mm}月</text>`;
  });
  svg += `</svg>`;
  $("trendChart").innerHTML = svg;
}

function renderList(monthTx) {
  const filter = filterInput.value;
  const list = monthTx
    .filter((t) => !filter || t.category === filter && t.type === "expense" || filter === "__income" && t.type === "income")
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

  $("listEmpty").hidden = list.length > 0;
  $("txTableBody").innerHTML = list.map((t) => {
    const sign = t.type === "income" ? "+" : "-";
    const [, m, d] = t.date.split("-").map(Number);
    return `<tr class="${t.type}">
      <td class="num">${m}/${d}</td>
      <td><span class="cat-chip"><i style="background:${t.type === "income" ? "var(--income)" : CATEGORY_COLORS[t.category] || "#8a8f98"}"></i>${escapeHtml(t.category)}</span></td>
      <td class="memo">${escapeHtml(t.memo || "")}</td>
      <td class="r num amount">${sign}${formatYen(t.amount)}</td>
      <td class="r"><button type="button" class="del" data-id="${t.id}" aria-label="${escapeHtml(t.category)} ${formatYen(t.amount)} を削除">×</button></td>
    </tr>`;
  }).join("");
}

// ---- form -------------------------------------------------------------

function updateCategoryOptions() {
  const cats = typeRadios.value === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  categoryInput.innerHTML = cats.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function buildFilterOptions() {
  filterInput.innerHTML =
    `<option value="">すべて</option><option value="__income">収入のみ</option>` +
    EXPENSE_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function flash(el, text) {
  el.textContent = text;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ""; }, 3000);
}

txForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = Math.round(Number(amountInput.value));
  if (!dateInput.value || !(amount > 0)) {
    flash($("formMsg"), "日付と 1 円以上の金額を入力してください。");
    return;
  }
  transactions.push({
    id: newId(),
    type: typeRadios.value,
    date: dateInput.value,
    category: categoryInput.value,
    amount,
    memo: memoInput.value.trim(),
    createdAt: Date.now(),
  });
  save();
  amountInput.value = "";
  memoInput.value = "";
  amountInput.focus();

  // 入力した日付の月を表示する
  monthInput.value = dateInput.value.slice(0, 7);
  flash($("formMsg"), `${categoryInput.value} ${formatYen(amount)} を追加しました。`);
  render();
});

for (const r of typeRadios) r.addEventListener("change", updateCategoryOptions);

$("txTableBody").addEventListener("click", (e) => {
  const btn = e.target.closest(".del");
  if (!btn) return;
  transactions = transactions.filter((t) => t.id !== btn.dataset.id);
  save();
  render();
});

monthInput.addEventListener("change", render);
filterInput.addEventListener("change", render);
$("prevMonth").addEventListener("click", () => { monthInput.value = shiftMonth(currentMonth(), -1); render(); });
$("nextMonth").addEventListener("click", () => { monthInput.value = shiftMonth(currentMonth(), 1); render(); });

$("clearSample").addEventListener("click", () => {
  transactions = transactions.filter((t) => !t.sample);
  save();
  render();
});

// ---- budget editor ----------------------------------------------------

$("editBudgetBtn").addEventListener("click", () => {
  $("budgetInputs").innerHTML = EXPENSE_CATEGORIES.map((c, i) => `
    <label for="budget-${i}">${c}
      <input type="number" id="budget-${i}" data-cat="${c}" min="0" step="1000" inputmode="numeric" value="${budgets[c] || 0}">
    </label>`).join("");
  $("budgetEditor").hidden = false;
  $("editBudgetBtn").hidden = true;
});

$("cancelBudget").addEventListener("click", () => {
  $("budgetEditor").hidden = true;
  $("editBudgetBtn").hidden = false;
});

$("budgetEditor").addEventListener("submit", (e) => {
  e.preventDefault();
  for (const input of $("budgetInputs").querySelectorAll("input")) {
    budgets[input.dataset.cat] = Math.max(0, Math.round(Number(input.value) || 0));
  }
  save();
  $("budgetEditor").hidden = true;
  $("editBudgetBtn").hidden = false;
  render();
});

// ---- CSV --------------------------------------------------------------

const CSV_HEADER = "日付,種別,カテゴリ,金額,メモ";

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv() {
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.type === "income" ? "収入" : "支出", t.category, t.amount, t.memo].map(csvCell).join(","));
  return [CSV_HEADER, ...rows].join("\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

$("exportBtn").addEventListener("click", () => {
  const csv = toCsv();
  const out = $("csvOut");
  try {
    const blob = new Blob(["﻿" + csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kakeibo-${toDateKey(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch { /* ダウンロード不可の環境では下のテキスト欄を使う */ }
  // ダウンロードが禁止された環境でも使えるよう、テキストでも表示してコピーする
  out.value = csv;
  out.hidden = false;
  out.select();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(csv)
      .then(() => flash($("dataMsg"), `${transactions.length} 件を書き出し、クリップボードにコピーしました。`))
      .catch(() => flash($("dataMsg"), `${transactions.length} 件を書き出しました。下の欄からコピーできます。`));
  } else {
    flash($("dataMsg"), `${transactions.length} 件を書き出しました。下の欄からコピーできます。`);
  }
});

$("importInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = (await file.text()).replace(/^﻿/, "");
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (rows.length && rows[0][0] === "日付") rows.shift();

  let added = 0, skipped = 0;
  for (const [date, typeLabel, category, amount, memo] of rows) {
    const amt = Math.round(Number(String(amount).replace(/[,¥円]/g, "")));
    const d = String(date).trim().replace(/\//g, "-").replace(/-(\d)(?=-|$)/g, "-0$1");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(amt > 0)) { skipped++; continue; }
    const type = typeLabel === "収入" ? "income" : "expense";
    const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    transactions.push({
      id: newId(), type, date: d,
      category: cats.includes(category) ? category : "その他",
      amount: amt, memo: memo || "", createdAt: Date.now(),
    });
    added++;
  }
  save();
  e.target.value = "";
  flash($("dataMsg"), `${added} 件を読み込みました。` + (skipped ? `形式が合わない ${skipped} 行は飛ばしました。` : ""));
  render();
});

$("resetBtn").addEventListener("click", () => { $("resetConfirm").hidden = false; });
$("resetNo").addEventListener("click", () => { $("resetConfirm").hidden = true; });
$("resetYes").addEventListener("click", () => {
  transactions = [];
  budgets = { ...DEFAULT_BUDGETS };
  save();
  $("resetConfirm").hidden = true;
  $("csvOut").hidden = true;
  flash($("dataMsg"), "すべて削除しました。");
  render();
});

// ---- sample data ------------------------------------------------------

function buildSampleData() {
  const list = [];
  const today = new Date();
  const add = (monthsAgo, day, type, category, amount, memo) => {
    const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, day);
    if (monthsAgo === 0 && day > today.getDate()) return;
    list.push({ id: newId(), type, date: toDateKey(d), category, amount, memo, sample: true, createdAt: 0 });
  };
  for (let m = 5; m >= 0; m--) {
    const wobble = (n) => Math.round(n * (0.9 + ((m * 7) % 5) * 0.05) / 10) * 10;
    add(m, 5, "income", "給与", 285000, "手取り");
    add(m, 27, "expense", "住居", 85000, "家賃");
    add(m, 10, "expense", "光熱費", wobble(13200), "電気・ガス・水道");
    add(m, 12, "expense", "通信費", 6800, "スマホ2台");
    add(m, 3, "expense", "食費", wobble(14800), "まとめ買い");
    add(m, 9, "expense", "食費", wobble(12600), "スーパー");
    add(m, 16, "expense", "食費", wobble(15400), "スーパー");
    add(m, 23, "expense", "食費", wobble(13900), "スーパー");
    add(m, 6, "expense", "日用品", wobble(4300), "ドラッグストア");
    add(m, 14, "expense", "交通費", 6400, "ICカードチャージ");
    add(m, 18, "expense", "娯楽", wobble(9800), "外食・映画");
    if (m % 2 === 0) add(m, 20, "expense", "衣服・美容", 7500, "美容院");
    if (m === 3) add(m, 11, "income", "副業", 30000, "ライティング");
    if (m === 1) add(m, 8, "expense", "医療", 3200, "歯医者");
  }
  return list;
}

// ---- init -------------------------------------------------------------

function init() {
  const today = new Date();
  monthInput.value = toMonthKey(today);
  dateInput.value = toDateKey(today);
  updateCategoryOptions();
  buildFilterOptions();
  render();
}

init();
