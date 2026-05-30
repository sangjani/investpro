// ============================================================
// FIREBASE CONFIG — Replace with your actual Firebase project
// ============================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ============================================================
// CONSTANTS
// ============================================================
const ADMIN_IDS = ['YOUR_TELEGRAM_ID']; // Add admin Telegram user IDs here
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
// DAILY TASKS
// ============================================================
async function seedDefaultTasks() {
  try {
    const snap = await db.collection('tasks').limit(1).get();
    if (!snap.empty) return;
    const defaultTasks = [
      { name: 'Watch Video Ad', desc: 'Watch a 30-second advertisement', reward: 15, icon: '🎬', minInvest: 0, active: true, order: 1 },
      { name: 'Daily Check-in', desc: 'Open the app and check your portfolio', reward: 10, icon: '📱', minInvest: 0, active: true, order: 2 },
      { name: 'Share Referral', desc: 'Share your referral code with 1 friend', reward: 25, icon: '🔗', minInvest: 0, active: true, order: 3 },
      { name: 'Investor Bonus', desc: 'Exclusive bonus for active investors', reward: 50, icon: '💎', minInvest: 1000, active: true, order: 4 },
      { name: 'Rate the App', desc: 'Give us a 5-star rating on Telegram', reward: 20, icon: '⭐', minInvest: 0, active: true, order: 5 },
    ];
    const batch = db.batch();
    defaultTasks.forEach(t => batch.set(db.collection('tasks').doc(), t));
    await batch.commit();
  } catch (e) { console.warn('seedDefaultTasks', e); }
}

async function loadTasks() {
  const container = document.getElementById('tasks-list');
  if (!currentUser?._telegramId) return;
  try {
    const [tasksSnap, userSnap] = await Promise.all([
      db.collection('tasks').where('active', '==', true).orderBy('order').get(),
      db.collection('userTasks').where('userId', '==', currentUser._telegramId)
        .where('date', '==', todayStr()).get()
    ]);

    const done = new Set(userSnap.docs.map(d => d.data().taskId));
    const tasks = tasksSnap.docs;
    const total = tasks.length;
    const completed = tasks.filter(t => done.has(t.id)).length;
    let totalEarned = 0;
    userSnap.docs.forEach(d => totalEarned += d.data().reward || 0);

    document.getElementById('task-progress').textContent = `${completed}/${total}`;
    document.getElementById('task-earnings').textContent = `PKR ${totalEarned}`;
    document.getElementById('task-progress-bar').style.width = total > 0 ? `${(completed/total)*100}%` : '0%';

    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">📝</div>No tasks today</div>';
      return;
    }

    container.innerHTML = tasks.map(doc => {
      const t  = doc.data();
      const isDone = done.has(doc.id);
      const canDo  = (userData.totalInvested || 0) >= (t.minInvest || 0);
      return `
        <div class="task-item ${isDone ? 'done' : ''}" onclick="claimTask('${doc.id}', ${t.reward}, '${t.name}')">
          <div class="task-icon">${t.icon || '✅'}</div>
          <div class="task-info">
            <div class="task-name">${t.name}</div>
            <div class="task-desc">${t.desc}${t.minInvest > 0 ? ` • Requires PKR ${t.minInvest.toLocaleString()} invested` : ''}</div>
          </div>
          <div>
            <div class="task-reward">+PKR ${t.reward}</div>
            <div class="task-check ${isDone ? 'done' : ''}" style="margin:4px auto 0;">
              ${isDone ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">⚠️</div>Could not load tasks</div>';
  }
}

async function claimTask(taskId, reward, taskName) {
  if (!currentUser?._telegramId) return;
  const userId = currentUser._telegramId;
  try {
    // Check if already done today
    const existing = await db.collection('userTasks')
      .where('userId', '==', userId).where('taskId', '==', taskId)
      .where('date', '==', todayStr()).get();
    if (!existing.empty) return showToast('Task already completed today!', 'error');

    // Batch: create userTask + update balance + log tx
    const batch = db.batch();
    batch.set(db.collection('userTasks').doc(), {
      userId, taskId, reward, date: todayStr(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const uRef = db.collection('users').doc(userId);
    batch.update(uRef, {
      balance: firebase.firestore.FieldValue.increment(reward),
      totalEarned: firebase.firestore.FieldValue.increment(reward),
      tasksDone: firebase.firestore.FieldValue.increment(1)
    });
    batch.set(db.collection('transactions').doc(), {
      userId, type: 'task', amount: reward,
      description: `Completed task: ${taskName}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();

    userData.balance += reward;
    userData.totalEarned += reward;
    updateBalanceUI();
    showToast(`+PKR ${reward} earned! 🎉`, 'success');
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
  const link = `https://t.me/YourBotUsername?start=${code}`;
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
      db.collection('deposits').orderBy('createdAt','desc').get(),
      db.collection('withdrawals').orderBy('createdAt','desc').get()
    ]);

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
    const snap = await db.collection('tasks').orderBy('order').get();
    container.innerHTML = snap.docs.map(doc => {
      const t = doc.data();
      return `
        <div class="task-item" style="margin:0 16px 10px;">
          <div class="task-icon">${t.icon}</div>
          <div class="task-info">
            <div class="task-name">${t.name}</div>
            <div class="task-desc">Reward: PKR ${t.reward} • ${t.active ? 'Active' : 'Inactive'}</div>
          </div>
          <button onclick="toggleTask('${doc.id}', ${t.active})" style="background:${t.active ? 'rgba(239,68,68,.2)' : 'rgba(16,185,129,.2)'};color:${t.active ? 'var(--red)' : 'var(--green)'};border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
            ${t.active ? 'Disable' : 'Enable'}
          </button>
        </div>`;
    }).join('') || '<div class="empty-state"><div class="emoji">📝</div>No tasks created</div>';
  } catch (e) { console.warn('loadAdminTasks', e); }
}

async function addTask() {
  const name   = document.getElementById('new-task-name').value.trim();
  const desc   = document.getElementById('new-task-desc').value.trim();
  const reward = parseFloat(document.getElementById('new-task-reward').value);
  const icon   = document.getElementById('new-task-icon').value.trim() || '✅';
  const min    = parseFloat(document.getElementById('new-task-min').value) || 0;

  if (!name || !desc || !reward) return showToast('Fill all required fields', 'error');

  try {
    const snap = await db.collection('tasks').orderBy('order','desc').limit(1).get();
    const lastOrder = snap.empty ? 0 : snap.docs[0].data().order || 0;
    await db.collection('tasks').add({ name, desc, reward, icon, minInvest: min, active: true, order: lastOrder + 1 });
    showToast('Task added!', 'success');
    ['new-task-name','new-task-desc','new-task-reward','new-task-icon','new-task-min'].forEach(id => document.getElementById(id).value = '');
    loadAdminTasks();
  } catch (e) { showToast('Failed to add task', 'error'); }
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
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTelegram();
  initAuth();
  // Process payouts on open
  setTimeout(processDailyPayouts, 3000);
});
