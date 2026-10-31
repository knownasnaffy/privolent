// Loan Collector — Field Agent PWA Logic
// Runs fully offline with localStorage queue and auto-sync to Relay

const RELAY_URL = window.location.hostname === "localhost"
  ? "http://localhost:3001"
  : window.location.origin;

let currentUser = localStorage.getItem("collector_user") || null;
let currentFilter = "all";
let snapshot = null;

// Helpers
function formatCurrency(num) {
  if (num === null || num === undefined) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function getQueuedSubmissions() {
  try {
    return JSON.parse(localStorage.getItem("offline_submissions") || "[]");
  } catch (e) {
    return [];
  }
}

function saveQueuedSubmissions(queue) {
  localStorage.setItem("offline_submissions", JSON.stringify(queue));
  updateQueuedCount();
}

function updateQueuedCount() {
  const count = getQueuedSubmissions().length;
  const countEl = document.getElementById("queuedCount");
  if (countEl) countEl.innerText = count;
}

// Lifecycle Init
window.addEventListener("DOMContentLoaded", () => {
  updateNetworkStatus();
  window.addEventListener("online", () => {
    updateNetworkStatus();
    syncPendingSubmissions();
  });
  window.addEventListener("offline", updateNetworkStatus);

  document.getElementById("searchInput")?.addEventListener("input", renderCards);

  if (!currentUser) {
    showLoginScreen();
  } else {
    showMainScreen();
  }
});

function updateNetworkStatus() {
  const isOnline = navigator.onLine;
  const badge = document.getElementById("netStatus");
  const offlineBanner = document.getElementById("offlineBanner");

  if (badge) {
    badge.className = isOnline ? "badge badge-online" : "badge badge-offline";
    badge.innerText = isOnline ? "Online" : "Offline";
  }
  if (offlineBanner) {
    offlineBanner.style.display = isOnline ? "none" : "flex";
  }
}

function showLoginScreen() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("mainView").style.display = "none";
}

function showMainScreen() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("mainView").style.display = "block";
  document.getElementById("appHeaderTitle").innerText = `Collector: ${currentUser}`;
  loadSnapshot();
  updateQueuedCount();
}

function handleLogin() {
  const username = document.getElementById("loginUsername")?.value.trim();
  if (!username) {
    alert("Please enter a username");
    return;
  }
  currentUser = username;
  localStorage.setItem("collector_user", username);
  showMainScreen();
}

// Snapshot & Staleness
async function loadSnapshot() {
  // 1. First load from local cache if available (instant display)
  const cached = localStorage.getItem("snapshot_cache");
  if (cached) {
    try {
      snapshot = JSON.parse(cached);
      checkStaleness(snapshot.published_at);
      renderCards();
    } catch (e) {}
  }

  // 2. Fetch fresh snapshot from relay outbox
  try {
    const res = await fetch(`${RELAY_URL}/api/outbox/snapshot`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.active_loans) {
        snapshot = data;
        localStorage.setItem("snapshot_cache", JSON.stringify(data));
        checkStaleness(data.published_at);
        renderCards();
      }
    }
  } catch (err) {
    console.log("Could not reach relay outbox, using cached snapshot.");
  }
}

function checkStaleness(publishedAt) {
  const staleBanner = document.getElementById("staleBanner");
  const staleText = document.getElementById("staleText");
  if (!publishedAt) {
    if (staleBanner) staleBanner.style.display = "flex";
    if (staleText) staleText.innerText = "No snapshot published yet by admin.";
    return;
  }

  const pubDate = publishedAt.slice(0, 10);
  const today = getTodayStr();

  if (pubDate < today) {
    if (staleBanner) staleBanner.style.display = "flex";
    if (staleText)
      staleText.innerText = `Data is stale since ${pubDate}. Amounts may have changed, but you can still record collections.`;
  } else {
    if (staleBanner) staleBanner.style.display = "none";
  }
}

function setFilter(type) {
  currentFilter = type;
  document.getElementById("filterAll")?.classList.toggle("active", type === "all");
  document.getElementById("filterMine")?.classList.toggle("active", type === "mine");
  renderCards();
}

