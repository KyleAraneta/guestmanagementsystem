const { ipcRenderer } = require('electron');

// ── DOM REFS ──────────────────────────────────────────────
const tableBody      = document.getElementById('guestTable');
const logBody        = document.getElementById('guestLogTable');
const totalTodayEl   = document.getElementById('totalToday');
const totalInsideEl  = document.getElementById('totalInside');
const totalOutEl     = document.getElementById('totalOut');
const avgDurationEl  = document.getElementById('avgDuration');
const insideCountEl  = document.getElementById('insideCount');
const searchInput    = document.getElementById('searchInput');
const hourlyChart    = document.getElementById('hourlyChart');

const fullNameInput      = document.getElementById('fullName');
const personToVisitInput = document.getElementById('personToVisit');
const purposeInput       = document.getElementById('purpose');
const contactNumberInput = document.getElementById('contactNumber');
const timeInBtn          = document.getElementById('timeInBtn');
const toastEl            = document.getElementById('toast');

const modalOverlay = document.getElementById('modalOverlay');
const modalText    = document.getElementById('modalText');
const cancelBtn    = document.getElementById('cancelBtn');
const confirmBtn   = document.getElementById('confirmBtn');

const guestTableEmpty = document.getElementById('guestTableEmpty');
const guestLogEmpty   = document.getElementById('guestLogEmpty');
const topbarDate      = document.getElementById('topbarDate');

// ── TOPBAR DATE ───────────────────────────────────────────
function updateTopbarDate() {
  const now  = new Date();
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  topbarDate.textContent = now.toLocaleDateString(undefined, opts);
}
updateTopbarDate();

// ── TAB FILTER STATE ──────────────────────────────────────
let activeFilter = 'all';

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    loadGuestLog();
  });
});

// ── MODAL ─────────────────────────────────────────────────
let pendingTimeOutGuestId = null;
let lastFocusedElement    = null;

function openTimeOutModal(guestId, guestName = "") {
  pendingTimeOutGuestId = guestId;
  lastFocusedElement    = document.activeElement;
  modalText.textContent = guestName
    ? `Are you sure you want to time out "${guestName}"?`
    : "Are you sure this guest is leaving?";
  modalOverlay.classList.remove("hidden");
  confirmBtn.focus();
}

function closeTimeOutModal() {
  modalOverlay.classList.add("hidden");
  pendingTimeOutGuestId = null;
  if (lastFocusedElement && lastFocusedElement.focus) lastFocusedElement.focus();
  else fullNameInput.focus();
}

cancelBtn.addEventListener("click", closeTimeOutModal);

confirmBtn.addEventListener("click", async () => {
  if (pendingTimeOutGuestId == null) return;
  ipcRenderer.send("guest-time-out", Number(pendingTimeOutGuestId));
  closeTimeOutModal();
  setTimeout(async () => {
    await refreshAll();
    fullNameInput.focus();
  }, 200);
});

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeTimeOutModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeTimeOutModal();
});

