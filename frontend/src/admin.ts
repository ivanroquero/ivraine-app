import { openProposalModal } from './proposal';

interface VisitorLog {
  id: string;
  ip: string;
  section: 'Scrapbook' | 'Private Space' | 'Admin';
  action: string;
  details?: string;
  user?: string;
  userAgent?: string;
  dodgeCount?: number;
  timestamp: string;
}

interface AdminStats {
  totalVisits: number;
  uniqueIps: number;
  scrapbookVisits: number;
  spaceVisits: number;
  proposalAccepted: boolean;
  proposalAcceptedAt: string | null;
  totalDodges: number;
  recentIps: string[];
}

let allLogs: VisitorLog[] = [];
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

// Passcode handling
const lockScreen = document.getElementById('admin-lock') as HTMLDivElement;
const lockForm = document.getElementById('admin-lock-form') as HTMLFormElement;
const passInput = document.getElementById('admin-passcode-input') as HTMLInputElement;
const lockMsg = document.getElementById('admin-lock-msg') as HTMLParagraphElement;
const btnLock = document.getElementById('btn-lock') as HTMLButtonElement;

function isUnlocked(): boolean {
  return sessionStorage.getItem('ivraine-admin-unlocked') === 'true';
}

function unlockAdmin() {
  sessionStorage.setItem('ivraine-admin-unlocked', 'true');
  lockScreen.style.display = 'none';
  void loadAdminData();
  startAutoRefresh();
}

function lockAdmin() {
  sessionStorage.removeItem('ivraine-admin-unlocked');
  lockScreen.style.display = 'flex';
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  passInput.value = '';
  passInput.focus();
}

lockForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = passInput.value.trim();
  // Valid passcodes: 20260902, 09022026, 8-digit couple passcodes, or 'admin'
  if (val === '20260902' || val === '09022026' || val.length === 8 || val.toLowerCase() === 'admin') {
    unlockAdmin();
  } else {
    lockMsg.textContent = 'Incorrect passcode. Try again.';
    passInput.select();
  }
});

btnLock.addEventListener('click', lockAdmin);

// Device string parser
function formatDevice(ua?: string): string {
  if (!ua) return 'Unknown Device';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  let os = 'Unknown OS';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Chrome/i.test(ua) && !/Edge|Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Edg/i.test(ua)) browser = 'Edge';

  return `${isMobile ? '📱 Mobile' : '💻 Desktop'} (${os} · ${browser})`;
}

// Relative time formatter
function timeAgo(dateString: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(dateString).toLocaleDateString();
}

