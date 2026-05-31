// ============================================================
// FIREBASE CONFIG — Replace with your actual Firebase project
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAVxmZTKLBUjdTd6GBDY6x1l2kKiFaL5Kw",
  authDomain: "ipro-7f32b.firebaseapp.com",
  projectId: "ipro-7f32b",
  storageBucket: "ipro-7f32b.firebasestorage.app",
  messagingSenderId: "277589872417",
  appId: "1:277589872417:web:ded73bc56109832a0d3860"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ============================================================
// CONSTANTS
// ============================================================
const ADMIN_IDS = ['6376877875']; // Add admin Telegram user IDs here
const EASYPAISA_ACCOUNT = '0300-0000000';
const JAZZCASH_ACCOUNT   = '0311-0000000';

// Investment Plans
const PLANS = [
  { id: 'starter',    name: 'Starter',     roi: 1.5,  duration: 30, min: 500,   max: 4999,  featured: false, desc: '1.5% daily return for 30 days' },
  { id: 'silver',     name: 'Silver',      roi: 2.0,  duration: 30, min: 5000,  max: 19999, featured: true,  desc: '2.0% daily return for 30 days' },
  { id: 'gold',       name: 'Gold',        roi: 2.5,  duration: 30, min: 20000, max: 49999, featured: false, desc: '2.5% daily return for 30 days' },
  { id: 'platinum',   name: 'Platinum',    roi: 3.0,  duration: 30, min: 50000, max: 999999, featured: false, desc: '3.0% daily return for 30 days' },
];

// ============================================================
// STATE
// ============================================================
let currentUser   = null;
let userData      = {};
let selectedPlan  = null;
let depositMethod = 'easypaisa';
let withdrawMethod = 'easypaisa';
let tgUser        = null;

// ============================================================
// TELEGRAM INIT
// ============================================================
function initTelegram() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0e1a');
    tg.setBackgroundColor('#0a0e1a');
    tgUser = tg.initDataUnsafe?.user;
  }
}

// ============================================================
// AUTH & USER
// ============================================================
async function initAuth() {
  try {
    const tgId = tgUser?.id?.toString() || 'demo_user_' + Math.random().toString(36).substr(2,8);
    const displayName = tgUser ? `${tgUser.first_name} ${tgUser.last_name || ''}`.trim() : 'Demo User';

    // Sign in anonymously, link to Telegram ID via Firestore
    await auth.signInAnonymously();
    currentUser = auth.currentUser;

    const userRef = db.collection('users').doc(tgId);
    const snap    = await userRef.get();

    if (!snap.exists) {
      const refCode = 'IP' + tgId.substr(-6).toUpperCase();
      const newUser = {
        telegramId: tgId,
        name: displayName,
        balance: 0,
        totalInvested: 0,
        totalEarned: 0,
        referralCode: refCode,
        referralCount: 0,
        tasksDone: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isAdmin: ADMIN_IDS.includes(tgId)
      };
      await userRef.set(newUser);
      userData = newUser;
    } else {
      userData = snap.data();
    }

    // Store local user ID for session
    localStorage.setItem('invest_user_id', tgId);
    currentUser._telegramId = tgId;

    await loadUserData();
    await seedDefaultTasks();
    loadAllData();
    hideLoading();

    // If admin, show admin nav
    if (userData.isAdmin) showAdminNav();
  } catch (e) {
    console.error('Auth error', e);
    // Fallback demo mode
    loadDemoMode();
    hideLoading();
  }
}

function loadDemoMode() {
  userData = {
    telegramId: 'demo',
    name: 'Demo User',
    balance: 12500,
    totalInvested: 10000,
    totalEarned: 2500,
    referralCode: 'IPDEMO1',
    referralCount: 3,
    tasksDone: 12,
    isAdmin: true
  };
  currentUser = { _telegramId: 'demo' };
  loadAllData();
  showAdminNav();
}

// ============================================================
// DATA LOADERS
// ============================================================
async function loadUserData() {
  if (!currentUser?._telegramId) return;
  try {
    const snap = await db.collection('users').doc(currentUser._telegramId).get();
    if (snap.exists) userData = snap.data();
  } catch (e) { console.warn('loadUserData', e); }
}

function loadAllData() {
  updateBalanceUI();
  renderPlans();
  loadActiveInvestments();
  loadRecentActivity();
  loadTasks();
  loadProfileData();
  if (userData.isAdmin) loadAdminData();
}

function updateBalanceUI() {
  const bal = (userData.balance || 0).toFixed(2);
  document.getElementById('header-balance').textContent = `PKR ${bal}`;
  document.getElementById('total-balance').textContent = bal;
  document.getElementById('withdraw-available').textContent = bal;
  document.getElementById('today-earnings').textContent = `+PKR ${(userData.todayEarnings || 0).toFixed(2)}`;
  document.getElementById('total-profit').textContent = `PKR ${(userData.totalEarned || 0).toFixed(2)}`;
}

// ============================================================
// PLANS
// ============================================================
function renderPlans() {
  const container = document.getElementById('plans-list');
  container.innerHTML = PLANS.map(p => `
    <div class="plan-card ${p.featured ? 'featured' : ''}" onclick="openInvestModal('${p.id}')">
      ${p.featured ? '<div class="plan-badge">Popular</div>' : ''}
      <div class="plan-name">${p.name} Plan</div>
      <div class="plan-roi">${p.roi}% <span>/ day</span></div>
      <div class="plan-meta">
        <div class="plan-meta-item"><strong>${p.duration} Days</strong>Duration</div>
        <div class="plan-meta-item"><strong>PKR ${p.min.toLocaleString()}</strong>Min. Invest</div>
        <div class="plan-meta-item"><strong>PKR ${p.max.toLocaleString()}</strong>Max. Invest</div>
      </div>
      <button class="invest-btn">Invest Now →</button>
    </div>
  `).join('');
}

function openInvestModal(planId) {
  selectedPlan = PLANS.find(p => p.id === planId);
  if (!selectedPlan) return;
  document.getElementById('invest-modal-title').textContent = `Invest in ${selectedPlan.name} Plan`;
  document.getElementById('invest-modal-sub').textContent = selectedPlan.desc;
  document.getElementById('invest-range-hint').textContent = `Min: PKR ${selectedPlan.min.toLocaleString()} | Max: PKR ${selectedPlan.max.toLocaleString()}`;
  document.getElementById('invest-amount').value = '';
  document.getElementById('invest-projection').style.display = 'none';
  openModal('invest-modal');

  document.getElementById('invest-amount').addEventListener('input', updateProjection);
}

function updateProjection() {
  const amt = parseFloat(document.getElementById('invest-amount').value) || 0;
  if (!selectedPlan || amt <= 0) { document.getElementById('invest-projection').style.display = 'none'; return; }
  const daily   = (amt * selectedPlan.roi / 100).toFixed(2);
  const weekly  = (daily * 7).toFixed(2);
  const total   = (amt + amt * selectedPlan.roi / 100 * selectedPlan.duration).toFixed(2);
  document.getElementById('proj-daily').textContent   = `PKR ${daily}`;
  document.getElementById('proj-weekly').textContent  = `PKR ${weekly}`;
  document.getElementById('proj-total').textContent   = `PKR ${total}`;
  document.getElementById('invest-projection').style.display = 'block';
}

