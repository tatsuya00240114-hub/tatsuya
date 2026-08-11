const STORAGE_KEY = "kakeibo_transactions";

const EXPENSE_CATEGORIES = [
  "食費", "日用品", "交通費", "住居", "光熱費",
  "通信費", "娯楽", "医療", "衣服・美容", "その他",
];
const INCOME_CATEGORIES = ["給与", "副業", "お小遣い", "その他"];

const CATEGORY_COLORS = [
  "#3766d6", "#e0563f", "#2f9e6b", "#e8b339", "#8a5fd6",
  "#3fb8c4", "#d65f9a", "#7a8896", "#c98f3f", "#5b7fbf",
];

const monthInput = document.getElementById("monthInput");
const txForm = document.getElementById("txForm");
const dateInput = document.getElementById("dateInput");
const categoryInput = document.getElementById("categoryInput");
const amountInput = document.getElementById("amountInput");
const memoInput = document.getElementById("memoInput");
const typeRadios = txForm.elements["type"];

const totalIncomeEl = document.getElementById("totalIncome");
const totalExpenseEl = document.getElementById("totalExpense");
const totalBalanceEl = document.getElementById("totalBalance");

const pieChartEl = document.getElementById("pieChart");
const legendEl = document.getElementById("legend");
const breakdownEl = document.getElementById("breakdown");
const breakdownEmptyEl = document.getElementById("breakdownEmpty");

const txTableBody = document.getElementById("txTableBody");
const listEmptyEl = document.getElementById("listEmpty");

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTransactions(transactions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

let transactions = loadTransactions();

function formatYen(amount) {
  return "¥" + Math.round(amount).toLocaleString("ja-JP");
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function updateCategoryOptions() {
  const type = typeRadios.value;
  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  categoryInput.innerHTML = categories
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

function transactionsForMonth(monthKey) {
  return transactions.filter((t) => t.date.startsWith(monthKey));
}

function render() {
  const monthKey = monthInput.value || currentMonthKey();
  const monthTx = transactionsForMonth(monthKey);

  const income = monthTx
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = monthTx
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  totalIncomeEl.textContent = formatYen(income);
  totalExpenseEl.textContent = formatYen(expense);
  totalBalanceEl.textContent = formatYen(income - expense);

  renderBreakdown(monthTx);
  renderList(monthTx);
}

function renderBreakdown(monthTx) {
  const expenseTx = monthTx.filter((t) => t.type === "expense");

  if (expenseTx.length === 0) {
    breakdownEl.style.display = "none";
    breakdownEmptyEl.style.display = "block";
    return;
  }

  breakdownEl.style.display = "flex";
  breakdownEmptyEl.style.display = "none";

  const totals = {};
  for (const t of expenseTx) {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  }

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, amt]) => sum + amt, 0);

  let currentDeg = 0;
  const gradientParts = [];
  entries.forEach(([category, amount], i) => {
    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    const deg = (amount / total) * 360;
    gradientParts.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
    currentDeg += deg;
  });
  pieChartEl.style.background = `conic-gradient(${gradientParts.join(", ")})`;

  legendEl.innerHTML = entries
    .map(([category, amount], i) => {
      const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
      const pct = ((amount / total) * 100).toFixed(1);
      return `<li>
        <span class="swatch" style="background:${color}"></span>
        <span class="cat-name">${category}</span>
        <span class="cat-amount">${formatYen(amount)}（${pct}%）</span>
      </li>`;
    })
    .join("");
}

function renderList(monthTx) {
  const sorted = [...monthTx].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    txTableBody.innerHTML = "";
    listEmptyEl.style.display = "block";
    return;
  }
  listEmptyEl.style.display = "none";

  txTableBody.innerHTML = sorted
    .map((t) => {
      const sign = t.type === "income" ? "+" : "-";
      return `<tr class="type-${t.type}" data-id="${t.id}">
        <td>${t.date}</td>
        <td><span class="type-badge">${t.type === "income" ? "収入" : "支出"}</span></td>
        <td>${t.category}</td>
        <td>${t.memo ? escapeHtml(t.memo) : ""}</td>
        <td class="amount">${sign}${formatYen(t.amount)}</td>
        <td><button class="delete-btn" data-id="${t.id}" title="削除">✕</button></td>
      </tr>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

txForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const transaction = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: typeRadios.value,
    date: dateInput.value,
    category: categoryInput.value,
    amount: Number(amountInput.value),
    memo: memoInput.value.trim(),
  };
  transactions.push(transaction);
  saveTransactions(transactions);

  amountInput.value = "";
  memoInput.value = "";
  amountInput.focus();

  render();
});

for (const radio of typeRadios) {
  radio.addEventListener("change", updateCategoryOptions);
}

txTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  const id = btn.dataset.id;
  transactions = transactions.filter((t) => t.id !== id);
  saveTransactions(transactions);
  render();
});

monthInput.addEventListener("change", render);

function init() {
  const monthKey = currentMonthKey();
  monthInput.value = monthKey;
  dateInput.value = new Date().toISOString().slice(0, 10);
  updateCategoryOptions();
  render();
}

init();