// Render table rows
function renderLogs(logs: VisitorLog[]) {
  const tbody = document.getElementById('logs-tbody')!;
  if (!logs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <h3>No visitor activity yet</h3>
          <p>Visits to the Scrapbook or Private Space will appear here with their IP addresses.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const isYes = log.action.includes('YES');
    const isScrapbook = log.section === 'Scrapbook';
    const isSpace = log.section === 'Private Space';
    const badgeClass = isScrapbook ? 'scrapbook' : isSpace ? 'space' : 'admin';
    const timeFormatted = new Date(log.timestamp).toLocaleString();
    const relativeTime = timeAgo(log.timestamp);
    const device = formatDevice(log.userAgent);

    return `
      <tr>
        <td>
          <span class="ip-cell">
            <strong>${escapeHtml(log.ip)}</strong>
            <button class="copy-ip-btn" data-ip="${escapeHtml(log.ip)}" title="Copy IP">📋</button>
          </span>
        </td>
        <td>
          <span class="badge-section ${badgeClass}">${escapeHtml(log.section)}</span>
        </td>
        <td>
          <span class="action-text ${isYes ? 'proposal-yes' : ''}">
            ${escapeHtml(log.action)}
          </span>
        </td>
        <td style="color:var(--muted);">${escapeHtml(log.details || '—')}</td>
        <td><strong>${escapeHtml(log.user || 'Visitor')}</strong></td>
        <td style="color:var(--muted);font-size:12px;">${escapeHtml(device)}</td>
        <td class="time-cell" title="${escapeHtml(timeFormatted)}">
          ${escapeHtml(relativeTime)}
        </td>
      </tr>
    `;
  }).join('');

  // Attach copy listeners
  tbody.querySelectorAll<HTMLButtonElement>('.copy-ip-btn').forEach(btn => {
    btn.onclick = () => {
      const ip = btn.dataset.ip || '';
      navigator.clipboard.writeText(ip);
      const originalText = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    };
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Filter and search
function filterLogs() {
  const search = (document.getElementById('log-search') as HTMLInputElement).value.trim().toLowerCase();
  const sectionFilter = (document.getElementById('section-filter') as HTMLSelectElement).value;

  const filtered = allLogs.filter(log => {
    const matchesSection = sectionFilter === 'all' || log.section === sectionFilter;
    const matchesSearch = !search ||
      log.ip.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search) ||
      (log.details || '').toLowerCase().includes(search) ||
      (log.user || '').toLowerCase().includes(search) ||
      log.timestamp.toLowerCase().includes(search);

    return matchesSection && matchesSearch;
  });

  renderLogs(filtered);
}

// Fetch data from backend API
async function loadAdminData() {
  try {
    const res = await fetch('/api/admin/logs', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { logs: VisitorLog[]; stats: AdminStats; currentIp: string } = await res.json();

    allLogs = data.logs || [];
    const stats = data.stats || {
      totalVisits: 0,
      uniqueIps: 0,
      scrapbookVisits: 0,
      spaceVisits: 0,
      proposalAccepted: false,
      proposalAcceptedAt: null,
      totalDodges: 0,
      recentIps: []
    };

    // Update KPI UI
    document.getElementById('stat-total-visits')!.textContent = String(stats.totalVisits);
    document.getElementById('stat-unique-ips')!.textContent = String(stats.uniqueIps);
    document.getElementById('stat-scrapbook-visits')!.textContent = String(stats.scrapbookVisits);
    document.getElementById('stat-space-visits')!.textContent = String(stats.spaceVisits);

    const propStatus = document.getElementById('stat-proposal-status')!;
    if (stats.proposalAccepted) {
      propStatus.textContent = 'Said YES! 💖';
      propStatus.style.color = '#ff6b81';
    } else {
      propStatus.textContent = 'Pending';
      propStatus.style.color = '#f0ecf4';
    }

    document.getElementById('stat-dodge-count')!.textContent = `Dodges avoided: ${stats.totalDodges}`;
    document.getElementById('current-ip-indicator')!.textContent = `Your IP: ${data.currentIp || '127.0.0.1'}`;

    filterLogs();
  } catch (err) {
    console.error('Could not load admin logs:', err);
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    void loadAdminData();
  }, 5000);
}

// Export CSV
function exportCsv() {
  if (!allLogs.length) {
    alert('No logs to export.');
    return;
  }
  const headers = ['Timestamp', 'IP Address', 'Section', 'Action', 'Details', 'User', 'User Agent'];
  const rows = allLogs.map(l => [
    `"${l.timestamp}"`,
    `"${l.ip}"`,
    `"${l.section}"`,
    `"${(l.action || '').replace(/"/g, '""')}"`,
    `"${(l.details || '').replace(/"/g, '""')}"`,
    `"${(l.user || '').replace(/"/g, '""')}"`,
    `"${(l.userAgent || '').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ivraine-visitor-ips-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Clear logs
async function clearLogs() {
  if (!confirm('Are you sure you want to clear all visitor IP activity logs?')) return;
  try {
    await fetch('/api/admin/clear-logs', { method: 'POST' });
    allLogs = [];
    void loadAdminData();
  } catch (err) {
    alert('Failed to clear logs.');
  }
}

// Tabs switching
document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.dataset.tab!;
    document.getElementById(targetId)?.classList.add('active');
  });
});

// Event listeners
document.getElementById('log-search')?.addEventListener('input', filterLogs);
document.getElementById('section-filter')?.addEventListener('change', filterLogs);
document.getElementById('btn-refresh')?.addEventListener('click', () => void loadAdminData());
document.getElementById('btn-export-csv')?.addEventListener('click', exportCsv);
document.getElementById('btn-clear-logs')?.addEventListener('click', () => void clearLogs());

// Proposal Tester in Admin
document.getElementById('btn-test-proposal')?.addEventListener('click', () => {
  openProposalModal('Admin', 'Loraine');
});

document.getElementById('btn-reset-proposal')?.addEventListener('click', () => {
  try {
    localStorage.removeItem('ivraine_proposal_status');
    localStorage.removeItem('ivraine_proposal_date');
    localStorage.removeItem('ivraine_proposal_dodges');
    alert('Proposal response reset in this browser. You can now test it again from the beginning!');
    void loadAdminData();
  } catch {}
});

// Init
if (isUnlocked()) {
  unlockAdmin();
} else {
  lockAdmin();
}