async function confirmInvest() {
  const amt = parseFloat(document.getElementById('invest-amount').value);
  if (!amt || !selectedPlan) return;
  if (amt < selectedPlan.min || amt > selectedPlan.max) {
    return showToast(`Amount must be PKR ${selectedPlan.min.toLocaleString()} - ${selectedPlan.max.toLocaleString()}`, 'error');
  }
  if ((userData.balance || 0) < amt) {
    return showToast('Insufficient balance. Please deposit first.', 'error');
  }

  try {
    const userId  = currentUser._telegramId;
    const invRef  = db.collection('investments').doc();
    const now     = new Date();
    const endDate = new Date(now.getTime() + selectedPlan.duration * 86400000);

    await db.runTransaction(async tx => {
      const uRef = db.collection('users').doc(userId);
      const uSnap = await tx.get(uRef);
      const bal  = uSnap.data().balance || 0;
      if (bal < amt) throw new Error('Insufficient balance');

      tx.update(uRef, {
        balance: bal - amt,
        totalInvested: firebase.firestore.FieldValue.increment(amt)
      });
      tx.set(invRef, {
        userId, planId: selectedPlan.id, planName: selectedPlan.name,
        amount: amt, roi: selectedPlan.roi, duration: selectedPlan.duration,
        startDate: firebase.firestore.Timestamp.fromDate(now),
        endDate: firebase.firestore.Timestamp.fromDate(endDate),
        status: 'active', earnedSoFar: 0,
        lastPaidDate: firebase.firestore.Timestamp.fromDate(now),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Log transaction
      tx.set(db.collection('transactions').doc(), {
        userId, type: 'invest', amount: -amt,
        description: `Invested in ${selectedPlan.name} Plan`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    userData.balance -= amt;
    userData.totalInvested += amt;
    updateBalanceUI();
    closeModal('invest-modal');
    showToast('Investment placed successfully! 🎉', 'success');
    loadActiveInvestments();
  } catch (e) {
    showToast(e.message || 'Investment failed. Try again.', 'error');
  }
}

// ============================================================
// ACTIVE INVESTMENTS
// ============================================================
async function loadActiveInvestments() {
  const container = document.getElementById('active-investments-list');
  if (!currentUser?._telegramId) return;
  try {
    const snap = await db.collection('investments')
      .where('userId', '==', currentUser._telegramId)
      .where('status', '==', 'active').get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">📊</div>No active investments yet</div>';
      return;
    }

    const now = new Date();
    container.innerHTML = snap.docs.map(doc => {
      const inv = doc.data();
      const start  = inv.startDate.toDate();
      const end    = inv.endDate.toDate();
      const total  = end - start;
      const passed = now - start;
      const pct    = Math.min(100, Math.round((passed / total) * 100));
      const daily  = (inv.amount * inv.roi / 100).toFixed(2);
      const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
      return `
        <div class="invest-item">
          <div class="invest-item-header">
            <div class="invest-item-name">${inv.planName} Plan</div>
            <div class="invest-status active">Active</div>
          </div>
          <div class="invest-stats">
            <div class="invest-stat"><strong>PKR ${(inv.amount).toLocaleString()}</strong>Invested</div>
            <div class="invest-stat"><strong>PKR ${daily}</strong>Daily</div>
            <div class="invest-stat"><strong>${daysLeft} days</strong>Remaining</div>
          </div>
          <div class="invest-progress"><div class="invest-progress-fill" style="width:${pct}%"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
            <span>${pct}% complete</span>
            <span>Earned: PKR ${(inv.earnedSoFar || 0).toFixed(2)}</span>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">⚠️</div>Could not load investments</div>';
  }
}

// ============================================================
// RECENT ACTIVITY
// ============================================================
async function loadRecentActivity() {
  const container = document.getElementById('recent-activity');
  if (!currentUser?._telegramId) return;
  try {
    const snap = await db.collection('transactions')
      .where('userId', '==', currentUser._telegramId)
      .orderBy('createdAt', 'desc').limit(5).get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">📋</div>No recent activity</div>';
      return;
    }

    container.innerHTML = snap.docs.map(doc => {
      const tx = doc.data();
      const cls = tx.amount > 0 ? 'pos' : 'neg';
      const icon = tx.type === 'deposit' ? '💳' : tx.type === 'withdraw' ? '💸' : tx.type === 'earn' ? '💰' : '📊';
      const iconCls = tx.type === 'deposit' ? 'dep' : tx.type === 'withdraw' ? 'wit' : 'earn';
      const date = tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : 'Now';
      return `
        <div class="history-item">
          <div class="history-icon ${iconCls}">${icon}</div>
          <div class="history-meta">
            <div class="history-name">${tx.description || tx.type}</div>
            <div class="history-date">${date}</div>
          </div>
          <div class="history-amount ${cls}">${tx.amount > 0 ? '+' : ''}PKR ${Math.abs(tx.amount).toFixed(2)}</div>
        </div>`;
    }).join('');
  } catch (e) {
    console.warn('loadRecentActivity', e);
  }
}

// ============================================================
// DAILY TASKS  — with Ad-Link & Module System
// ============================================================

// Task types:
//   'checkin'   — instant claim (no link required)
//   'ad'        — must open adUrl, wait adTimer seconds, then claim
//   'social'    — open link (follow/subscribe/join), claim after visit
//   'survey'    — open survey link, claim after visit
//   'referral'  — share referral code (no link, system verifies referral count)
//   'spin'      — lucky spin wheel (once per day)

async function seedDefaultTasks() {
  try {
    const snap = await db.collection('tasks').limit(1).get();
    if (!snap.empty) return;
    const defaultTasks = [
      // ── Instant / Check-in ──
      { name: 'Daily Check-in',       type: 'checkin', desc: 'Open the app and check your portfolio',          reward: 10,  icon: '📱', minInvest: 0,    active: true, order: 1 },
      // ── Ad tasks ──
      { name: 'Watch Video Ad',       type: 'ad',      desc: 'Watch a 30-second advertisement to earn',       reward: 15,  icon: '🎬', minInvest: 0,    active: true, order: 2,
        adUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', adTimer: 30 },
      { name: 'Watch Bonus Ad',       type: 'ad',      desc: 'Watch a 60-second premium ad for extra reward', reward: 30,  icon: '📺', minInvest: 0,    active: true, order: 3,
        adUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', adTimer: 60 },
      // ── Social tasks ──
      { name: 'Join Telegram Channel', type: 'social', desc: 'Join our official Telegram channel',            reward: 25,  icon: '📣', minInvest: 0,    active: true, order: 4,
        adUrl: 'https://t.me/investpro_pakistan_bot' },
      { name: 'Follow on Instagram',  type: 'social',  desc: 'Follow our Instagram for updates',              reward: 20,  icon: '📸', minInvest: 0,    active: true, order: 5,
        adUrl: 'https://instagram.com/' },
      { name: 'Subscribe YouTube',    type: 'social',  desc: 'Subscribe to our YouTube channel',              reward: 20,  icon: '▶️', minInvest: 0,    active: true, order: 6,
        adUrl: 'https://youtube.com/' },
      // ── Survey / Offer ──
      { name: 'Complete Survey',      type: 'survey',  desc: 'Fill out a short 2-minute survey',              reward: 40,  icon: '📝', minInvest: 0,    active: true, order: 7,
        adUrl: 'https://forms.google.com/' },
      // ── Referral ──
      { name: 'Refer a Friend',       type: 'referral',desc: 'Share your referral code with a friend',        reward: 25,  icon: '🔗', minInvest: 0,    active: true, order: 8 },
      // ── Investor-locked ──
      { name: 'Investor Bonus',       type: 'checkin', desc: 'Exclusive bonus for active investors',          reward: 50,  icon: '💎', minInvest: 1000, active: true, order: 9 },
      // ── Spin Wheel ──
      { name: 'Lucky Spin',           type: 'spin',    desc: 'Spin the wheel for a random reward (1–100 PKR)',reward: 0,   icon: '🎰', minInvest: 0,    active: true, order: 10 },
    ];
    const batch = db.batch();
    defaultTasks.forEach(t => batch.set(db.collection('tasks').doc(), t));
    await batch.commit();
  } catch (e) { console.warn('seedDefaultTasks', e); }
}

// Track ad view timers  {taskId: {counting, ready, visited, remaining, intervalId}}
const adTimers = {};

async function loadTasks() {
  const container = document.getElementById('tasks-list');
  if (!currentUser?._telegramId) return;
  try {
    const [tasksSnap, userSnap] = await Promise.all([
      db.collection('tasks').where('active', '==', true).get(),
      db.collection('userTasks').where('userId', '==', currentUser._telegramId)
        .where('date', '==', todayStr()).get()
    ]);

    const done  = new Set(userSnap.docs.map(d => d.data().taskId));
    const tasks = tasksSnap.docs.sort((a, b) => (a.data().order || 0) - (b.data().order || 0));
    const total = tasks.length;
    const completed = tasks.filter(t => done.has(t.id)).length;
    let totalEarned = 0;
    userSnap.docs.forEach(d => totalEarned += d.data().reward || 0);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // ── Stats bar ──────────────────────────────────────────
    const maxEarnable = tasks.reduce((a, d) => a + (d.data().reward || 0), 0);
    const statsHTML = `
      <div class="task-stats-bar">
        <div class="task-stat-card">
          <div class="tsc-val">${completed}/${total}</div>
          <div class="tsc-lbl">Completed</div>
        </div>
        <div class="task-stat-card">
          <div class="tsc-val" style="color:#34d399">PKR ${totalEarned}</div>
          <div class="tsc-lbl">Earned Today</div>
        </div>
        <div class="task-stat-card">
          <div class="tsc-val" style="color:#fbbf24">PKR ${maxEarnable}</div>
          <div class="tsc-lbl">Max Today</div>
        </div>
      </div>
      <div class="task-overall-progress">
        <div class="task-overall-fill" style="width:${pct}%"></div>
      </div>
      <div class="task-overall-label">
        <span>${pct}% complete</span>
        <span>${total - completed} remaining</span>
      </div>`;

    if (tasks.length === 0) {
      container.innerHTML = statsHTML + '<div class="empty-state"><div class="emoji">📝</div>No tasks today</div>';
      return;
    }

    // ── Section meta ───────────────────────────────────────
    const typeLabels = {
      checkin:  { label: 'Daily Tasks',      icon: '📅', cls: 'checkin'  },
      ad:       { label: 'Watch Ads & Earn', icon: '📺', cls: 'ad'       },
      social:   { label: 'Social Tasks',     icon: '📣', cls: 'social'   },
      survey:   { label: 'Surveys & Offers', icon: '📝', cls: 'survey'   },
      referral: { label: 'Referral Tasks',   icon: '🔗', cls: 'referral' },
      spin:     { label: 'Lucky Rewards',    icon: '🎰', cls: 'spin'     },
    };

    // Pre-group to get per-section counts
    const groups = {};
    tasks.forEach(doc => {
      const type = doc.data().type || 'checkin';
      if (!groups[type]) groups[type] = [];
      groups[type].push(doc);
    });

    let cardsHTML = '';
    const typeOrder = ['checkin','ad','social','survey','referral','spin'];

    typeOrder.forEach(type => {
      const group = groups[type];
      if (!group || group.length === 0) return;
      const meta  = typeLabels[type] || { label: 'Tasks', icon: '✅', cls: 'checkin' };
      const groupDone = group.filter(d => done.has(d.id)).length;

      cardsHTML += `
        <div class="task-section-header">
          <div class="tsh-icon tsh-${meta.cls}">${meta.icon}</div>
          <span class="tsh-text">${meta.label}</span>
          <span class="tsh-count">${groupDone}/${group.length}</span>
        </div>`;

      group.forEach(doc => {
        const t      = doc.data();
        const isDone = done.has(doc.id);
        const canDo  = (userData.totalInvested || 0) >= (t.minInvest || 0);
        const reward = t.reward || 0;
        const safeName = t.name.replace(/'/g, "\\'");
        const safeUrl  = (t.adUrl || '').replace(/'/g, "\\'");
        const adTimer  = t.adTimer || 0;

        // ── Action button ──
        let actionBtn = '';
        if (!canDo) {
          actionBtn = `<button class="tsk-btn tsk-btn-locked" disabled>🔒</button>`;
        } else if (isDone) {
          actionBtn = `<button class="tsk-btn tsk-btn-done">✓ Done</button>`;
        } else if (type === 'ad') {
          const st = adTimers[doc.id];
          if (st?.ready) {
            actionBtn = `<button class="tsk-btn tsk-btn-claim" onclick="claimTask('${doc.id}',${reward},'${safeName}')">Claim<br><small>+PKR ${reward}</small></button>`;
          } else if (st?.counting) {
            actionBtn = `<button class="tsk-btn tsk-btn-timer" id="timer-btn-${doc.id}" disabled>⏱ ${st.remaining}s</button>`;
          } else {
            actionBtn = `<button class="tsk-btn tsk-btn-ad" onclick="openAdTask('${doc.id}','${safeUrl}',${adTimer},${reward},'${safeName}')">View Ad</button>`;
          }
        } else if (type === 'social' || type === 'survey') {
          if (adTimers[doc.id]?.visited) {
            actionBtn = `<button class="tsk-btn tsk-btn-claim" onclick="claimTask('${doc.id}',${reward},'${safeName}')">Claim<br><small>+PKR ${reward}</small></button>`;
          } else {
            const lbl = type === 'social' ? 'Go & Follow' : 'Start Survey';
            actionBtn = `<button class="tsk-btn tsk-btn-social" onclick="openSocialTask('${doc.id}','${safeUrl}','${safeName}')">${lbl}</button>`;
          }
        } else if (type === 'spin') {
          actionBtn = `<button class="tsk-btn tsk-btn-spin" onclick="openSpinModal('${doc.id}')">🎰 Spin</button>`;
        } else {
          // checkin / referral
          actionBtn = `<button class="tsk-btn tsk-btn-claim" onclick="claimTask('${doc.id}',${reward},'${safeName}')">Claim<br><small>+PKR ${reward}</small></button>`;
        }

        const iconCls = `tci-${type}`;
        const lockIcon = !canDo ? '🔒' : (t.icon || '✅');
        const rewardPill = type === 'spin'
          ? `<span class="task-card-reward-pill">🎰 Random</span>`
          : `<span class="task-card-reward-pill">+PKR ${reward}</span>`;

        cardsHTML += `
          <div class="task-card ${isDone ? 'done' : ''} ${!canDo ? 'locked-card' : ''}" id="task-row-${doc.id}">
            <div class="task-card-icon ${iconCls}">${lockIcon}</div>
            <div class="task-card-body">
              <div class="task-card-name">${t.name}</div>
              <div class="task-card-desc">${t.desc}${t.minInvest > 0 ? ` · Req. PKR ${t.minInvest.toLocaleString()}` : ''}</div>
              ${rewardPill}
            </div>
            <div class="task-card-action" id="task-action-${doc.id}">${actionBtn}</div>
          </div>`;
      });
    });

    container.innerHTML = statsHTML + cardsHTML;

  } catch (e) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">⚠️</div>Could not load tasks</div>';
    console.warn('loadTasks', e);
  }
}

// ── Ad Task: open URL + start countdown ──────────────────────
function openAdTask(taskId, url, timerSec, reward, taskName) {
  window.open(url, '_blank');
  adTimers[taskId] = { counting: true, ready: false, visited: true, remaining: timerSec };

  const area = document.getElementById(`task-action-${taskId}`);
  if (area) area.innerHTML = `<button class="tsk-btn tsk-btn-timer" id="timer-btn-${taskId}" disabled>⏱ ${timerSec}s</button>`;

  const interval = setInterval(() => {
    adTimers[taskId].remaining -= 1;
    const btn = document.getElementById(`timer-btn-${taskId}`);
    if (adTimers[taskId].remaining <= 0) {
      clearInterval(interval);
      adTimers[taskId].counting = false;
      adTimers[taskId].ready    = true;
      const safe = taskName.replace(/'/g, "\\'");
      if (area) area.innerHTML = `
        <button class="tsk-btn tsk-btn-claim" onclick="claimTask('${taskId}',${reward},'${safe}')">
          Claim<br><small>+PKR ${reward}</small>
        </button>`;
      showToast('Ad watched! Tap Claim to get your reward 🎉', 'success');
    } else {
      if (btn) btn.textContent = `⏱ ${adTimers[taskId].remaining}s`;
    }
  }, 1000);
  adTimers[taskId].intervalId = interval;
}

// ── Social Task: open URL, mark visited, show Claim ──────────
function openSocialTask(taskId, url, taskName) {
  window.open(url, '_blank');
  adTimers[taskId] = { visited: true };

  const area = document.getElementById(`task-action-${taskId}`);
  const safe = taskName.replace(/'/g, "\\'");

  // Optimistic update; will be overridden once we fetch reward
  if (area) area.innerHTML = `<button class="tsk-btn tsk-btn-claim" onclick="claimTask('${taskId}',0,'${safe}')">Claim</button>`;

  db.collection('tasks').doc(taskId).get().then(snap => {
    if (!snap.exists) return;
    const reward = snap.data().reward || 0;
    if (area) area.innerHTML = `
      <button class="tsk-btn tsk-btn-claim" onclick="claimTask('${taskId}',${reward},'${safe}')">
        Claim<br><small>+PKR ${reward}</small>
      </button>`;
  });
  showToast('Visit confirmed! Tap Claim to get your reward.', 'success');
}

// ── Spin Wheel ────────────────────────────────────────────────
let spinTaskId  = null;
let spinReward  = 0;
let _spinAngle  = 0;   // current rotation in degrees

function openSpinModal(taskId) {
  spinTaskId = taskId;
  _spinAngle = 0;
  drawSpinWheel(0);

  const result   = document.getElementById('spin-result');
  const claimBtn = document.getElementById('spin-claim-btn');
  const goBtn    = document.getElementById('spin-go-btn');
  if (result)   { result.textContent = ''; result.classList.remove('show'); }
  if (claimBtn)   claimBtn.style.display = 'none';
  if (goBtn)      goBtn.style.display   = 'block';

  openModal('spin-modal');
}

function spinWheel() {
  const goBtn = document.getElementById('spin-go-btn');
  if (goBtn) goBtn.style.display = 'none';

  const prizes = SPIN_PRIZES;
  const pickedIdx = Math.floor(Math.random() * prizes.length);
  spinReward = prizes[pickedIdx];

  const segDeg     = 360 / prizes.length;
  // Angle such that the picked segment sits under the pointer (top = 0°)
  const targetStop = 360 - (pickedIdx * segDeg + segDeg / 2);
  const totalSpin  = 360 * 6 + targetStop;  // 6 full rotations + land on segment

  const duration = 4500;
  const start    = performance.now();
  const fromAngle = _spinAngle % 360;

  function easeOut(t) {
    // cubic ease-out
    return 1 - Math.pow(1 - t, 3);
  }

  function frame(now) {
    const elapsed = now - start;
    const t       = Math.min(elapsed / duration, 1);
    const angle   = fromAngle + totalSpin * easeOut(t);
    _spinAngle    = angle;
    drawSpinWheel(angle % 360);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      _spinAngle = (fromAngle + totalSpin) % 360;
      // Show result
      const result = document.getElementById('spin-result');
      if (result) {
        result.textContent = `🎉 You won PKR ${spinReward}!`;
        result.classList.add('show');
      }
      const claimBtn = document.getElementById('spin-claim-btn');
      if (claimBtn) claimBtn.style.display = 'block';
    }
  }

  requestAnimationFrame(frame);
}

async function claimSpinReward() {
  if (!spinTaskId) return;
  await claimTask(spinTaskId, spinReward, 'Lucky Spin');
  closeModal('spin-modal');
}

async function claimTask(taskId, reward, taskName) {
  if (!currentUser?._telegramId) return;
  const userId = currentUser._telegramId;
  try {
    // Fetch task to verify
    const taskSnap = await db.collection('tasks').doc(taskId).get();
    if (!taskSnap.exists) return showToast('Task not found', 'error');
    const task = taskSnap.data();
    const minInvest = task.minInvest || 0;
    if ((userData.totalInvested || 0) < minInvest) {
      return showToast(`Requires PKR ${minInvest.toLocaleString()} invested to unlock this task`, 'error');
    }

    // For spin tasks, reward is passed in dynamically
    const actualReward = task.type === 'spin' ? reward : (task.reward || reward);

    // For ad tasks, verify that timer completed (adTimers state)
    if (task.type === 'ad' && !adTimers[taskId]?.ready) {
      return showToast('Please watch the full ad first!', 'error');
    }
    // For social/survey tasks, verify link was visited
    if ((task.type === 'social' || task.type === 'survey') && !adTimers[taskId]?.visited) {
      return showToast('Please visit the link first!', 'error');
    }

    // Check if already done today
    const existing = await db.collection('userTasks')
      .where('userId', '==', userId).where('taskId', '==', taskId)
      .where('date', '==', todayStr()).get();
    if (!existing.empty) return showToast('Task already completed today!', 'error');

    // Batch: create userTask + update balance + log tx
    const batch = db.batch();
    batch.set(db.collection('userTasks').doc(), {
      userId, taskId, reward: actualReward, date: todayStr(),
      taskType: task.type || 'checkin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const uRef = db.collection('users').doc(userId);
    batch.update(uRef, {
      balance: firebase.firestore.FieldValue.increment(actualReward),
      totalEarned: firebase.firestore.FieldValue.increment(actualReward),
      tasksDone: firebase.firestore.FieldValue.increment(1)
    });
    batch.set(db.collection('transactions').doc(), {
      userId, type: 'task', amount: actualReward,
      description: `Completed task: ${taskName}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();

    // Clean up local timer state
    delete adTimers[taskId];

    userData.balance += actualReward;
    userData.totalEarned += actualReward;
    updateBalanceUI();
    showToast(`+PKR ${actualReward} earned! 🎉`, 'success');
    loadTasks();
  } catch (e) {
    showToast('Failed to claim task. Try again.', 'error');
  }
}

// ============================================================
// DEPOSIT
// ============================================================
function selectPayment(method) {
  depositMethod = method;
  document.getElementById('pm-easypaisa').classList.toggle('selected', method === 'easypaisa');
  document.getElementById('pm-jazzcash').classList.toggle('selected', method === 'jazzcash');
  const account = method === 'easypaisa' ? EASYPAISA_ACCOUNT : JAZZCASH_ACCOUNT;
  const name    = method === 'easypaisa' ? 'EasyPaisa' : 'JazzCash';
  document.getElementById('payment-instructions').innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--accent)">📱 ${name} Instructions</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.8;">
      1. Open ${name} app<br>
      2. Send to: <strong style="color:var(--text)">${account}</strong><br>
      3. Enter your amount and confirm<br>
      4. Copy the Transaction ID from confirmation SMS<br>
      5. Enter TxID below and submit
    </div>`;
}

async function submitDeposit() {
  const amount = parseFloat(document.getElementById('deposit-amount').value);
  const phone  = document.getElementById('deposit-phone').value.trim();
  const txid   = document.getElementById('deposit-txid').value.trim();

  if (!amount || amount < 500) return showToast('Minimum deposit is PKR 500', 'error');
  if (!phone || phone.length < 11) return showToast('Enter valid phone number', 'error');
  if (!txid) return showToast('Transaction ID is required', 'error');

  try {
    await db.collection('deposits').add({
      userId: currentUser._telegramId,
      userName: userData.name || 'User',
      amount, phone, txid,
      method: depositMethod,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Deposit request submitted! Pending approval.', 'success');
    document.getElementById('deposit-amount').value = '';
    document.getElementById('deposit-phone').value = '';
    document.getElementById('deposit-txid').value = '';
    showPage('page-home');
  } catch (e) {
    showToast('Submission failed. Try again.', 'error');
  }
}

// ============================================================
// WITHDRAWAL
// ============================================================
function selectWithdrawMethod(method) {
  withdrawMethod = method;
  document.getElementById('wm-easypaisa').classList.toggle('selected', method === 'easypaisa');
  document.getElementById('wm-jazzcash').classList.toggle('selected', method === 'jazzcash');
}

async function submitWithdraw() {
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  const phone  = document.getElementById('withdraw-phone').value.trim();
  const name   = document.getElementById('withdraw-name').value.trim();

  if (!amount || amount < 200) return showToast('Minimum withdrawal is PKR 200', 'error');
  if (!phone || phone.length < 11) return showToast('Enter valid phone number', 'error');
  if (!name) return showToast('Enter account holder name', 'error');
  if ((userData.balance || 0) < amount) return showToast('Insufficient balance', 'error');

  try {
    await db.runTransaction(async tx => {
      const uRef = db.collection('users').doc(currentUser._telegramId);
      const uSnap = await tx.get(uRef);
      const bal = uSnap.data().balance || 0;
      if (bal < amount) throw new Error('Insufficient balance');
      tx.update(uRef, { balance: bal - amount });
      tx.set(db.collection('withdrawals').doc(), {
        userId: currentUser._telegramId,
        userName: userData.name || 'User',
        amount, phone, name,
        method: withdrawMethod,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      tx.set(db.collection('transactions').doc(), {
        userId: currentUser._telegramId, type: 'withdraw', amount: -amount,
        description: `Withdrawal via ${withdrawMethod}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    userData.balance -= amount;
    updateBalanceUI();
    showToast('Withdrawal request submitted!', 'success');
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-phone').value = '';
    document.getElementById('withdraw-name').value = '';
    showPage('page-home');
  } catch (e) {
    showToast(e.message || 'Withdrawal failed.', 'error');
  }
}

// ============================================================
// PROFILE
// ============================================================
function loadProfileData() {
  const name = userData.name || 'User';
  document.getElementById('profile-avatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-id').textContent = `ID: ${currentUser._telegramId}`;
  document.getElementById('referral-code').textContent = userData.referralCode || 'LOADING';
  document.getElementById('stat-total-invested').textContent = `PKR ${(userData.totalInvested||0).toLocaleString()}`;
  document.getElementById('stat-total-earned').textContent = `PKR ${(userData.totalEarned||0).toLocaleString()}`;
  document.getElementById('stat-referrals').textContent = userData.referralCount || 0;
  document.getElementById('stat-tasks-done').textContent = userData.tasksDone || 0;
  loadTransactionHistory();
}

async function loadTransactionHistory() {
  const container = document.getElementById('transaction-history');
  if (!currentUser?._telegramId) return;
  try {
    const snap = await db.collection('transactions')
      .where('userId', '==', currentUser._telegramId)
      .orderBy('createdAt', 'desc').limit(20).get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">📜</div>No transactions yet</div>';
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const tx = doc.data();
      const cls = tx.amount > 0 ? 'pos' : 'neg';
      const icons = { deposit:'💳', withdraw:'💸', earn:'💰', invest:'📊', task:'✅' };
      const clsMap = { deposit:'dep', withdraw:'wit', earn:'earn', invest:'earn', task:'earn' };
      const date = tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : '';
      return `
        <div class="history-item">
          <div class="history-icon ${clsMap[tx.type]||'earn'}">${icons[tx.type]||'💱'}</div>
          <div class="history-meta">
            <div class="history-name">${tx.description || tx.type}</div>
            <div class="history-date">${date}</div>
          </div>
          <div class="history-amount ${cls}">${tx.amount>0?'+':''}PKR ${Math.abs(tx.amount).toFixed(2)}</div>
        </div>`;
    }).join('');
  } catch (e) { console.warn('loadTransactionHistory', e); }
}

function copyReferral() {
  const code = userData.referralCode || '';
  if (!code) return;
  const link = `https://t.me/investpro_pakistan_bot?start=${code}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => showToast('Referral link copied! 🔗', 'success'));
  } else {
    const el = document.createElement('textarea');
    el.value = link; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Referral link copied! 🔗', 'success');
  }
}

// ============================================================
// ADMIN PANEL
// ============================================================
function showAdminNav() {
  const nav = document.querySelector('.bottom-nav');
  nav.innerHTML += `
    <div class="nav-item" onclick="showPage('page-admin')" id="nav-admin">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      Admin
    </div>`;
}

async function loadAdminData() {
  try {
    const [usersSnap, depositsSnap, withdrawalsSnap] = await Promise.all([
      db.collection('users').get(),
      // FIX: Don't orderBy createdAt — pending docs with null timestamp crash the query
      db.collection('deposits').get(),
      db.collection('withdrawals').get()
    ]);

    // Sort client-side so null timestamps don't crash the query
    const sortByDate = (a, b) => {
      const ta = a.data().createdAt?.toDate?.() || new Date(0);
      const tb = b.data().createdAt?.toDate?.() || new Date(0);
      return tb - ta;
    };
    depositsSnap.docs.sort(sortByDate);
    withdrawalsSnap.docs.sort(sortByDate);

    const pending = [...depositsSnap.docs, ...withdrawalsSnap.docs].filter(d => d.data().status === 'pending').length;
    const totalDeposited = depositsSnap.docs.filter(d=>d.data().status==='approved').reduce((a,d) => a+d.data().amount, 0);

    document.getElementById('admin-users').textContent = usersSnap.size;
    document.getElementById('admin-deposits').textContent = `PKR ${totalDeposited.toLocaleString()}`;
    document.getElementById('admin-pending').textContent = pending;
    document.getElementById('admin-profit').textContent = `PKR ${(totalDeposited * 0.1).toFixed(0)}`;

    // Deposits Table
    document.getElementById('deposits-table').innerHTML = depositsSnap.docs.map(doc => {
      const d = doc.data();
      const date = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString() : '';
      const badge = d.status === 'pending' ? 'pending-badge' : d.status === 'approved' ? 'approved-badge' : 'rejected-badge';
      const actions = d.status === 'pending' ?
        `<button class="approve-btn" onclick="processDeposit('${doc.id}','${d.userId}',${d.amount},'approved')">✓</button>
         <button class="reject-btn" onclick="processDeposit('${doc.id}','${d.userId}',${d.amount},'rejected')">✕</button>` : '-';
      return `<tr>
        <td>${d.userName}<br><span style="color:var(--muted);font-size:10px">${date}</span></td>
        <td>PKR ${d.amount}</td>
        <td>${d.method}</td>
        <td style="max-width:80px;overflow:hidden;text-overflow:ellipsis">${d.txid}</td>
        <td><span class="${badge}">${d.status}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No deposits</td></tr>';

    // Withdrawals Table
    document.getElementById('withdrawals-table').innerHTML = withdrawalsSnap.docs.map(doc => {
      const d = doc.data();
      const badge = d.status === 'pending' ? 'pending-badge' : d.status === 'approved' ? 'approved-badge' : 'rejected-badge';
      const actions = d.status === 'pending' ?
        `<button class="approve-btn" onclick="processWithdrawal('${doc.id}','${d.userId}',${d.amount},'approved')">✓</button>
         <button class="reject-btn" onclick="processWithdrawal('${doc.id}','${d.userId}',${d.amount},'rejected')">✕</button>` : '-';
      return `<tr>
        <td>${d.userName}</td>
        <td>PKR ${d.amount}</td>
        <td>${d.method}</td>
        <td>${d.phone}</td>
        <td><span class="${badge}">${d.status}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No withdrawals</td></tr>';

    // Users Table
    document.getElementById('users-table').innerHTML = usersSnap.docs.map(doc => {
      const u = doc.data();
      const date = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : '';
      return `<tr>
        <td>${u.name}</td>
        <td>PKR ${(u.balance||0).toFixed(2)}</td>
        <td>PKR ${(u.totalInvested||0).toFixed(2)}</td>
        <td>${date}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">No users</td></tr>';

    // Admin Tasks
    loadAdminTasks();
  } catch (e) { console.warn('loadAdminData', e); }
}

async function processDeposit(docId, userId, amount, status) {
  // FIX: Ensure amount is always a number (HTML attributes pass strings)
  amount = parseFloat(amount);
  if (isNaN(amount) || amount <= 0) return showToast('Invalid deposit amount', 'error');
  try {
    const batch = db.batch();
    batch.update(db.collection('deposits').doc(docId), { status });
    if (status === 'approved') {
      batch.update(db.collection('users').doc(userId), {
        balance: firebase.firestore.FieldValue.increment(amount)
      });
      batch.set(db.collection('transactions').doc(), {
        userId, type: 'deposit', amount,
        description: `Deposit approved (PKR ${amount})`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    showToast(`Deposit ${status}!`, status === 'approved' ? 'success' : 'error');
    loadAdminData();
  } catch (e) { showToast('Action failed', 'error'); }
}

async function processWithdrawal(docId, userId, amount, status) {
  // FIX: Ensure amount is always a number (HTML attributes pass strings)
  amount = parseFloat(amount);
  if (isNaN(amount) || amount <= 0) return showToast('Invalid withdrawal amount', 'error');
  try {
    const batch = db.batch();
    batch.update(db.collection('withdrawals').doc(docId), { status });
    if (status === 'rejected') {
      // Refund balance
      batch.update(db.collection('users').doc(userId), {
        balance: firebase.firestore.FieldValue.increment(amount)
      });
    }
    await batch.commit();
    showToast(`Withdrawal ${status}!`, status === 'approved' ? 'success' : 'error');
    loadAdminData();
  } catch (e) { showToast('Action failed', 'error'); }
}

async function loadAdminTasks() {
  const container = document.getElementById('admin-tasks-list');
  try {
    const snap = await db.collection('tasks').get();
    snap.docs.sort((a, b) => (a.data().order || 0) - (b.data().order || 0));
    container.innerHTML = snap.docs.map(doc => {
      const t = doc.data();
      const typeBadge = `<span style="background:rgba(99,102,241,.18);color:#a5b4fc;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">${(t.type||'checkin').toUpperCase()}</span>`;
      const urlInfo = t.adUrl ? `<div style="font-size:10px;color:var(--muted);word-break:break-all;margin-top:2px;">🔗 ${t.adUrl}${t.adTimer ? ` (${t.adTimer}s)` : ''}</div>` : '';
      return `
        <div class="task-item" style="margin:0 16px 10px;">
          <div class="task-icon">${t.icon}</div>
          <div class="task-info">
            <div class="task-name">${t.name} ${typeBadge}</div>
            <div class="task-desc">Reward: PKR ${t.reward} • ${t.active ? 'Active' : 'Inactive'}</div>
            ${urlInfo}
          </div>
          <button onclick="toggleTask('${doc.id}', ${t.active})" style="background:${t.active ? 'rgba(239,68,68,.2)' : 'rgba(16,185,129,.2)'};color:${t.active ? 'var(--red)' : 'var(--green)'};border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">
            ${t.active ? 'Disable' : 'Enable'}
          </button>
        </div>`;
    }).join('') || '<div class="empty-state"><div class="emoji">📝</div>No tasks created</div>';
  } catch (e) { console.warn('loadAdminTasks', e); }
}

async function addTask() {
  const name    = document.getElementById('new-task-name').value.trim();
  const desc    = document.getElementById('new-task-desc').value.trim();
  const reward  = parseFloat(document.getElementById('new-task-reward').value);
  const icon    = document.getElementById('new-task-icon').value.trim() || '✅';
  const min     = parseFloat(document.getElementById('new-task-min').value) || 0;
  const type    = document.getElementById('new-task-type')?.value || 'checkin';
  const adUrl   = document.getElementById('new-task-url')?.value.trim() || '';
  const adTimer = parseInt(document.getElementById('new-task-timer')?.value) || 0;

  if (!name || !desc || isNaN(reward)) return showToast('Fill all required fields', 'error');

  try {
    const snap = await db.collection('tasks').get();
    const lastOrder = snap.empty ? 0 : Math.max(0, ...snap.docs.map(d => d.data().order || 0));
    const taskData = { name, desc, reward, icon, minInvest: min, type, active: true, order: lastOrder + 1 };
    if (adUrl)   taskData.adUrl   = adUrl;
    if (adTimer) taskData.adTimer = adTimer;
    await db.collection('tasks').add(taskData);
    showToast('Task added!', 'success');
    ['new-task-name','new-task-desc','new-task-reward','new-task-icon','new-task-min','new-task-url','new-task-timer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (document.getElementById('new-task-type')) document.getElementById('new-task-type').value = 'checkin';
    loadAdminTasks();
  } catch (e) { console.error('addTask error', e); showToast('Failed to add task: ' + e.message, 'error'); }
}

async function toggleTask(taskId, current) {
  try {
    await db.collection('tasks').doc(taskId).update({ active: !current });
    showToast(`Task ${current ? 'disabled' : 'enabled'}!`, 'success');
    loadAdminTasks();
  } catch (e) { showToast('Failed', 'error'); }
}

function adminTab(tab) {
  ['deposits','withdrawals','users','tasks'].forEach(t => {
    document.getElementById(`admin-${t}-panel`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`atab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'tasks') loadAdminTasks();
}

// ============================================================
// DAILY ROI PAYOUT (Cloud Function would do this properly)
// Call this on app open — credits pending daily payouts
// ============================================================
async function processDailyPayouts() {
  if (!currentUser?._telegramId) return;
  try {
    const snap = await db.collection('investments')
      .where('userId', '==', currentUser._telegramId)
      .where('status', '==', 'active').get();

    const now = new Date();
    const batch = db.batch();
    let totalPayout = 0;

    for (const doc of snap.docs) {
      const inv = doc.data();
      const last = inv.lastPaidDate.toDate();
      const diffDays = Math.floor((now - last) / 86400000);
      if (diffDays < 1) continue;

      const endDate = inv.endDate.toDate();
      if (now > endDate) {
        batch.update(doc.ref, { status: 'ended' });
        continue;
      }

      const dailyEarn = inv.amount * inv.roi / 100;
      const payout    = dailyEarn * diffDays;
      totalPayout    += payout;

      batch.update(doc.ref, {
        lastPaidDate: firebase.firestore.Timestamp.fromDate(now),
        earnedSoFar: firebase.firestore.FieldValue.increment(payout)
      });
    }

    if (totalPayout > 0) {
      batch.update(db.collection('users').doc(currentUser._telegramId), {
        balance: firebase.firestore.FieldValue.increment(totalPayout),
        totalEarned: firebase.firestore.FieldValue.increment(totalPayout),
        todayEarnings: firebase.firestore.FieldValue.increment(totalPayout)
      });
      batch.set(db.collection('transactions').doc(), {
        userId: currentUser._telegramId, type: 'earn', amount: totalPayout,
        description: `Daily ROI payout`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
      userData.balance     += totalPayout;
      userData.totalEarned += totalPayout;
      updateBalanceUI();
      showToast(`+PKR ${totalPayout.toFixed(2)} daily ROI credited! 💰`, 'success');
    } else {
      await batch.commit();
    }
  } catch (e) { console.warn('processDailyPayouts', e); }
}

// ============================================================
// UI HELPERS
// ============================================================
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navMap = { 'page-home':'nav-home','page-plans':'nav-plans','page-tasks':'nav-tasks','page-profile':'nav-profile','page-admin':'nav-admin' };
  const navId  = navMap[pageId];
  if (navId) document.getElementById(navId)?.classList.add('active');

  // Refresh data on tab switch
  if (pageId === 'page-home')    { loadActiveInvestments(); loadRecentActivity(); }
  if (pageId === 'page-tasks')   loadTasks();
  if (pageId === 'page-profile') loadProfileData();
  if (pageId === 'page-admin')   loadAdminData();
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function hideLoading() {
  setTimeout(() => {
    document.getElementById('loading').style.opacity = '0';
    document.getElementById('loading').style.transition = 'opacity .5s';
    setTimeout(() => document.getElementById('loading').style.display = 'none', 500);
    showPage('page-home');
  }, 2200);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ============================================================
// INJECT TASK MODULE STYLES + SPIN MODAL AT RUNTIME
// ============================================================
function injectTaskModuleAssets() {

  // ── Styles ──────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `

    /* ═══════════════════════════════════════════════
       TASK PAGE HEADER STATS BAR
    ═══════════════════════════════════════════════ */
    .task-stats-bar {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 16px 16px 0;
      margin-bottom: 4px;
    }
    .task-stat-card {
      background: linear-gradient(135deg, rgba(99,102,241,.13), rgba(139,92,246,.08));
      border: 1px solid rgba(99,102,241,.2);
      border-radius: 14px;
      padding: 12px 10px;
      text-align: center;
    }
    .task-stat-card .tsc-val {
      font-size: 15px; font-weight: 800;
      color: #c4b5fd; line-height: 1.1;
    }
    .task-stat-card .tsc-lbl {
      font-size: 10px; color: var(--muted, #8b95a8);
      margin-top: 3px; font-weight: 600; letter-spacing:.04em;
    }

    /* ═══════════════════════════════════════════════
       OVERALL PROGRESS BAR
    ═══════════════════════════════════════════════ */
    .task-overall-progress {
      margin: 12px 16px 0;
      background: rgba(255,255,255,.06);
      border-radius: 99px; height: 6px; overflow: hidden;
    }
    .task-overall-fill {
      height: 100%; border-radius: 99px;
      background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);
      transition: width .6s cubic-bezier(.4,0,.2,1);
    }
    .task-overall-label {
      display: flex; justify-content: space-between;
      padding: 6px 16px 0;
      font-size: 11px; color: var(--muted, #8b95a8);
    }

    /* ═══════════════════════════════════════════════
       SECTION HEADERS
    ═══════════════════════════════════════════════ */
    .task-section-header {
      display: flex; align-items: center; gap: 8px;
      padding: 18px 16px 8px;
    }
    .task-section-header .tsh-icon {
      width: 28px; height: 28px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; flex-shrink: 0;
    }
    .task-section-header .tsh-text { font-size: 13px; font-weight: 700; color: var(--text, #e2e8f0); }
    .task-section-header .tsh-count {
      margin-left: auto;
      font-size: 10px; font-weight: 700;
      background: rgba(255,255,255,.08);
      border-radius: 99px; padding: 2px 8px;
      color: var(--muted, #8b95a8);
    }
    .tsh-checkin  { background: rgba(16,185,129,.18); }
    .tsh-ad       { background: rgba(239,68,68,.18); }
    .tsh-social   { background: rgba(59,130,246,.18); }
    .tsh-survey   { background: rgba(245,158,11,.18); }
    .tsh-referral { background: rgba(99,102,241,.18); }
    .tsh-spin     { background: rgba(236,72,153,.18); }

    /* ═══════════════════════════════════════════════
       TASK CARDS
    ═══════════════════════════════════════════════ */
    .task-card {
      margin: 0 16px 10px;
      background: var(--card, #13192b);
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 16px;
      padding: 14px;
      display: flex; align-items: center; gap: 12px;
      transition: border-color .2s, transform .15s;
      position: relative; overflow: hidden;
    }
    .task-card::before {
      content: '';
      position: absolute; inset: 0;
      opacity: 0;
      transition: opacity .2s;
    }
    .task-card.done {
      border-color: rgba(16,185,129,.25);
      background: rgba(16,185,129,.05);
    }
    .task-card.done::before { opacity: 1; }
    .task-card.locked-card { opacity: .45; }

    .task-card-icon {
      width: 44px; height: 44px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; flex-shrink: 0;
      background: rgba(255,255,255,.06);
    }
    /* Icon accent colours per type */
    .tci-checkin  { background: rgba(16,185,129,.15); }
    .tci-ad       { background: rgba(239,68,68,.15); }
    .tci-social   { background: rgba(59,130,246,.15); }
    .tci-survey   { background: rgba(245,158,11,.15); }
    .tci-referral { background: rgba(99,102,241,.15); }
    .tci-spin     { background: rgba(236,72,153,.15); }

    .task-card-body { flex: 1; min-width: 0; }
    .task-card-name {
      font-size: 13px; font-weight: 700;
      color: var(--text, #e2e8f0); line-height: 1.3;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .task-card-desc {
      font-size: 11px; color: var(--muted, #8b95a8);
      margin-top: 2px; line-height: 1.4;
    }
    .task-card-reward-pill {
      display: inline-flex; align-items: center; gap: 3px;
      background: rgba(16,185,129,.15); border: 1px solid rgba(16,185,129,.2);
      border-radius: 99px; padding: 2px 8px;
      font-size: 10px; font-weight: 700; color: #34d399;
      margin-top: 5px;
    }

    /* Ad timer progress ring wrapper */
    .task-card-action { flex-shrink: 0; }

    /* ── Action Buttons ── */
    .tsk-btn {
      border: none; border-radius: 10px;
      font-size: 11px; font-weight: 800;
      padding: 8px 12px; cursor: pointer;
      line-height: 1.2; text-align: center;
      transition: transform .1s, box-shadow .15s;
      white-space: nowrap;
    }
    .tsk-btn:active { transform: scale(.93); }

    .tsk-btn-ad     { background: linear-gradient(135deg,#ef4444,#f59e0b); color:#fff; box-shadow: 0 3px 10px rgba(239,68,68,.3); }
    .tsk-btn-timer  { background: rgba(99,102,241,.15); color:#a5b4fc; cursor:not-allowed; font-variant-numeric: tabular-nums; min-width:54px; border:1px solid rgba(99,102,241,.2); }
    .tsk-btn-claim  { background: linear-gradient(135deg,#10b981,#059669); color:#fff; box-shadow: 0 3px 10px rgba(16,185,129,.3); }
    .tsk-btn-social { background: linear-gradient(135deg,#3b82f6,#6366f1); color:#fff; box-shadow: 0 3px 10px rgba(59,130,246,.3); }
    .tsk-btn-spin   { background: linear-gradient(135deg,#ec4899,#8b5cf6); color:#fff; box-shadow: 0 3px 10px rgba(236,72,153,.3); }
    .tsk-btn-done   { background: rgba(16,185,129,.12); color:#34d399; border:1px solid rgba(16,185,129,.2); cursor:default; padding: 8px 10px; }
    .tsk-btn-locked { background: rgba(255,255,255,.06); color: var(--muted,#8b95a8); cursor:not-allowed; }

    /* Pulse on claim-ready */
    @keyframes claimPulse {
      0%,100% { box-shadow: 0 3px 10px rgba(16,185,129,.3); }
      50%      { box-shadow: 0 3px 20px rgba(16,185,129,.6); transform: scale(1.04); }
    }
    .tsk-btn-claim { animation: claimPulse 2s ease-in-out infinite; }
    .tsk-btn-claim:active { animation: none; transform: scale(.93); }

    /* Shine sweep on View Ad */
    @keyframes shineSweep {
      0%   { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    .tsk-btn-ad {
      background: linear-gradient(110deg, #ef4444 0%, #f59e0b 40%, #fff8 50%, #ef4444 60%, #f59e0b 100%);
      background-size: 200% auto;
      animation: shineSweep 2.5s linear infinite;
    }

    /* ═══════════════════════════════════════════════
       SPIN MODAL  — fullscreen centred overlay
    ═══════════════════════════════════════════════ */
    #spin-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(5, 7, 18, .85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 20px;
    }
    #spin-modal.open { display: flex; }

    .spin-modal-box {
      width: 100%;
      max-width: 360px;
      background: linear-gradient(160deg, #0f1729 0%, #13192b 100%);
      border: 1px solid rgba(99,102,241,.25);
      border-radius: 28px;
      padding: 24px 20px 20px;
      position: relative;
      box-shadow: 0 24px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04);
      animation: spinModalIn .35s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes spinModalIn {
      from { transform: scale(.85) translateY(30px); opacity:0; }
      to   { transform: scale(1)   translateY(0);    opacity:1; }
    }

    .spin-modal-close {
      position: absolute; top: 14px; right: 14px;
      width: 30px; height: 30px; border-radius: 50%;
      background: rgba(255,255,255,.08); border: none;
      color: var(--muted,#8b95a8); font-size: 16px;
      cursor: pointer; display: flex; align-items:center; justify-content:center;
      transition: background .15s;
    }
    .spin-modal-close:hover { background: rgba(255,255,255,.14); }

    .spin-modal-title {
      text-align: center; font-size: 20px; font-weight: 800;
      background: linear-gradient(135deg, #c4b5fd, #ec4899);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      margin-bottom: 4px;
    }
    .spin-modal-sub {
      text-align:center; font-size:12px; color:var(--muted,#8b95a8); margin-bottom:20px;
    }

    /* ── Wheel Container ── */
    .spin-scene {
      position: relative;
      width: 270px; height: 270px;
      margin: 0 auto 20px;
    }

    /* outer glow ring */
    .spin-scene::before {
      content:'';
      position:absolute; inset:-8px;
      border-radius:50%;
      background: conic-gradient(from 0deg,
        #ef4444,#f59e0b,#10b981,#3b82f6,#8b5cf6,#ec4899,#ef4444
      );
      opacity:.35;
      filter: blur(10px);
      animation: ringRotate 4s linear infinite;
    }
    @keyframes ringRotate { to { transform: rotate(360deg); } }

    /* outer border ring */
    .spin-ring {
      position:absolute; inset:0;
      border-radius:50%;
      border: 6px solid rgba(255,255,255,.1);
      box-shadow: inset 0 0 20px rgba(0,0,0,.4);
    }

    /* the actual wheel */
    #spin-canvas {
      position:relative; z-index:1;
      width:270px; height:270px;
      border-radius:50%;
      display:block;
    }

    /* hub cap */
    .spin-hub {
      position:absolute; top:50%; left:50%;
      transform: translate(-50%,-50%);
      width:44px; height:44px; border-radius:50%;
      background: radial-gradient(circle at 40% 35%, #fff3, #0f1729);
      border: 3px solid rgba(255,255,255,.15);
      z-index: 3;
      display:flex; align-items:center; justify-content:center;
      font-size:18px;
      box-shadow: 0 4px 12px rgba(0,0,0,.5);
    }

    /* arrow pointer */
    .spin-pointer-wrap {
      position:absolute; top:-4px; left:50%;
      transform: translateX(-50%);
      z-index:4;
    }
    .spin-pointer-svg {
      filter: drop-shadow(0 3px 6px rgba(0,0,0,.6));
    }

    /* result text */
    .spin-result-text {
      text-align:center;
      font-size:22px; font-weight:800;
      display:none; margin-bottom:14px;
      animation: bounceIn .5s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes bounceIn {
      from { transform:scale(.5); opacity:0; }
      to   { transform:scale(1);  opacity:1; }
    }
    .spin-result-text.show { display:block; }

    /* prize labels (drawn on canvas, but fallback) */

    /* Spin action buttons */
    .spin-go-btn, .spin-claim-btn {
      width:100%; padding:15px; border:none; border-radius:14px;
      font-size:15px; font-weight:800; cursor:pointer;
      transition: transform .1s, box-shadow .15s;
    }
    .spin-go-btn:active, .spin-claim-btn:active { transform:scale(.97); }
    .spin-go-btn {
      background: linear-gradient(135deg,#8b5cf6,#ec4899);
      color:#fff;
      box-shadow: 0 6px 20px rgba(139,92,246,.4);
    }
    .spin-claim-btn {
      background: linear-gradient(135deg,#10b981,#059669);
      color:#fff;
      box-shadow: 0 6px 20px rgba(16,185,129,.4);
      display:none;
    }
    .spin-prize-legend {
      display:flex; flex-wrap:wrap; gap:6px;
      justify-content:center; margin-bottom:14px;
    }
    .spin-prize-chip {
      font-size:10px; font-weight:700;
      padding:3px 9px; border-radius:99px;
      background:rgba(255,255,255,.06);
      color:var(--muted,#8b95a8);
    }

    /* ═══════════════════════════════════════════════
       ADMIN EXTRA FIELDS
    ═══════════════════════════════════════════════ */
    .atf-row { display:flex; gap:8px; margin-top:8px; }
    .atf-row select, .atf-inp {
      flex:1; background:var(--card,#13192b);
      border:1px solid rgba(255,255,255,.08);
      color:var(--text,#e2e8f0); border-radius:10px;
      padding:10px 12px; font-size:13px;
    }
    .atf-inp { width:100%; box-sizing:border-box; margin-top:8px; }
  `;
  document.head.appendChild(style);

  // ── Build Spin Modal ─────────────────────────────────────
  const spinModal = document.createElement('div');
  spinModal.id = 'spin-modal';
  spinModal.innerHTML = `
    <div class="spin-modal-box">
      <button class="spin-modal-close" onclick="closeModal('spin-modal')">✕</button>
      <div class="spin-modal-title">🎰 Lucky Spin</div>
      <div class="spin-modal-sub">Spin once daily · Win PKR 5 – 100</div>

      <div class="spin-scene">
        <div class="spin-scene" style="position:static;margin:0">
          <canvas id="spin-canvas" width="270" height="270"></canvas>
          <div class="spin-ring"></div>
          <div class="spin-hub">🎯</div>
          <div class="spin-pointer-wrap">
            <svg class="spin-pointer-svg" width="24" height="32" viewBox="0 0 24 32">
              <polygon points="12,0 24,28 12,22 0,28" fill="#f59e0b" />
              <polygon points="12,4 22,26 12,20 2,26" fill="#fbbf24" />
            </svg>
          </div>
        </div>
      </div>

      <div class="spin-prize-legend" id="spin-prize-legend"></div>
      <div class="spin-result-text" id="spin-result"></div>
      <button class="spin-go-btn" id="spin-go-btn" onclick="spinWheel()">🎰 Spin Now!</button>
      <button class="spin-claim-btn" id="spin-claim-btn" onclick="claimSpinReward()">💰 Claim Reward</button>
    </div>`;
  document.body.appendChild(spinModal);

  // Close on backdrop click
  spinModal.addEventListener('click', e => {
    if (e.target === spinModal) closeModal('spin-modal');
  });

  // Draw the wheel canvas
  drawSpinWheel();
  buildPrizeLegend();

  // Admin fields
  injectAdminTaskFields();
}

// ── Draw prize wheel on <canvas> ─────────────────────────────
const SPIN_PRIZES  = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
const SPIN_COLOURS = [
  '#ef4444','#f59e0b','#10b981','#3b82f6',
  '#8b5cf6','#ec4899','#f97316','#14b8a6',
  '#6366f1','#e11d48'
];

function drawSpinWheel(rotationDeg = 0) {
  const canvas = document.getElementById('spin-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const cx     = 135, cy = 135, r = 132;
  const seg    = (2 * Math.PI) / SPIN_PRIZES.length;
  const offset = (rotationDeg * Math.PI) / 180;

  ctx.clearRect(0, 0, 270, 270);

  SPIN_PRIZES.forEach((prize, i) => {
    const start = offset + i * seg;
    const end   = start + seg;

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = SPIN_COLOURS[i];
    ctx.fill();

    // Segment border
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + seg / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur  = 4;
    ctx.fillText(`${prize}`, r - 12, 5);
    ctx.restore();
  });
}

function buildPrizeLegend() {
  const leg = document.getElementById('spin-prize-legend');
  if (!leg) return;
  leg.innerHTML = SPIN_PRIZES.map((p, i) =>
    `<div class="spin-prize-chip" style="color:${SPIN_COLOURS[i]};background:${SPIN_COLOURS[i]}22">PKR ${p}</div>`
  ).join('');
}

function injectAdminTaskFields() {
  const minField = document.getElementById('new-task-min');
  if (!minField) return;
  const wrapper = minField.parentElement;
  const extra = document.createElement('div');
  extra.innerHTML = `
    <div class="atf-row">
      <select id="new-task-type">
        <option value="checkin">📅 Check-in</option>
        <option value="ad">📺 Watch Ad</option>
        <option value="social">📣 Social Follow</option>
        <option value="survey">📝 Survey/Offer</option>
        <option value="referral">🔗 Referral</option>
        <option value="spin">🎰 Spin Wheel</option>
      </select>
    </div>
    <input id="new-task-url"   type="url"    class="atf-inp" placeholder="Ad / Social URL (optional)">
    <input id="new-task-timer" type="number" class="atf-inp" placeholder="Ad timer in seconds (for Ad type)" min="5" max="300">
  `;
  wrapper.appendChild(extra);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTelegram();
  initAuth();
  injectTaskModuleAssets();
  // Process payouts on open
  setTimeout(processDailyPayouts, 3000);
});