function renderCards() {
  const container = document.getElementById("cardsList");
  if (!container) return;

  if (!snapshot || !snapshot.active_loans || snapshot.active_loans.length === 0) {
    container.innerHTML = `<div class="card" style="text-align: center; color: #64748b; padding: 24px;">No active loan customer cards.</div>`;
    return;
  }

  const search = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  const today = getTodayStr();

  const filtered = snapshot.active_loans.filter((loan) => {
    const matchesSearch =
      loan.name.toLowerCase().includes(search) ||
      loan.locality.toLowerCase().includes(search) ||
      loan.phone_last4.includes(search);

    if (currentFilter === "mine") {
      return matchesSearch && loan.assigned_collector === currentUser;
    }
    return matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="card" style="text-align: center; color: #64748b; padding: 24px;">No matching customer cards found.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((loan) => {
      // Find today's lookahead entry or fallback to first
      const todayRow =
        loan.lookahead?.find((row) => row.date === today) ||
        loan.lookahead?.[0] || {
          principal_due: 0,
          fine_due: 0,
          is_prepaid: false,
        };

      const principalHtml = todayRow.is_prepaid
        ? `<span class="val-prepaid">Prepaid ₹0</span>`
        : `<span class="val-principal">${formatCurrency(todayRow.principal_due)}</span>`;

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="customer-name">${loan.name}</div>
              <div class="locality">${loan.locality}</div>
            </div>
            <div class="phone">•••• ${loan.phone_last4}</div>
          </div>

          <div class="due-grid">
            <div class="due-col">
              <span class="due-label">Principal Due Today</span>
              <span class="due-val">${principalHtml}</span>
            </div>
            <div class="due-col">
              <span class="due-label">Fine Due</span>
              <span class="due-val val-fine">${formatCurrency(todayRow.fine_due)}</span>
            </div>
          </div>

          <button class="btn-collect" onclick="openCollectModal('${loan.loan_id}', '${loan.name}', '${loan.locality}', ${todayRow.is_prepaid ? 0 : todayRow.principal_due}, ${todayRow.fine_due})">
            Record Collection
          </button>
        </div>
      `;
    })
    .join("");
}

// Quick Collect Form Actions
function openCollectModal(loanId, customerName, locality, principalDue, fineDue) {
  document.getElementById("modalLoanId").value = loanId;
  document.getElementById("modalCustomerName").innerText = customerName;
  document.getElementById("modalLocality").innerText = `${locality} • Today Due: ${formatCurrency(principalDue)}`;
  document.getElementById("modalPrincipal").value = principalDue || "";
  document.getElementById("modalFine").value = fineDue || 0;
  document.getElementById("modalReference").value = "";
  document.getElementById("collectModal").classList.add("open");
}

function closeCollectModal() {
  document.getElementById("collectModal").classList.remove("open");
}

async function handleCollectSubmit(e) {
  e.preventDefault();

  const loanId = document.getElementById("modalLoanId").value;
  const principal = Number(document.getElementById("modalPrincipal").value);
  const fine = Number(document.getElementById("modalFine").value || 0);
  const mode = document.getElementById("modalMode").value;
  const reference = document.getElementById("modalReference").value.trim();

  // Create submission with unique UUID
  const submission = {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `sub_${Date.now()}_${Math.random()}`,
    loan_id: loanId,
    principal_amount: principal,
    fine_amount: fine,
    mode,
    reference: reference || null,
    collected_at: new Date().toISOString(),
    collector_id: currentUser,
  };

  closeCollectModal();

  // If online, attempt direct submit to relay inbox
  if (navigator.onLine) {
    try {
      const res = await fetch(`${RELAY_URL}/api/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (res.ok) {
        alert("Collection submitted successfully to relay!");
        return;
      }
    } catch (err) {
      console.log("Direct submit failed, queueing offline submission.");
    }
  }

  // Queue locally
  const queue = getQueuedSubmissions();
  queue.push(submission);
  saveQueuedSubmissions(queue);
  alert("Saved offline! Collection queued and will sync when online.");
}

async function syncPendingSubmissions() {
  const queue = getQueuedSubmissions();
  if (queue.length === 0) {
    alert("No pending offline submissions to sync.");
    return;
  }

  if (!navigator.onLine) {
    alert("Cannot sync: phone is currently offline.");
    return;
  }

  let synced = 0;
  const remaining = [];

  for (const sub of queue) {
    try {
      const res = await fetch(`${RELAY_URL}/api/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (res.ok) {
        synced++;
      } else {
        remaining.push(sub);
      }
    } catch (err) {
      remaining.push(sub);
    }
  }

  saveQueuedSubmissions(remaining);
  alert(`Synced ${synced} submissions to relay! (${remaining.length} remaining in queue)`);
}

// Export for test suite if in node/module environment
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    formatCurrency,
    checkStaleness,
  };
}