// ── HELPERS ───────────────────────────────────────────────
function computeDuration(timeIn, timeOut) {
  if (!timeIn || !timeOut) return "—";
  const inDate  = new Date(timeIn);
  const outDate = new Date(timeOut);
  if (isNaN(inDate) || isNaN(outDate)) return "—";
  const diffMs = outDate - inDate;
  if (diffMs < 0) return "—";
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── ANIMATED NUMBER UPDATE ────────────────────────────────
// Pops the metric value when it changes
const prevMetricValues = {};

function updateMetric(el, newValue) {
  const key = el.id;
  if (prevMetricValues[key] !== newValue) {
    el.textContent = newValue;
    el.classList.remove('pop');
    // Force reflow so animation retriggers
    void el.offsetWidth;
    el.classList.add('pop');
    prevMetricValues[key] = newValue;
  }
}

// ── TIME IN BUTTON STATE ──────────────────────────────────
function updateTimeInButtonState() {
  const ok = fullNameInput.value.trim() &&
             personToVisitInput.value.trim() &&
             purposeInput.value.trim();
  timeInBtn.disabled = !ok;
}

[fullNameInput, personToVisitInput, purposeInput].forEach(inp =>
  inp.addEventListener("input", updateTimeInButtonState)
);

// ── TIME IN ───────────────────────────────────────────────
timeInBtn.addEventListener('click', async () => {
  const fullName      = fullNameInput.value.trim();
  const personToVisit = personToVisitInput.value.trim();
  const purpose       = purposeInput.value.trim();
  const contactNumber = contactNumberInput.value.trim();

  if (!fullName || !personToVisit || !purpose) {
    showToast("Please fill in Full Name, Person to Visit, and Purpose.");
    return;
  }

  ipcRenderer.send('guest-time-in', { fullName, personToVisit, purpose, contactNumber });
  showToast(`${fullName} timed in successfully!`);

  fullNameInput.value      = "";
  personToVisitInput.value = "";
  purposeInput.value       = "";
  contactNumberInput.value = "";

  updateTimeInButtonState();
  await refreshAll();
});

// ── LOAD GUESTS INSIDE ────────────────────────────────────
async function loadGuests() {
  const guests = await ipcRenderer.invoke('get-guests-inside');

  tableBody.innerHTML = "";

  if (guests.length === 0) {
    guestTableEmpty.classList.remove("hidden");
  } else {
    guestTableEmpty.classList.add("hidden");
  }

  insideCountEl.textContent = `${guests.length} active`;
  updateMetric(totalInsideEl, guests.length);

  guests.forEach((g, i) => {
    const initials  = getInitials(g.full_name);
    const avatarCls = `av-${i % 4}`;
    // stagger delay: each row enters 80ms after the previous
    const delay = `${i * 0.08}s`;

    const row = document.createElement("tr");
    row.classList.add("row-new");
    row.style.animationDelay = delay;
    row.innerHTML = `
      <td>
        <div class="guest-name-cell">
          <div class="avatar ${avatarCls}">${initials}</div>
          <span>${g.full_name}</span>
        </div>
      </td>
      <td class="visit-text">${g.person_to_visit}</td>
      <td class="time-text">${g.time_in}</td>
      <td>
        <button class="btn-timeout timeOutBtn" data-id="${g.id}">Time Out</button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// ── LOAD GUEST LOG ────────────────────────────────────────
async function loadGuestLog() {
  const rows = await ipcRenderer.invoke('get-guest-log');

  logBody.innerHTML = "";

  const searchText = searchInput.value.toLowerCase();

  let filtered = rows;
  if (activeFilter !== 'all') {
    filtered = filtered.filter(g => g.status === activeFilter);
  }
  filtered = filtered.filter(g =>
    g.full_name.toLowerCase().includes(searchText) ||
    (g.purpose && g.purpose.toLowerCase().includes(searchText))
  );

  if (filtered.length === 0) {
    guestLogEmpty.classList.remove("hidden");
  } else {
    guestLogEmpty.classList.add("hidden");
  }

  // Compute checked-out count & avg duration for metrics
  const todayStr = new Date().toLocaleDateString();
  let outCount = 0;
  let totalDurationMinutes = 0;
  let durationCount = 0;

  rows.forEach(g => {
    if (g.status === 'Out' && g.time_in && g.time_in.startsWith(todayStr)) {
      outCount++;
      if (g.time_out) {
        const inD  = new Date(g.time_in);
        const outD = new Date(g.time_out);
        if (!isNaN(inD) && !isNaN(outD) && outD > inD) {
          totalDurationMinutes += Math.floor((outD - inD) / 60000);
          durationCount++;
        }
      }
    }
  });

  updateMetric(totalOutEl, outCount);

  if (durationCount > 0) {
    const avg = Math.round(totalDurationMinutes / durationCount);
    const h   = Math.floor(avg / 60);
    const m   = avg % 60;
    const display = h > 0 ? `${h}h ${m}m` : `${m}m`;
    updateMetric(avgDurationEl, display);
  } else {
    updateMetric(avgDurationEl, "—");
  }

  filtered.forEach(g => {
    const duration   = g.status === "Inside" ? "(inside)" : computeDuration(g.time_in, g.time_out);
    const statusPill = g.status === "Inside"
      ? `<span class="status-pill sp-inside">In</span>`
      : `<span class="status-pill sp-out">Out</span>`;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td title="${g.full_name}">${g.full_name}</td>
      <td class="visit-text" title="${g.purpose}">${g.purpose}</td>
      <td class="time-text">${g.time_in || "—"}</td>
      <td class="time-text">${g.time_out || "—"}</td>
      <td class="time-text">${duration}</td>
      <td>${statusPill}</td>
    `;
    logBody.appendChild(row);
  });

  // update the hourly chart whenever log reloads
  renderHourlyChart(rows);
}

// ── LOAD TOTAL TODAY ──────────────────────────────────────
async function loadTotalToday() {
  const total = await ipcRenderer.invoke('get-total-today');
  updateMetric(totalTodayEl, total);
}

// ── HOURLY CHART ──────────────────────────────────────────
function renderHourlyChart(rows) {
  if (!hourlyChart) return;
  hourlyChart.innerHTML = "";

  const today = new Date().toLocaleDateString();

  // Count guests per hour (0–23)
  const counts = new Array(24).fill(0);
  rows.forEach(g => {
    if (g.time_in && g.time_in.startsWith(today)) {
      const d = new Date(g.time_in);
      if (!isNaN(d)) counts[d.getHours()]++;
    }
  });

  // Only show business hours 6 AM–10 PM to keep the chart compact
  const startHour = 6;
  const endHour   = 22;
  const visible   = counts.slice(startHour, endHour + 1);
  const maxCount  = Math.max(1, ...visible); // avoid divide-by-zero

  const BAR_HEIGHT = 42; // px, available bar area

  visible.forEach((count, idx) => {
    const hour    = startHour + idx;
    const label   = hour === 12 ? '12p' : hour < 12 ? `${hour}a` : `${hour - 12}p`;
    const pct     = count / maxCount;
    const barPx   = Math.max(2, Math.round(pct * BAR_HEIGHT));
    const isNow   = new Date().getHours() === hour;

    const colEl = document.createElement('div');
    colEl.className = 'bar-col';
    colEl.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;position:relative;';

    // Tooltip on hover showing count
    colEl.title = count === 1 ? `${count} guest at ${label}` : `${count} guests at ${label}`;

    // Bar
    const barDiv = document.createElement('div');
    barDiv.className = 'bar';
    barDiv.style.cssText = `
      height: ${barPx}px;
      width: 100%;
      border-radius: 4px 4px 0 0;
      background: ${count === 0
        ? 'var(--gray-100)'
        : isNow
          ? 'var(--teal-500)'
          : 'var(--purple-600)'
      };
      animation-delay: ${idx * 0.03}s;
      transition: background 0.2s, height 0.4s;
      cursor: default;
    `;

    // Hour label
    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = `
      font-size: 9px;
      color: ${isNow ? 'var(--teal-600)' : 'var(--gray-400)'};
      font-family: var(--mono);
      font-weight: ${isNow ? '600' : '400'};
      margin-top: 4px;
      text-align: center;
      position: absolute;
      bottom: 0;
    `;
    labelDiv.textContent = label;

    colEl.appendChild(barDiv);
    colEl.appendChild(labelDiv);
    hourlyChart.appendChild(colEl);
  });
}

// ── REFRESH ALL ───────────────────────────────────────────
async function refreshAll() {
  await loadGuests();
  await loadGuestLog();
  await loadTotalToday();
}

// ── SEARCH ───────────────────────────────────────────────
searchInput.addEventListener("input", () => loadGuestLog());

// ── ENTER TO SUBMIT ───────────────────────────────────────
function handleEnterToSubmit(e) {
  if (e.key === "Enter" && !timeInBtn.disabled) timeInBtn.click();
}

[fullNameInput, personToVisitInput, purposeInput, contactNumberInput].forEach(inp =>
  inp.addEventListener("keydown", handleEnterToSubmit)
);

// ── TIME OUT via event delegation ─────────────────────────
tableBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".timeOutBtn");
  if (!btn) return;
  const guestId   = Number(btn.dataset.id);
  const row       = btn.closest("tr");
  const guestName = row ? row.querySelector(".guest-name-cell span")?.textContent : "";
  openTimeOutModal(guestId, guestName);
});

// ── TOAST ─────────────────────────────────────────────────
let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

// ── INIT ──────────────────────────────────────────────────
refreshAll();
updateTimeInButtonState();