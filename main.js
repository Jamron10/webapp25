// ==========================================
// STATE & DATABASE CONFIG
// ==========================================
const STATE_KEY = 'tetherflow_data_v6';
const BOT_APP_URL = 'https://t.me/JamronCasinoBot/app'; // ⚠️ ЗАМЕНИТЕ НА ВАШУ ССЫЛКУ WEB APP
const ADMIN_ID = 5730406030; // ⚠️ ВПИШИТЕ ВАШ TELEGRAM ID

// ==========================================
// MONGODB API FALLBACK (LOCAL FOR NOW)
// ==========================================
// Внимание: Фронтенд (браузер) не может напрямую подключаться к MongoDB.
// Временно данные сохраняются в localStorage (эмуляция Mongoose).
// Для реальной работы нужно будет сделать fetch-запросы к Node.js бэкенду (bot.js).

const API_URL = 'https://webapp26.onrender.com/api'; // ⚠️ ЗАМЕНИТЕ НА АДРЕС ВАШЕГО СЕРВЕРА
let isDbActive = true;

const User = {
  async findOne(q) {
    try {
      if (!q.id) return null;
      const res = await fetch(`${API_URL}/users/${q.id}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data && Object.keys(data).length > 0 ? data : null;
    } catch(e) { console.error("API Error (findOne):", e); return null; }
  },
  async find(q = {}) {
    try {
      const res = await fetch(`${API_URL}/users`);
      if (!res.ok) return [];
      return await res.json();
    } catch(e) { console.error("API Error (find):", e); return []; }
  },
  async create(doc) {
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      return await res.json();
    } catch(e) { console.error("API Error (create):", e); return null; }
  },
  async updateOne(q, u) {
    try {
      if (!q.id) return null;
      const res = await fetch(`${API_URL}/users/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u)
      });
      return await res.json();
    } catch(e) { console.error("API Error (updateOne):", e); return null; }
  },
  async deleteOne(q) {
    try {
      if (!q.id) return null;
      const res = await fetch(`${API_URL}/users/${q.id}`, { method: 'DELETE' });
      return await res.json();
    } catch(e) { console.error("API Error (deleteOne):", e); return null; }
  }
};

// Global Application State (Дефолтные значения)
let state = {
  user: {
    balance: 0.00,
    totalEarned: 0.00,
    uncollected: 0.00,  // Сколько намайнено, но еще не собрано
    lastSync: Date.now(), // Время последней синхронизации майнинга
    level: 1,
    joinedDate: new Date().toISOString().split('T')[0],
    status: 'active', // 'active' or 'banned'
    invitedBy: null,
    usedPromos: []
  },
  tasks: [],
  friends: [],
  withdrawals: [],
  deposits: [], // Массив для истории пополнений
  settings: {
    minWithdrawal: 10,
    refBonusPercent: 10,
    refBonusFixed: 0.1,  // Фиксированный бонус за регистрацию реферала
    miningRatePerHour: 0.01, // Базовая добыча в час (для 1 уровня)
    upgradeBaseCost: 5,  // Базовая цена апгрейда
    maintenanceMode: false,
    tonWallet: 'EQAdminWalletTonkeeper123...' // Кошелек админа для Tonkeeper
  },
  admin: {
    stats: { totalUsers: 0, dailyActive: 0, totalBalance: 0, totalPaid: 0 },
    users: [],
    pendingWithdrawals: [],
    pendingDeposits: [], // Ожидающие одобрения пополнения
    recentActivity: [],
    promoCodes: []
  }
};

// Для веба выдаем рандомный ID, чтобы не склеивались сессии
const generateWebId = () => Math.floor(Math.random() * 900000) + 100000;
let localWebId = localStorage.getItem('local_web_id');
if (!localWebId) {
    localWebId = generateWebId();
    localStorage.setItem('local_web_id', localWebId);
}

let currentUser = {
  id: Number(localWebId),
  first_name: 'Web',
  last_name: 'User',
  username: 'web_' + localWebId,
  photo_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + localWebId
};

let currentTab = 'home';
let currentAdminTab = 'dashboard';
let isAdmin = false;
let profileHistoryPage = 1;
let friendsPage = 1;

// DOM Elements
const appContainer = document.getElementById('app');
const adminAppContainer = document.getElementById('admin-app');
const contentArea = document.getElementById('content-area');
const adminContentArea = document.getElementById('admin-content-area');
const headerBalance = document.getElementById('header-balance');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const toast = document.getElementById('toast');
const globalHeader = document.getElementById('app-header');

// ==========================================
// INITIALIZATION & DATABASE SYNC
// ==========================================
function parseTgData() {
  let initDataUnsafe = {};
  if (window.Telegram?.WebApp?.initDataUnsafe && Object.keys(window.Telegram.WebApp.initDataUnsafe).length > 0) {
    initDataUnsafe = window.Telegram.WebApp.initDataUnsafe;
  } else {
    try {
      const source = window.location.hash.slice(1) || window.location.search.slice(1);
      const params = new URLSearchParams(source);
      const tgWebAppData = params.get('tgWebAppData');
      if (tgWebAppData) {
        const dataParams = new URLSearchParams(tgWebAppData);
        for (let [key, value] of dataParams.entries()) {
          if (key === 'user') {
            try { initDataUnsafe.user = JSON.parse(decodeURIComponent(value)); } catch(e){}
          } else {
            initDataUnsafe[key] = decodeURIComponent(value);
          }
        }
        if (dataParams.get('start_param')) initDataUnsafe.start_param = dataParams.get('start_param');
      }
      if (params.get('startapp')) initDataUnsafe.start_param = params.get('startapp');
      if (params.get('tgWebAppStartParam')) initDataUnsafe.start_param = params.get('tgWebAppStartParam');
      if (params.get('admin') === '1') isAdmin = true;
    } catch(e) { console.warn("Parse TG data error", e); }
  }
  return initDataUnsafe;
}

async function initApp() {
  const tgData = parseTgData();
  const tg = window.Telegram?.WebApp;
  let isTgEnv = false;

  if (tgData.user) {
    isTgEnv = true;
    currentUser = tgData.user;
    try {
      if(tg) { tg.ready(); tg.expand(); tg.setHeaderColor('#0a0a0f'); }
      window.parent.postMessage(JSON.stringify({eventType: 'web_app_expand', eventData: ""}), '*');
      window.parent.postMessage(JSON.stringify({eventType: 'web_app_ready', eventData: ""}), '*');
    } catch(e) {}
  }

  await loadState(tgData);
  calculateOfflineMining();

  const bootApp = () => {
    if(!checkAccess()) return;
    updateHeaderUI();
    setupNavigation();
    setupAdminTrigger();
    
    if (currentUser.id === ADMIN_ID || isAdmin) {
      isAdmin = true;
      document.getElementById('nav-admin').classList.remove('hidden');
      document.getElementById('nav-admin').classList.add('flex');
    }
    setupAdminNavigation();
    startMiningLoop(); // Запуск цикла облачного майнинга
    renderTab(currentTab);
  };

  bootApp();
}

async function loadState(tgData) {
   let userDoc = await User.findOne({ id: currentUser.id });
   
   let globalSettings = null;
   let globalTasks = null;
   let globalPromos = null;
   
   if (currentUser.id !== ADMIN_ID) {
       const adminDoc = await User.findOne({ id: ADMIN_ID });
       if (adminDoc && adminDoc.data) {
           if (adminDoc.data.settings) globalSettings = adminDoc.data.settings;
           if (adminDoc.data.tasks) globalTasks = adminDoc.data.tasks;
           if (adminDoc.data.admin && adminDoc.data.admin.promoCodes) globalPromos = adminDoc.data.admin.promoCodes;
       }
   }

   if (userDoc && userDoc.data && Object.keys(userDoc.data).length > 0) {
      const dbData = userDoc.data;
      
      // BLOAT CLEANUP: Remove massive nested admin arrays from regular users to prevent lag
      if (dbData.admin && dbData.admin.users) {
          dbData.admin.users = [];
          dbData.admin.pendingWithdrawals = [];
          dbData.admin.pendingDeposits = [];
      }

      state.user = { ...state.user, ...dbData.user };
      state.tasks = globalTasks || dbData.tasks || state.tasks;
      state.friends = dbData.friends || [];
      state.withdrawals = dbData.withdrawals || [];
      state.deposits = dbData.deposits || [];
      
      if (!dbData.admin?.pendingDeposits) {
          if (!state.admin.pendingDeposits) state.admin.pendingDeposits = [];
      } else {
          state.admin = { ...state.admin, ...dbData.admin };
      }
      if (globalPromos) state.admin.promoCodes = globalPromos;

      if(dbData.settings) state.settings = { ...state.settings, ...dbData.settings };
      if(globalSettings) state.settings = { ...state.settings, ...globalSettings };
      
   } else {
      await registerNewUserInDb(tgData);
      if (globalTasks) state.tasks = globalTasks;
      if (globalSettings) state.settings = { ...state.settings, ...globalSettings };
      if (globalPromos) state.admin.promoCodes = globalPromos;
   }
   
   state.user.firstName = currentUser.first_name;
   state.user.lastName = currentUser.last_name;
   state.user.username = currentUser.username;
   state.user.photoUrl = currentUser.photo_url;
}

async function registerNewUserInDb(tgData) {
   const refBonusFixed = state.settings.refBonusFixed !== undefined ? state.settings.refBonusFixed : 0.1;

   if (tgData.start_param && String(tgData.start_param) !== String(currentUser.id)) {
      const inviterId = Number(tgData.start_param);
      state.user.invitedBy = inviterId;
      try {
          const inviterDoc = await User.findOne({ id: inviterId });
          if (inviterDoc) {
             const friends = inviterDoc.data.friends || [];
             if (inviterDoc.data.user.balance === undefined) inviterDoc.data.user.balance = 0;
             if (inviterDoc.data.user.totalEarned === undefined) inviterDoc.data.user.totalEarned = 0;

             inviterDoc.data.user.balance += refBonusFixed;
             inviterDoc.data.user.totalEarned += refBonusFixed;

             friends.push({
                 id: currentUser.id,
                 name: currentUser.first_name,
                 date: new Date().toISOString().split('T')[0],
                 earned: refBonusFixed
             });
             inviterDoc.data.friends = friends;
             await User.updateOne({ id: inviterId }, { $set: { data: inviterDoc.data } });
             setTimeout(() => showToast(`🤝 Вы зарегистрировались по ссылке ID: ${inviterId}`), 1500);
          } else {
             console.warn("Inviter not found in Local DB.");
          }
      } catch(e) { console.error("Referral processing error", e); }
   }
   state.user.lastSync = Date.now();
   await User.create({ id: currentUser.id, data: state });
}

async function saveState() {
   try {
      // Очищаем тяжелые массивы админа перед сохранением, чтобы база не раздувалась и не лагала
      const stateToSave = { ...state };
      if (stateToSave.admin) {
          stateToSave.admin = { 
              ...state.admin, 
              users: [], 
              pendingWithdrawals: [], 
              pendingDeposits: [] 
          };
      }
      await User.updateOne({ id: currentUser.id }, { $set: { data: stateToSave } });
   } catch (e) {
      console.error("Failed to save state", e);
   }
}

function checkAccess() {
  const blockScreen = document.getElementById('block-screen');
  const blockTitle = document.getElementById('block-title');
  const blockMsg = document.getElementById('block-msg');
  const blockIcon = document.getElementById('block-icon');

  if (state.user.status === 'banned') {
      blockTitle.textContent = 'Аккаунт заблокирован';
      blockMsg.textContent = 'Администратор ограничил ваш доступ к приложению за нарушение правил.';
      blockIcon.innerHTML = '<i class="fas fa-ban text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]"></i>';
      blockScreen.classList.remove('hidden');
      blockScreen.classList.add('flex');
      return false;
  }
  if (state.settings.maintenanceMode && !isAdmin) {
      blockTitle.textContent = 'Техническое обслуживание';
      blockMsg.textContent = 'Мы обновляем систему. Пожалуйста, зайдите немного позже.';
      blockIcon.innerHTML = '<i class="fas fa-tools text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]"></i>';
      blockScreen.classList.remove('hidden');
      blockScreen.classList.add('flex');
      return false;
  }
  blockScreen.classList.add('hidden');
  blockScreen.classList.remove('flex');
  return true;
}

// ==========================================
// MINING LOGIC
// ==========================================
function calculateOfflineMining() {
    if (!state.user.lastSync) state.user.lastSync = Date.now();
    if (state.user.uncollected === undefined) state.user.uncollected = 0;
    
    const now = Date.now();
    const elapsedMs = now - state.user.lastSync;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    
    const ratePerHour = (state.settings.miningRatePerHour !== undefined ? state.settings.miningRatePerHour : 0.01) * state.user.level;
    const mined = elapsedHours * ratePerHour;
    
    if (mined > 0) {
        state.user.uncollected += mined;
    }
    state.user.lastSync = now;
}

function startMiningLoop() {
  setInterval(() => {
    const now = Date.now();
    if (!state.user.lastSync) state.user.lastSync = now;
    
    const elapsedMs = now - state.user.lastSync;
    const ratePerHour = (state.settings.miningRatePerHour !== undefined ? state.settings.miningRatePerHour : 0.01) * state.user.level;
    const ratePerMs = ratePerHour / (1000 * 60 * 60);
    
    state.user.uncollected = (state.user.uncollected || 0) + (elapsedMs * ratePerMs);
    state.user.lastSync = now;
    
    // Update UI if on home tab
    if (currentTab === 'home') {
       const uncolEl = document.getElementById('uncollected-balance');
       if (uncolEl) {
         uncolEl.textContent = state.user.uncollected.toFixed(6);
       }
    }
  }, 1000);

  // Auto-save state to DB every 10 seconds
  setInterval(() => {
    saveState();
  }, 10000);
}

function getUpgradeCost(currentLevel) {
    if (currentLevel >= 10) return 0;
    const baseCost = state.settings.upgradeBaseCost !== undefined ? state.settings.upgradeBaseCost : 5;
    return (baseCost * Math.pow(1.5, currentLevel - 1)).toFixed(2);
}

// ==========================================
// UTILITIES
// ==========================================
function updateHeaderUI() {
  document.getElementById('user-name').className = "font-bold text-xs mb-0.5";
  document.getElementById('user-id').className = "text-[10px] text-slate-400";
  
  document.getElementById('user-name').textContent = `${currentUser.first_name} ${currentUser.last_name || ''}`.trim();
  document.getElementById('user-id').textContent = `@${currentUser.username || currentUser.id}`;
  
  const initials = currentUser.first_name.charAt(0) + (currentUser.last_name ? currentUser.last_name.charAt(0) : '');
  const avatarEl = document.getElementById('user-avatar');
  avatarEl.className = "admin-trigger-zone w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm border border-slate-700 shadow-sm cursor-pointer relative z-50 overflow-hidden";
  if (currentUser.photo_url) {
    avatarEl.innerHTML = `<img src="${currentUser.photo_url}" class="w-full h-full object-cover" alt="Avatar">`;
  } else {
    avatarEl.innerHTML = '';
    avatarEl.textContent = initials;
  }

  headerBalance.textContent = `${state.user.balance.toFixed(2)} USDT`;
}

function triggerHaptic(style = 'light') {
  if (window.Telegram?.WebApp?.HapticFeedback) {
    window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-[-20px]');
  toast.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-[-20px]');
  }, 2500);
}

function showFloatingNumber(x, y, text) {
  const el = document.createElement('div');
  el.className = 'fixed text-teal-400 font-black text-xl z-50 pointer-events-none select-none drop-shadow-md animate-slide-up';
  el.textContent = text;
  el.style.left = `${x - 15}px`;
  el.style.top = `${y - 25}px`;
  el.style.transition = 'all 0.8s cubic-bezier(0.25, 1, 0.5, 1)';
  document.body.appendChild(el);
  el.getBoundingClientRect();
  el.style.transform = `translateY(-60px) scale(1.3)`;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 800);
}

window.closeModal = () => {
  modalContent.classList.remove('animate-pop-in');
  modalOverlay.classList.add('opacity-0');
  modalContent.classList.add('scale-95');
  setTimeout(() => { modalOverlay.classList.add('hidden'); }, 300);
};

// ==========================================
// NAVIGATION (MAIN APP)
// ==========================================
function setupNavigation() {
  const navBtns = document.querySelectorAll('#app .nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      triggerHaptic('light');

      // Animating the icon on tap
      const icon = e.currentTarget.querySelector('i');
      icon.style.transform = 'scale(1.2)';
      setTimeout(() => icon.style.transform = 'scale(1)', 150);

      if (tab === 'admin') {
        openAdminPanel();
        return;
      }
      
      navBtns.forEach(b => {
        if(b.id !== 'nav-admin' || !isAdmin) {
            b.classList.remove('text-teal-400', 'active');
            b.classList.add('text-slate-400');
        }
      });
      e.currentTarget.classList.remove('text-slate-400');
      e.currentTarget.classList.add('text-teal-400', 'active');
      
      if (tab === 'profile') profileHistoryPage = 1;
      if (tab === 'friends') friendsPage = 1;
      currentTab = tab;
      renderTab(tab);
    });
  });
}

function setupAdminTrigger() {
  let taps = 0;
  let timeout;
  document.addEventListener('click', (e) => {
    if (e.target.closest('.admin-trigger-zone')) {
      taps++;
      clearTimeout(timeout);
      timeout = setTimeout(() => taps = 0, 2000);
      if (taps >= 5) {
        if(!isAdmin) {
            isAdmin = true;
            document.getElementById('nav-admin').classList.remove('hidden');
            document.getElementById('nav-admin').classList.add('flex');
            showToast("🔑 Панель администратора разблокирована");
            triggerHaptic('heavy');
        }
        taps = 0;
      }
    }
  });
}

function renderTab(tab) {
  contentArea.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'fade-in h-full';

  // Скрываем общий хедер на главной, так как там есть свой кастомный
  if (tab === 'home') {
      globalHeader.classList.add('hidden');
      globalHeader.classList.remove('flex');
  } else {
      globalHeader.classList.remove('hidden');
      globalHeader.classList.add('flex');
      updateHeaderUI();
  }

  switch (tab) {
    case 'home': container.innerHTML = renderHome(); setTimeout(attachHomeEvents, 0); break;
    case 'tasks': container.innerHTML = renderTasks(); setTimeout(attachTaskEvents, 0); break;
    case 'friends': container.innerHTML = renderFriends(); setTimeout(attachFriendsEvents, 0); break;
    case 'profile': container.innerHTML = renderProfile(); setTimeout(attachProfileEvents, 0); break;
  }
  contentArea.appendChild(container);
}

// ==========================================
// MAIN APP VIEWS
// ==========================================
function renderHome() {
  if (state.user.uncollected === undefined) state.user.uncollected = 0;
  const avatar = currentUser.photo_url 
    ? `<img src="${currentUser.photo_url}" class="w-full h-full object-cover" alt="Avatar">` 
    : (currentUser.first_name.charAt(0) + (currentUser.last_name ? currentUser.last_name.charAt(0) : ''));
  const ratePerHour = (state.settings.miningRatePerHour !== undefined ? state.settings.miningRatePerHour : 0.01) * state.user.level;
  const hashrate = state.user.level * 100;

  return `
    <div class="flex flex-col h-full pt-4 pb-4 px-5 relative bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-slate-900 overflow-y-auto hide-scrollbar">
      
      <!-- Profile widget top-left -->
      <div class="admin-trigger-zone animate-slide-up flex items-center space-x-3 mb-4 shrink-0 bg-slate-800/60 p-1 pr-3 rounded-full backdrop-blur-md border border-slate-700/50 w-max shadow-lg cursor-pointer hover:bg-slate-700/60 transition-colors">
        <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold shadow-inner border border-slate-700/80 text-sm overflow-hidden">
          ${avatar}
        </div>
        <div class="flex flex-col">
          <span class="text-white font-bold text-xs leading-tight tracking-wide">${currentUser.first_name}</span>
          <span class="text-teal-400 text-[10px] font-semibold leading-tight">Баланс: <span id="main-balance">${state.user.balance.toFixed(2)}</span> 
        </div>
      </div>

      <!-- Cloud Miner Visual -->
      <div class="flex-1 flex flex-col items-center justify-center relative w-full min-h-[220px] animate-slide-up delay-75 shrink-0 my-2">
        <div class="float-anim relative w-full flex items-center justify-center">
          <div class="absolute inset-0 bg-teal-400/10 rounded-full blur-3xl animate-pulse scale-150 pointer-events-none"></div>
          
          <div class="relative z-10 w-56 h-56 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-[6px] border-slate-700 shadow-[0_0_40px_rgba(168,85,247,0.15)] flex flex-col items-center justify-center overflow-hidden">
            <div class="absolute inset-0 flex items-center justify-center opacity-10">
              <i class="fas fa-fan text-[12rem] text-teal-400 animate-spin-slow"></i>
            </div>
            <div class="absolute inset-2 rounded-full border border-teal-500/30"></div>
            
            <div class="relative z-20 flex flex-col items-center px-4 text-center">
              <p class="text-slate-400 text-[9px] uppercase tracking-widest mb-1 font-bold">Намайнено</p>
              <span class="text-2xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-400 tracking-tight drop-shadow-sm transition-all" id="uncollected-balance">${state.user.uncollected.toFixed(6)}</span>
              <span class="text-[10px] text-teal-400 font-bold mt-1 neon-text">USDT</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Collect Button -->
      <div class="animate-slide-up delay-150 w-full mb-4 shrink-0 mt-2">
        <button id="collect-btn" class="w-full py-3.5 bg-teal-500 hover:bg-teal-400 text-slate-900 rounded-2xl font-black text-base shadow-[0_0_20px_rgba(168,85,247,0.3)] tap-effect uppercase tracking-wider relative overflow-hidden group">
          <div class="absolute inset-0 bg-white/20 transform -skew-x-12 -translate-x-full group-hover:animate-[shimmer_1s_infinite]"></div>
          Собрать прибыль
        </button>
      </div>

      <!-- Miner Stats & Upgrade Panel -->
      <div class="w-full mt-auto bg-slate-800/80 p-4 rounded-3xl border border-slate-700/50 backdrop-blur-md shadow-lg animate-slide-up delay-225 shrink-0">
        <div class="flex justify-between items-center mb-3">
          <div>
            <p class="text-white font-bold text-xs flex items-center"><i class="fas fa-server text-teal-400 mr-2 drop-shadow-md"></i> ${hashrate} GH/s</p>
            <p class="text-slate-400 text-[9px] uppercase mt-1 tracking-wider">Уровень ${state.user.level} / 10</p>
          </div>
          <div class="text-right">
            <p class="text-teal-400 font-black text-xs drop-shadow-sm">+${ratePerHour.toFixed(3)} $ / ч</p>
          </div>
        </div>
        
        <button id="upgrade-btn" class="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs transition-colors tap-effect flex justify-center items-center border border-slate-600 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed group" ${state.user.level >= 10 ? 'disabled' : ''}>
          ${state.user.level >= 10 
            ? '<span><i class="fas fa-star text-yellow-400 mr-1 group-hover:scale-110 transition-transform"></i> Макс. мощность</span>' 
            : `<span>Улучшить оборудование</span> <span class="bg-slate-900 px-2 py-1 rounded-lg text-teal-400 text-[10px] ml-2 border border-slate-800 shadow-sm group-hover:text-white transition-colors">${getUpgradeCost(state.user.level)} USDT</span>`}
        </button>
      </div>
    </div>
  `;
}

function attachHomeEvents() {
  const collectBtn = document.getElementById('collect-btn');
  const upgradeBtn = document.getElementById('upgrade-btn');
  const mainBalance = document.getElementById('main-balance');
  const uncolEl = document.getElementById('uncollected-balance');

  collectBtn.addEventListener('click', (e) => {
    if (state.user.uncollected < 0.00001) {
       showToast("Пока нечего собирать!");
       triggerHaptic('error');
       return;
    }
    
    triggerHaptic('success');
    const amount = state.user.uncollected;
    
    state.user.balance += amount;
    state.user.totalEarned += amount;
    state.user.uncollected = 0;
    state.user.lastSync = Date.now();

    // Реферальная система (% от сбора)
    if (state.user.invitedBy) {
       const refBonus = amount * ((state.settings.refBonusPercent || 10) / 100);
       User.findOne({ id: Number(state.user.invitedBy) }).then(invRes => {
           if (invRes && invRes.data) {
               if (invRes.data.user.balance === undefined) invRes.data.user.balance = 0;
               if (invRes.data.user.totalEarned === undefined) invRes.data.user.totalEarned = 0;

               invRes.data.user.balance += refBonus;
               invRes.data.user.totalEarned += refBonus;
               const meInFriends = invRes.data.friends.find(f => String(f.id) === String(currentUser.id));
               if(meInFriends) meInFriends.earned += refBonus;
               User.updateOne({ id: Number(state.user.invitedBy) }, { $set: { data: invRes.data } });
           }
       });
    } 
    else if (state.friends.length > 0 && !isDbActive && Math.random() < 0.2) {
       // Офлайн симуляция для демо
       const f = state.friends[Math.floor(Math.random() * state.friends.length)];
       const refBonus = amount * ((state.settings.refBonusPercent || 10) / 100);
       f.earned += refBonus;
       state.user.balance += refBonus;
       state.user.totalEarned += refBonus;
       showToast(`Реф. бонус от ${f.name}: +${refBonus.toFixed(4)} USDT`);
    }

    // Smooth counter update
    mainBalance.textContent = state.user.balance.toFixed(2);
    uncolEl.style.transform = 'scale(0.8)';
    uncolEl.style.opacity = '0.5';
    setTimeout(() => {
        uncolEl.textContent = '0.000000';
        uncolEl.style.transform = 'scale(1)';
        uncolEl.style.opacity = '1';
    }, 150);
    
    headerBalance.textContent = `${state.user.balance.toFixed(2)} USDT`;
    
    showFloatingNumber(e.clientX || window.innerWidth/2, e.clientY || window.innerHeight/2, `+${amount.toFixed(4)}`);
    saveState();
  });

  upgradeBtn.addEventListener('click', () => {
    if (state.user.level >= 10) return;
    
    const cost = parseFloat(getUpgradeCost(state.user.level));
    if (state.user.balance >= cost) {
      triggerHaptic('heavy');
      state.user.balance -= cost;
      state.user.level += 1;
      
      calculateOfflineMining(); 
      saveState();
      
      showToast(`⚡ Оборудование улучшено до уровня ${state.user.level}!`);
      renderTab('home'); 
    } else {
      triggerHaptic('error');
      showToast(`Недостаточно средств. Нужно еще ${(cost - state.user.balance).toFixed(2)} USDT`);
    }
  });
}

function renderTasks() {
  let html = `
    <div class="mb-6 px-4 pt-4 animate-slide-up">
      <h2 class="text-xl font-bold text-white mb-1">Заработать больше</h2>
      <p class="text-slate-400 text-xs">Выполняйте задания для получения USDT.</p>
    </div>
    <div class="space-y-3 px-4 pb-4">
  `;

  if(state.tasks.length === 0) {
      html += `<p class="animate-slide-up delay-75 text-center text-slate-500 py-10 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-sm">Пока нет доступных заданий.</p>`;
  }

  state.tasks.forEach((task, index) => {
    const delay = 75 + (index * 75);
    let statusBadge = ''; let btnClass = ''; let btnText = '';

    if (task.status === 'todo') {
      statusBadge = `<span class="px-2 py-0.5 bg-slate-700 text-slate-300 text-[9px] rounded font-medium">К выполнению</span>`;
      btnClass = `bg-white text-slate-900 hover:bg-slate-200`;
      btnText = `Начать`;
    } else if (task.status === 'verify') {
      statusBadge = `<span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] rounded font-medium">Ожидает проверки</span>`;
      btnClass = `bg-blue-500 text-white hover:bg-blue-400 shadow-lg shadow-blue-500/20`;
      btnText = `Проверить`;
    } else if (task.status === 'checking') {
      statusBadge = `<span class="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[9px] rounded font-medium">Проверка</span>`;
      btnClass = `bg-slate-700 text-slate-400 cursor-not-allowed`;
      btnText = `<i class="fas fa-spinner fa-spin"></i>`;
    } else if (task.status === 'completed') {
      statusBadge = `<span class="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-[9px] rounded font-medium">Завершено</span>`;
      btnClass = `bg-teal-500/10 text-teal-400 cursor-not-allowed border border-teal-500/30`;
      btnText = `<i class="fas fa-check"></i>`;
    }

    html += `
      <div class="animate-slide-up bg-slate-850 rounded-2xl p-3 flex items-center justify-between border border-slate-700/50 shadow-md transition-transform tap-effect hover:border-slate-600" style="animation-delay: ${delay}ms">
        <div class="flex items-center space-x-3 w-2/3">
          <div class="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl text-white shadow-inner shrink-0 border border-slate-700 group-hover:scale-110 transition-transform">
            <i class="fab ${task.icon} text-teal-400"></i>
          </div>
          <div class="min-w-0">
            <h3 class="font-bold text-xs text-white mb-1 truncate w-full" title="${task.title}">${task.title}</h3>
            <div class="flex items-center space-x-2">
              <span class="text-teal-400 font-extrabold text-[11px] shrink-0">+${task.reward.toFixed(2)} USDT</span>
              ${statusBadge}
            </div>
          </div>
        </div>
        <button class="task-action-btn px-3 py-2 rounded-xl font-bold text-xs transition-colors shrink-0 ml-2 ${btnClass}" data-id="${task.id}" ${['checking', 'completed'].includes(task.status) ? 'disabled' : ''}>
          ${btnText}
        </button>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

function attachTaskEvents() {
  document.querySelectorAll('.task-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = e.currentTarget.dataset.id;
      const taskIndex = state.tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return;

      const task = state.tasks[taskIndex];
      triggerHaptic('medium');

      if (task.status === 'todo') {
        if (window.Telegram?.WebApp && task.type === 'tg') {
          window.Telegram.WebApp.openTelegramLink(task.url);
        } else {
          window.open(task.url, '_blank');
        }
        state.tasks[taskIndex].status = 'verify';
        saveState();
        renderTab('tasks');
        return;
      }

      if (task.status === 'verify') {
        state.tasks[taskIndex].status = 'checking';
        saveState();
        renderTab('tasks');

        setTimeout(() => {
          const isSuccess = Math.random() > 0.2; // 80% success
          if (isSuccess) {
            state.tasks[taskIndex].status = 'completed';
            state.user.balance += state.tasks[taskIndex].reward;
            state.user.totalEarned += state.tasks[taskIndex].reward;
            showToast(`Награда получена: +${state.tasks[taskIndex].reward} USDT!`);
            triggerHaptic('success');
            updateHeaderUI();
          } else {
            state.tasks[taskIndex].status = 'todo';
            showToast(`Ошибка проверки. Убедитесь, что выполнили задание.`);
            triggerHaptic('error');
          }
          saveState();
          if (currentTab === 'tasks') renderTab('tasks');
        }, 3000);
      }
    });
  });
}

function renderFriends() {
  const refFixed = state.settings.refBonusFixed !== undefined ? state.settings.refBonusFixed : 0.1;
  const refPercent = state.settings.refBonusPercent !== undefined ? state.settings.refBonusPercent : 10;
  
  const itemsPerPage = 10;
  const totalPages = Math.ceil(state.friends.length / itemsPerPage) || 1;
  if (friendsPage > totalPages) friendsPage = totalPages;
  const currentFriends = state.friends.slice((friendsPage - 1) * itemsPerPage, friendsPage * itemsPerPage);

  let html = `
    <div class="px-3 pt-3 pb-3">
      <div class="text-center mb-2 animate-slide-up flex flex-col items-center">
        <div class="w-8 h-8 mx-auto bg-gradient-to-br from-blue-500 to-teal-400 rounded-full flex items-center justify-center text-sm text-white mb-1 shadow-lg shadow-teal-500/20 border-2 border-slate-800 float-anim">
          <i class="fas fa-user-friends drop-shadow-md"></i>
        </div>
        <h2 class="text-sm font-bold text-white mb-0.5">Пригласить друзей</h2>
        <p class="text-slate-400 text-[9px] px-2 leading-tight">Получай <span class="text-white font-bold">${refFixed} USDT</span> сразу и <span class="text-white font-bold">${refPercent}%</span> от их сборов!</p>
      </div>
      
      <div class="grid grid-cols-2 gap-2 mb-2 animate-slide-up delay-75">
        <div class="bg-slate-850 p-1.5 rounded-lg border border-slate-700/50 text-center shadow-sm">
          <p class="text-[8px] text-slate-400 mb-0.5 uppercase tracking-wider">Приглашено</p>
          <p class="text-sm font-bold text-white leading-none">${state.friends.length}</p>
        </div>
        <div class="bg-slate-850 p-1.5 rounded-lg border border-slate-700/50 text-center shadow-sm">
          <p class="text-[8px] text-slate-400 mb-0.5 uppercase tracking-wider">Заработано</p>
          <p class="text-sm font-bold text-teal-400 leading-none">+${state.friends.reduce((sum, f) => sum + f.earned, 0).toFixed(2)}</p>
        </div>
      </div>
      
      <div class="animate-slide-up delay-150">
        <button id="copy-link-btn" class="w-full py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-900 rounded-lg font-bold text-[11px] mb-2 transition-colors tap-effect shadow-md flex items-center justify-center space-x-2">
          <i class="fas fa-copy"></i>
          <span>Копировать ссылку</span>
        </button>
      </div>

      ${currentUser.username && currentUser.username.startsWith('web_') ? `
      <div class="mb-2 p-1.5 bg-slate-850 border border-slate-700 rounded-lg shadow-inner animate-slide-up delay-225 flex justify-between items-center">
        <p class="text-[8px] text-teal-400 font-bold uppercase tracking-wider m-0"><i class="fas fa-info-circle mr-1"></i> Браузер</p>
        <button id="test-ref-btn" class="px-2.5 py-1 bg-slate-800 text-white border border-slate-600 rounded-md font-bold text-[9px] hover:bg-slate-700 transition-colors tap-effect shadow-sm">
          <i class="fas fa-user-plus mr-1 text-teal-400"></i>Тест-реф
        </button>
      </div>` : ''}
      
      <div class="animate-slide-up delay-300">
        <div class="flex justify-between items-center mb-1.5 px-1">
          <h3 class="font-bold text-white text-[10px]">Ваши рефералы</h3>
          <button id="top-refs-btn" class="text-[9px] text-teal-400 font-bold bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/30 tap-effect flex items-center shadow-sm hover:bg-teal-500/20 transition-colors">
            <i class="fas fa-trophy mr-1 text-yellow-400"></i> Топ лидеров
          </button>
        </div>
        <div class="space-y-1 pb-1">
  `;

  if (state.friends.length === 0) {
    html += `
      <div class="text-center py-3 bg-slate-850 rounded-lg border border-slate-700/50">
        <i class="fas fa-ghost text-xl mb-1 text-slate-600"></i>
        <p class="text-slate-500 font-medium text-[9px]">Вы пока не пригласили друзей.</p>
      </div>
    `;
  } else {
    currentFriends.forEach(friend => {
      html += `
        <div class="bg-slate-850 p-1.5 rounded-lg border border-slate-700/50 flex items-center justify-between shadow-sm hover:border-slate-600 transition-colors tap-effect">
          <div class="flex items-center space-x-2">
            <div class="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-white shadow-inner border border-slate-600 shrink-0">${friend.name.charAt(0)}</div>
            <div class="min-w-0">
              <p class="font-bold text-[10px] text-white truncate max-w-[120px]">${friend.name}</p>
              <p class="text-[7px] text-slate-500 mt-0.5">${friend.date}</p>
            </div>
          </div>
          <div class="text-right shrink-0">
            <p class="text-teal-400 font-bold text-[10px]">+${friend.earned.toFixed(3)}</p>
            <p class="text-[6px] text-slate-500 font-medium uppercase mt-0.5">USDT</p>
          </div>
        </div>
      `;
    });

    if (totalPages > 1) {
      html += `
        <div class="flex items-center justify-between mt-1 px-1 animate-slide-up delay-400">
          <button id="prev-friend-btn" class="px-2 py-1 bg-slate-800 rounded-md text-[9px] font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-effect" ${friendsPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left mr-1"></i> Назад
          </button>
          <span class="text-[9px] text-slate-500 font-medium">Стр. ${friendsPage} из ${totalPages}</span>
          <button id="next-friend-btn" class="px-2 py-1 bg-slate-800 rounded-md text-[9px] font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-effect" ${friendsPage >= totalPages ? 'disabled' : ''}>
            Вперед <i class="fas fa-chevron-right ml-1"></i>
          </button>
        </div>
      `;
    }
  }
  html += `</div></div></div>`;
  return html;
}

function attachFriendsEvents() {
  document.getElementById('copy-link-btn').addEventListener('click', () => {
    triggerHaptic('medium');
    const link = `${BOT_APP_URL}?startapp=${currentUser.id}`;
    navigator.clipboard.writeText(link).then(() => {
      showToast("Ссылка для приглашения скопирована!");
    }).catch(err => {
      const textArea = document.createElement("textarea");
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
      showToast("Ссылка для приглашения скопирована!");
    });
  });

  const topRefsBtn = document.getElementById('top-refs-btn');
  if (topRefsBtn) {
    topRefsBtn.addEventListener('click', () => {
      triggerHaptic('medium');
      if (typeof window.openLeaderboardModal === 'function') {
         window.openLeaderboardModal();
      }
    });
  }

  const testBtn = document.getElementById('test-ref-btn');
  if(testBtn) {
      testBtn.addEventListener('click', () => {
        triggerHaptic('success');
        const mockNames = ['Alex', 'Dmitry', 'Elena', 'Ivan', 'Maria'];
        const randomName = mockNames[Math.floor(Math.random() * mockNames.length)];
        const refFixed = state.settings.refBonusFixed !== undefined ? state.settings.refBonusFixed : 0.1;
        
        state.user.balance += refFixed;
        state.user.totalEarned += refFixed;
        
        state.friends.push({
          id: Math.floor(Math.random() * 10000),
          name: randomName + Math.floor(Math.random() * 100),
          date: new Date().toLocaleDateString(),
          earned: refFixed
        });
        saveState();
        renderTab('friends');
        showToast(`Тест: ${randomName} стал рефералом (+${refFixed} USDT)`);
      });
  }

  const prevFBtn = document.getElementById('prev-friend-btn');
  if (prevFBtn) {
    prevFBtn.addEventListener('click', () => {
      triggerHaptic('light');
      if (friendsPage > 1) {
        friendsPage--;
        renderTab('friends');
      }
    });
  }

  const nextFBtn = document.getElementById('next-friend-btn');
  if (nextFBtn) {
    nextFBtn.addEventListener('click', () => {
      triggerHaptic('light');
      friendsPage++;
      renderTab('friends');
    });
  }
}

function renderProfile() {
  const minWith = state.settings.minWithdrawal;
  
  const history = [
    ...(state.withdrawals || []).map(w => ({...w, type: 'withdraw'})),
    ...(state.deposits || []).map(d => ({...d, type: 'deposit'}))
  ].sort((a,b) => new Date(a.date) - new Date(b.date)).reverse();

  const itemsPerPage = 5;
  const totalPages = Math.ceil(history.length / itemsPerPage) || 1;
  if (profileHistoryPage > totalPages) profileHistoryPage = totalPages;
  const currentHistory = history.slice((profileHistoryPage - 1) * itemsPerPage, profileHistoryPage * itemsPerPage);

  let html = `
    <div class="px-4 pb-4">
      <!-- Premium Profile Header -->
      <div class="animate-slide-up relative bg-gradient-to-br from-slate-800 to-slate-850 rounded-xl p-4 border border-slate-700/50 shadow-sm mb-3 mt-1 overflow-hidden group">
        <div class="absolute -right-6 -top-6 w-20 h-20 bg-teal-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-teal-500/20 transition-colors duration-500"></div>

        <div class="flex items-center space-x-3 mb-4 relative z-10">
          <div class="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-xl font-bold text-white border border-slate-600 overflow-hidden shrink-0 shadow-inner">
            ${currentUser.photo_url ? `<img src="${currentUser.photo_url}" class="w-full h-full object-cover" alt="Avatar">` : currentUser.first_name.charAt(0)}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-white truncate pr-2">${currentUser.first_name}</h2>
              <div class="bg-slate-900/80 px-2.5 py-1.5 rounded-md border border-slate-700/50 flex items-center space-x-1 shrink-0 tap-effect cursor-pointer shadow-sm" onclick="navigator.clipboard.writeText('${currentUser.id}'); showToast('ID скопирован!')">
                <span class="text-[10px] text-slate-400 font-mono">ID: <span class="text-white font-bold">${currentUser.id}</span></span>
                <i class="fas fa-copy text-[10px] text-teal-400"></i>
              </div>
            </div>
            <p class="text-slate-400 text-xs truncate mt-1">@${currentUser.username || 'user'}</p>
          </div>
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-slate-700/50 relative z-10">
          <div class="flex flex-col">
             <span class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Всего добыто</span>
             <span class="text-sm font-black text-teal-400">${state.user.totalEarned.toFixed(2)} USDT</span>
          </div>
          <div class="flex flex-col text-right">
             <span class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Зарегистрирован</span>
             <span class="text-[11px] text-white font-medium">${state.user.joinedDate}</span>
          </div>
        </div>
      </div>

      <!-- Compact Balance Card -->
      <div class="animate-slide-up delay-75 bg-gradient-to-br from-slate-800 to-slate-850 rounded-xl p-4 border border-slate-700/50 mb-3 shadow-sm flex items-center justify-between">
        <div>
          <span class="text-slate-400 text-[10px] font-medium uppercase tracking-wide">Ваш баланс</span>
          <div class="font-black text-teal-400 text-2xl leading-none mt-1.5">${state.user.balance.toFixed(2)} <span class="text-[11px] text-teal-500">USDT</span></div>
          <span class="text-slate-500 text-[10px] inline-block mt-1.5">Мин. вывод: ${minWith} USDT</span>
        </div>
        <div class="flex space-x-3 shrink-0">
          <button id="deposit-btn" class="w-12 h-12 bg-blue-500 hover:bg-blue-400 text-white rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center transition-colors tap-effect" title="Пополнить">
            <i class="fas fa-plus text-lg"></i>
          </button>
          <button id="withdraw-btn" class="w-12 h-12 bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl flex items-center justify-center transition-colors tap-effect" title="Вывести">
            <i class="fas fa-minus text-lg"></i>
          </button>
        </div>
      </div>

      <!-- Compact Promo Section -->
      <div class="animate-slide-up delay-150 bg-slate-850 rounded-xl p-3 border border-slate-700/50 mb-4 shadow-sm flex items-center space-x-3">
        <div class="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-teal-400 shrink-0">
          <i class="fas fa-gift text-sm"></i>
        </div>
        <input type="text" id="promo-input" class="flex-1 bg-transparent border-none text-white text-xs focus:ring-0 outline-none placeholder-slate-500 uppercase font-mono py-1" placeholder="ВВЕДИТЕ ПРОМОКОД...">
        <button id="activate-promo-btn" class="py-2 px-4 bg-teal-500 hover:bg-teal-400 text-slate-900 rounded-lg font-bold text-xs tap-effect shadow-sm shadow-teal-500/20 transition-colors shrink-0">ОК</button>
      </div>

      <!-- History Section -->
      <div class="animate-slide-up delay-225">
        <h3 class="font-bold text-white mb-2 text-xs px-1">История транзакций</h3>
        <div class="space-y-1.5 pb-10">
  `;

  if (history.length === 0) {
    html += `<p class="text-center text-slate-500 text-[11px] py-6 bg-slate-850 rounded-xl border border-slate-700/50">История пуста.</p>`;
  } else {
    const renderItem = (t) => {
      let isDep = t.type === 'deposit';
      let statusColor = t.status === 'pending' ? 'text-yellow-400' : (t.status === 'completed' ? (isDep ? 'text-blue-400' : 'text-teal-400') : 'text-red-400');
      let statusIcon = t.status === 'pending' ? 'fa-clock' : (t.status === 'completed' ? 'fa-check-circle' : 'fa-times-circle');
      let displayStatus = t.status === 'pending' ? 'В обработке' : (t.status === 'completed' ? 'Выполнено' : 'Отклонено');
      
      let amountClass = isDep ? 'text-blue-400' : 'text-white';
      let amountPrefix = isDep ? '+' : '-';
      let typeIcon = isDep ? 'fa-arrow-down' : 'fa-arrow-up';
      let infoText = isDep ? `Пополнение • ${t.method}` : `Вывод • ${t.network}`;

      return `
        <div class="bg-slate-850 p-2 rounded-xl border border-slate-700/50 flex items-center justify-between shadow-sm hover:border-slate-600 transition-colors tap-effect">
          <div class="flex items-center space-x-2.5">
            <div class="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 text-[10px]">
               <i class="fas ${typeIcon}"></i>
            </div>
            <div>
              <p class="font-bold text-[11px] ${amountClass}">${amountPrefix}${t.amount.toFixed(2)} USDT</p>
              <p class="text-[8px] text-slate-500 font-medium mt-0.5">${new Date(t.date).toLocaleString()} • ${infoText}</p>
            </div>
          </div>
          <div class="flex flex-col items-end">
            <span class="${statusColor} text-[8px] font-bold flex items-center space-x-1 bg-slate-900 px-1.5 py-0.5 rounded">
              <i class="fas ${statusIcon}"></i>
              <span class="capitalize">${displayStatus}</span>
            </span>
            ${!isDep ? `<span class="text-[7px] text-slate-600 truncate w-20 text-right mt-1 font-mono" title="${t.address}">${t.address.substring(0,6)}...${t.address.slice(-4)}</span>` : ''}
          </div>
        </div>
      `;
    };

    currentHistory.forEach(t => {
      html += renderItem(t);
    });

    if (totalPages > 1) {
      html += `
        <div class="flex items-center justify-between mt-4 px-1 animate-slide-up delay-300">
          <button id="prev-page-btn" class="px-4 py-2 bg-slate-800 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-effect" ${profileHistoryPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left mr-1"></i> Назад
          </button>
          <span class="text-[11px] text-slate-500 font-medium">Стр. ${profileHistoryPage} из ${totalPages}</span>
          <button id="next-page-btn" class="px-4 py-2 bg-slate-800 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-effect" ${profileHistoryPage >= totalPages ? 'disabled' : ''}>
            Вперед <i class="fas fa-chevron-right ml-1"></i>
          </button>
        </div>
      `;
    }
  }
  html += `</div></div></div>`;
  return html;
}

function attachProfileEvents() {
  const withdrawBtn = document.getElementById('withdraw-btn');
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', () => {
      triggerHaptic('medium');
      openWithdrawModal();
    });
  }

  const depositBtn = document.getElementById('deposit-btn');
  if (depositBtn) {
    depositBtn.addEventListener('click', () => {
      triggerHaptic('medium');
      openDepositModal();
    });
  }

  const promoBtn = document.getElementById('activate-promo-btn');
  if (promoBtn) {
    promoBtn.addEventListener('click', () => {
      triggerHaptic('medium');
      const code = document.getElementById('promo-input').value.trim().toUpperCase();
      if (!code) return showToast("Введите промокод");

      if (!state.user.usedPromos) state.user.usedPromos = [];
      if (!state.admin.promoCodes) state.admin.promoCodes = [];

      if (state.user.usedPromos.includes(code)) {
        return showToast("Вы уже использовали этот промокод");
      }

      const promo = state.admin.promoCodes.find(p => p.code === code);
      if (!promo) {
        return showToast("Промокод не найден");
      }
      if (!promo.active) {
        return showToast("Промокод неактивен");
      }
      if (promo.maxUses > 0 && promo.currentUses >= promo.maxUses) {
        return showToast("Лимит активаций исчерпан");
      }

      promo.currentUses += 1;
      state.user.usedPromos.push(code);
      state.user.balance += promo.reward;
      state.user.totalEarned += promo.reward;

      if (!state.deposits) state.deposits = [];
      state.deposits.push({
        id: 'p' + Date.now(),
        amount: promo.reward,
        method: 'Промокод: ' + code,
        status: 'completed',
        date: new Date().toISOString()
      });

      saveState();
      updateHeaderUI();
      renderTab('profile');
      showToast(`Промокод активирован: +${promo.reward} USDT!`);
      triggerHaptic('success');
    });
  }

  const prevBtn = document.getElementById('prev-page-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      triggerHaptic('light');
      if (profileHistoryPage > 1) {
        profileHistoryPage--;
        renderTab('profile');
      }
    });
  }

  const nextBtn = document.getElementById('next-page-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      triggerHaptic('light');
      profileHistoryPage++;
      renderTab('profile');
    });
  }
}

// ==========================================
// DEPOSIT FLOW (TONKEEPER ONLY)
// ==========================================

function openDepositModal() {
  modalContent.innerHTML = `
    <h3 class="text-xl font-bold text-white mb-4">Пополнение баланса</h3>
    <div class="mb-6">
      <label class="block text-xs text-slate-400 mb-2">Сумма (USDT)</label>
      <input type="number" id="deposit-amount" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-slate-600" placeholder="Например: 10" min="1">
      <p class="text-[10px] text-slate-500 mt-2"><i class="fas fa-info-circle mr-1"></i> Оплата производится прямым переводом в TON.</p>
    </div>
    <div class="flex space-x-3">
      <button onclick="window.closeModal()" class="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm tap-effect">Отмена</button>
      <button id="continue-deposit" class="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 tap-effect">Далее</button>
    </div>
  `;

  modalOverlay.classList.remove('hidden');
  setTimeout(() => {
    modalOverlay.classList.remove('opacity-0');
    modalContent.classList.remove('scale-95');
    modalContent.classList.add('animate-pop-in');
  }, 10);

  document.getElementById('continue-deposit').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    if (isNaN(amount) || amount <= 0) {
      showToast("Введите корректную сумму пополнения");
      return;
    }
    openDepositStep2(amount);
  });
}

async function openDepositStep2(amount) {
  modalContent.innerHTML = `
    <div class="flex flex-col items-center justify-center py-12 animate-pop-in">
      <i class="fas fa-circle-notch fa-spin text-teal-400 text-4xl mb-4"></i>
      <p class="text-slate-400 text-sm">Получаем актуальный курс TON...</p>
    </div>
  `;
  
  let tonPrice = 5.0; // Значение по умолчанию на случай ошибки API
  try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT');
      if (res.ok) {
          const data = await res.json();
          if (data && data.price) {
              tonPrice = parseFloat(data.price);
          }
      }
  } catch (e) {
      console.warn("Не удалось получить курс TON, используем запасной:", e);
  }

  const tonWallet = state.settings.tonWallet || 'EQ...';
  const tonAmount = (amount / tonPrice).toFixed(4);
  const nanoTon = Math.floor(parseFloat(tonAmount) * 1e9);
  const memoId = `TF${currentUser.id}`; 
  
  const methodHtml = `
      <div class="bg-slate-800 p-2 rounded-lg text-center mb-3 border border-slate-700 shadow-sm animate-slide-up">
          <span class="text-[11px] text-slate-300">Актуальный курс: <span class="text-white font-bold">1 TON ≈ ${tonPrice.toFixed(2)} USDT</span></span>
      </div>
      <p class="text-xs text-slate-400 mb-2 animate-slide-up delay-75">Переведите ровно <span class="text-white font-bold">${tonAmount} TON</span> на этот адрес:</p>
      <div class="bg-slate-900 p-3 rounded-lg flex items-center justify-between border border-slate-700 mb-4 shadow-inner animate-slide-up delay-75">
          <span class="text-xs font-mono text-teal-400 break-all select-all">${tonWallet}</span>
          <button onclick="navigator.clipboard.writeText('${tonWallet}'); showToast('Адрес скопирован')" class="ml-3 text-slate-400 hover:text-white shrink-0 p-2"><i class="fas fa-copy"></i></button>
      </div>

      <p class="text-xs text-red-400 font-bold mb-2 animate-slide-up delay-150"><i class="fas fa-exclamation-triangle mr-1"></i> Обязательно укажите комментарий (Memo):</p>
      <div class="bg-slate-900 p-3 rounded-lg flex items-center justify-between border border-red-500/50 mb-4 shadow-inner relative overflow-hidden animate-slide-up delay-150">
          <div class="absolute inset-0 bg-red-500/10 pointer-events-none"></div>
          <span class="text-sm font-mono text-white font-bold break-all select-all z-10">${memoId}</span>
          <button onclick="navigator.clipboard.writeText('${memoId}'); showToast('Комментарий скопирован')" class="ml-3 text-white bg-red-500 hover:bg-red-400 rounded p-2 px-3 text-xs z-10 transition-colors shadow-lg"><i class="fas fa-copy mr-1"></i>Копировать</button>
      </div>

      <a href="ton://transfer/${tonWallet}?amount=${nanoTon}&text=${memoId}" class="w-full flex items-center justify-center py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-sm mb-4 tap-effect shadow-lg shadow-blue-500/20 animate-slide-up delay-225">
          <i class="fas fa-wallet mr-2"></i>Оплатить в Tonkeeper
      </a>
  `;

  modalContent.innerHTML = `
    <h3 class="text-xl font-bold text-white mb-4">Подтверждение оплаты</h3>
    ${methodHtml}
    <p class="text-[10px] text-slate-500 text-center mb-5 bg-slate-800 p-3 rounded-lg border border-slate-700 animate-slide-up delay-300">После успешного перевода средств с правильным комментарием, нажмите кнопку ниже.</p>
    <div class="flex space-x-3 animate-slide-up delay-400">
      <button onclick="window.closeModal()" class="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm tap-effect">Отмена</button>
      <button id="confirm-deposit-btn" class="flex-1 py-3 bg-teal-500 text-slate-900 rounded-xl font-bold text-sm shadow-lg shadow-teal-500/20 tap-effect">Я оплатил</button>
    </div>
  `;
  
  modalOverlay.classList.remove('hidden');
  setTimeout(() => { modalOverlay.classList.remove('opacity-0'); modalContent.classList.remove('scale-95'); }, 10);
  
  document.getElementById('confirm-deposit-btn').addEventListener('click', () => {
      const dId = 'd' + Date.now();
      const dateStr = new Date().toISOString();
      const method = 'Tonkeeper';
      
      if(!state.deposits) state.deposits = [];
      state.deposits.push({ id: dId, amount: amount, method: method, status: 'pending', date: dateStr, memo: memoId });
      
      if(!state.admin.pendingDeposits) state.admin.pendingDeposits = [];
      state.admin.pendingDeposits.push({
          id: dId,
          userId: currentUser.id,
          user: currentUser.username || currentUser.first_name,
          amount: amount,
          method: method,
          memo: memoId,
          date: dateStr
      });

      saveState();
      window.closeModal();
      renderTab('profile');
      showToast("Заявка на пополнение отправлена на проверку!");
      triggerHaptic('success');
  });
}

function openWithdrawModal() {
  const minWith = state.settings.minWithdrawal;
  if (state.user.balance < minWith) {
     showToast(`Минимальная сумма вывода ${minWith} USDT`);
     return;
  }

  modalContent.innerHTML = `
    <h3 class="text-xl font-bold text-white mb-4">Вывод USDT</h3>
    <div class="mb-4">
      <label class="block text-xs text-slate-400 mb-2">Сеть</label>
      <div class="grid grid-cols-2 gap-2">
        <button class="network-btn active bg-teal-500/20 border border-teal-500 text-teal-400 py-2 rounded-lg text-sm font-bold transition-colors" data-net="TRC-20">TRC-20</button>
        <button class="network-btn bg-slate-800 border border-slate-700 text-slate-400 py-2 rounded-lg text-sm font-bold transition-colors" data-net="BEP-20">BEP-20</button>
      </div>
    </div>
    <div class="mb-4">
      <label class="block text-xs text-slate-400 mb-2">Адрес кошелька</label>
      <input type="text" id="wallet-address" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-teal-500 transition-colors placeholder-slate-600" placeholder="Введите адрес USDT...">
    </div>
    <div class="mb-6">
      <label class="block text-xs text-slate-400 mb-2">Сумма (Макс: ${state.user.balance.toFixed(2)})</label>
      <div class="relative">
        <input type="number" id="withdraw-amount" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 pr-16 text-white text-sm focus:outline-none focus:border-teal-500 transition-colors" value="${state.user.balance.toFixed(2)}" max="${state.user.balance}">
        <button id="max-btn" class="absolute right-2 top-2 bottom-2 bg-slate-800 text-teal-400 text-xs font-bold px-3 rounded-md hover:bg-slate-700 transition-colors">МАКС</button>
      </div>
    </div>
    <div class="flex space-x-3">
      <button onclick="window.closeModal()" class="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm tap-effect">Отмена</button>
      <button id="confirm-withdraw" class="flex-1 py-3 bg-teal-500 text-slate-900 rounded-xl font-bold text-sm shadow-lg shadow-teal-500/20 tap-effect">Подтвердить</button>
    </div>
  `;

  modalOverlay.classList.remove('hidden');
  setTimeout(() => {
    modalOverlay.classList.remove('opacity-0');
    modalContent.classList.remove('scale-95');
    modalContent.classList.add('animate-pop-in');
  }, 10);

  let selectedNetwork = 'TRC-20';
  const networkBtns = document.querySelectorAll('.network-btn');
  networkBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      networkBtns.forEach(b => {
        b.classList.remove('bg-teal-500/20', 'border-teal-500', 'text-teal-400');
        b.classList.add('bg-slate-800', 'border-slate-700', 'text-slate-400');
      });
      e.target.classList.remove('bg-slate-800', 'border-slate-700', 'text-slate-400');
      e.target.classList.add('bg-teal-500/20', 'border-teal-500', 'text-teal-400');
      selectedNetwork = e.target.dataset.net;
    });
  });

  document.getElementById('max-btn').addEventListener('click', () => {
    document.getElementById('withdraw-amount').value = state.user.balance.toFixed(2);
  });

  document.getElementById('confirm-withdraw').addEventListener('click', () => {
    const address = document.getElementById('wallet-address').value.trim();
    const amount = parseFloat(document.getElementById('withdraw-amount').value);

    if (!address) { showToast("Пожалуйста, введите адрес кошелька"); return; }
    if (isNaN(amount) || amount < minWith) { showToast(`Минимальная сумма вывода ${minWith} USDT`); return; }
    if (amount > state.user.balance) { showToast("Недостаточно средств"); return; }

    state.user.balance -= amount;
    const wId = 'w' + Date.now();
    const dateStr = new Date().toISOString();
    
    state.withdrawals.push({ id: wId, amount: amount, address: address, network: selectedNetwork, status: 'pending', date: dateStr });
    state.admin.pendingWithdrawals.push({
      id: wId,
      userId: currentUser.id,
      user: currentUser.username || currentUser.first_name,
      amount: amount,
      address: address,
      network: selectedNetwork,
      date: dateStr
    });

    saveState();
    updateHeaderUI();
    window.closeModal();
    renderTab('profile');
    showToast("Заявка на вывод успешно отправлена");
    triggerHaptic('success');
  });
}

// ==========================================
// FULLSCREEN ADMIN PANEL LOGIC
// ==========================================
async function syncAdminData() {
    if (!isAdmin) return;
    const allDocs = await User.find({});
    
    let totalBalance = 0;
    let totalPaid = 0;
    let dailyActive = 0;
    const now = Date.now();

    const usersList = [];
    let aggregatedPendingW = [];
    let aggregatedPendingD = [];
    
    allDocs.forEach(doc => {
        const dState = doc.data || {};
        const uData = dState.user || {};
        totalBalance += (uData.balance || 0);
        if (now - (uData.lastSync || 0) < 24 * 60 * 60 * 1000) {
            dailyActive++;
        }
        
        const userW = dState.withdrawals || [];
        userW.forEach(w => {
            if(w.status === 'completed') totalPaid += w.amount;
            if(w.status === 'pending') {
                aggregatedPendingW.push({
                    id: w.id, userId: doc.id,
                    user: (uData.username || uData.firstName || 'User ' + doc.id),
                    amount: w.amount, address: w.address, network: w.network, date: w.date
                });
            }
        });

        const userD = dState.deposits || [];
        userD.forEach(d => {
            if (d.status === 'pending') {
                aggregatedPendingD.push({
                    id: d.id, userId: doc.id,
                    user: (uData.username || uData.firstName || 'User ' + doc.id),
                    amount: d.amount, method: d.method, memo: d.memo, date: d.date
                });
            }
        });
        
        if (doc.id !== currentUser.id) {
            usersList.push({
                id: doc.id,
                name: uData.firstName || 'User ' + doc.id,
                username: uData.username || 'unknown',
                balance: uData.balance || 0,
                status: uData.status || 'active',
                joined: uData.joinedDate || '-'
            });
        }
    });

    state.admin.stats.totalUsers = allDocs.length;
    state.admin.stats.totalBalance = totalBalance;
    state.admin.stats.dailyActive = dailyActive;
    state.admin.stats.totalPaid = totalPaid;
    
    state.admin.users = usersList;
    state.admin.pendingWithdrawals = aggregatedPendingW;
    state.admin.pendingDeposits = aggregatedPendingD;
}

async function openAdminPanel() {
  appContainer.classList.add('hidden');
  adminAppContainer.classList.remove('hidden');
  adminAppContainer.classList.add('flex');
  
  await syncAdminData();
  renderAdminTab(currentAdminTab);
}

function closeAdminPanel() {
  adminAppContainer.classList.add('hidden');
  adminAppContainer.classList.remove('flex');
  appContainer.classList.remove('hidden');
  
  document.querySelectorAll('#app .nav-btn').forEach(b => {
      b.classList.remove('text-teal-400', 'active');
      b.classList.add('text-slate-400');
  });
  const activeUserTabBtn = document.querySelector(`#app .nav-btn[data-tab="${currentTab}"]`);
  if(activeUserTabBtn) {
      activeUserTabBtn.classList.remove('text-slate-400');
      activeUserTabBtn.classList.add('text-teal-400', 'active');
  }
}

function setupAdminNavigation() {
  document.querySelectorAll('.close-admin-btn').forEach(btn => {
    btn.addEventListener('click', () => { triggerHaptic('light'); closeAdminPanel(); });
  });

  const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
  adminTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      triggerHaptic('light');
      const tab = e.currentTarget.dataset.atab;
      
      adminTabBtns.forEach(b => {
        b.classList.remove('bg-teal-500/10', 'text-teal-400', 'active');
        b.classList.add('text-slate-400');
        if(b.closest('aside')) b.classList.add('hover:bg-slate-800', 'hover:text-slate-200');
      });
      
      document.querySelectorAll(`.admin-tab-btn[data-atab="${tab}"]`).forEach(b => {
          b.classList.remove('text-slate-400', 'hover:bg-slate-800', 'hover:text-slate-200');
          b.classList.add('bg-teal-500/10', 'text-teal-400', 'active');
      });

      currentAdminTab = tab;
      renderAdminTab(tab);
    });
  });
}

function renderAdminTab(tab) {
  adminContentArea.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'fade-in h-full';

  switch (tab) {
    case 'dashboard': container.innerHTML = renderAdminDashboard(); break;
    case 'users': container.innerHTML = renderAdminUsers(); break;
    case 'tasks': container.innerHTML = renderAdminTasks(); break;
    case 'finances': container.innerHTML = renderAdminFinances(); break;
    case 'settings': container.innerHTML = renderAdminSettings(); break;
  }
  adminContentArea.appendChild(container);
}

function renderAdminDashboard() {
  const totalSystemBalance = state.admin.stats.totalBalance;
  return `
    <div class="mb-5 animate-slide-up">
      <h1 class="text-xl font-bold text-white mb-1">Обзор системы</h1>
      <p class="text-slate-400 text-xs">Главная статистика проекта</p>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-slide-up delay-75">
      <div class="bg-slate-850 p-4 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-500/50 transition-colors">
        <div class="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-colors"></div>
        <div class="text-blue-400 mb-2"><i class="fas fa-users text-lg"></i></div>
        <p class="text-[10px] text-slate-400 font-medium mb-1">Всего юзеров</p>
        <p class="text-lg font-bold text-white">${state.admin.stats.totalUsers.toLocaleString()}</p>
      </div>
      <div class="bg-slate-850 p-4 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden group hover:border-green-500/50 transition-colors">
        <div class="absolute -right-6 -top-6 w-20 h-20 bg-green-500/10 rounded-full blur-xl group-hover:bg-green-500/20 transition-colors"></div>
        <div class="text-green-400 mb-2"><i class="fas fa-bolt text-lg"></i></div>
        <p class="text-[10px] text-slate-400 font-medium mb-1">Активных (24ч)</p>
        <p class="text-lg font-bold text-white">${state.admin.stats.dailyActive.toLocaleString()}</p>
      </div>
      <div class="bg-slate-850 p-4 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden group hover:border-teal-500/50 transition-colors">
        <div class="absolute -right-6 -top-6 w-20 h-20 bg-teal-500/10 rounded-full blur-xl group-hover:bg-teal-500/20 transition-colors"></div>
        <div class="text-teal-400 mb-2"><i class="fas fa-wallet text-lg"></i></div>
        <p class="text-[10px] text-slate-400 font-medium mb-1">Балансы юзеров</p>
        <p class="text-lg font-bold text-white">${totalSystemBalance.toLocaleString()} USDT</p>
      </div>
      <div class="bg-slate-850 p-4 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden group hover:border-pink-500/50 transition-colors">
        <div class="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-colors"></div>
        <div class="text-blue-400 mb-2"><i class="fas fa-hand-holding-usd text-lg"></i></div>
        <p class="text-[10px] text-slate-400 font-medium mb-1">Выплачено</p>
        <p class="text-lg font-bold text-white">${state.admin.stats.totalPaid.toLocaleString()} USDT</p>
      </div>
    </div>
    <h2 class="text-sm font-bold text-white mb-3 animate-slide-up delay-150">Последние действия</h2>
    <div class="bg-slate-850 rounded-xl border border-slate-800 overflow-hidden animate-slide-up delay-225">
      ${state.admin.recentActivity.slice(0, 5).map(act => `
        <div class="p-3 border-b border-slate-800/50 flex justify-between items-center hover:bg-slate-800/80 transition-colors">
          <div class="flex items-center space-x-3">
            <div class="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
            <p class="text-[11px] text-slate-200">${act.text}</p>
          </div>
          <span class="text-[10px] text-slate-500">${act.time}</span>
        </div>
      `).join('')}
    </div>
  `;
}

window.toggleUserBan = async (uId) => {
  if (uId === currentUser.id) {
      state.user.status = state.user.status === 'active' ? 'banned' : 'active';
      showToast(state.user.status === 'banned' ? 'Вы забанили сами себя!' : 'Вы разбанены');
      saveState();
      checkAccess();
  } else {
      const u = state.admin.users.find(user => user.id === uId);
      if(u) {
          u.status = u.status === 'active' ? 'banned' : 'active';
          showToast(`Пользователь ${u.name} ${u.status === 'banned' ? 'забанен' : 'разбанен'}`);
          saveState();
          
          const targetDoc = await User.findOne({ id: uId });
          if(targetDoc) {
             targetDoc.data.user.status = u.status;
             await User.updateOne({ id: uId }, { $set: { data: targetDoc.data } });
          }
      }
  }
  renderAdminTab('users');
};

window.openEditBalanceModal = async (uId) => {
    triggerHaptic('medium');
    let uBalance = 0;
    let uName = "";
    if (uId === currentUser.id) {
        uBalance = state.user.balance;
        uName = currentUser.first_name;
    } else {
        const u = state.admin.users.find(user => user.id === uId);
        if(u) { uBalance = u.balance; uName = u.name; }
        else return;
    }

    modalContent.innerHTML = `
      <h3 class="text-xl font-bold text-white mb-4">Изменить баланс</h3>
      <p class="text-xs text-slate-400 mb-4">Пользователь: <span class="text-white font-bold">${uName}</span></p>
      <input type="number" id="edit-balance-input" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none mb-6" value="${uBalance}" step="0.1">
      <div class="flex space-x-3">
        <button onclick="window.closeModal()" class="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm tap-effect">Отмена</button>
        <button onclick="window.saveUserBalance(${uId})" class="flex-1 py-3 bg-teal-500 text-slate-900 rounded-xl font-bold text-sm shadow-lg shadow-teal-500/20 tap-effect">Сохранить</button>
      </div>
    `;
    modalOverlay.classList.remove('hidden');
    setTimeout(() => { modalOverlay.classList.remove('opacity-0'); modalContent.classList.remove('scale-95'); modalContent.classList.add('animate-pop-in'); }, 10);
};

window.saveUserBalance = async (uId) => {
    const newBalance = parseFloat(document.getElementById('edit-balance-input').value);
    if(isNaN(newBalance) || newBalance < 0) return showToast('Введите корректный баланс');

    if (uId === currentUser.id) {
        state.user.balance = newBalance;
        saveState();
        updateHeaderUI();
    } else {
        const u = state.admin.users.find(user => user.id === uId);
        if(u) {
            u.balance = newBalance;
            saveState();
            const targetDoc = await User.findOne({ id: uId });
            if (targetDoc) {
                targetDoc.data.user.balance = newBalance;
                await User.updateOne({ id: uId }, { $set: { data: targetDoc.data } });
            }
        }
    }
    window.closeModal();
    renderAdminTab('users');
    showToast('Баланс успешно изменен');
};

function renderAdminUsers() {
  const allUsers = [
    { id: currentUser.id, name: currentUser.first_name, username: currentUser.username || 'guest', balance: state.user.balance, status: state.user.status, joined: state.user.joinedDate },
    ...state.admin.users
  ];

  return `
    <div class="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-slide-up">
      <div>
        <h1 class="text-xl font-bold text-white mb-1">Пользователи</h1>
        <p class="text-slate-400 text-xs">Управление базой</p>
      </div>
      <div class="relative w-full md:w-64">
        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 text-xs"></i>
        <input type="text" placeholder="Поиск юзера..." class="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-[11px] text-white focus:border-teal-500 outline-none">
      </div>
    </div>
    <div class="space-y-2 animate-slide-up delay-75">
      ${allUsers.map(u => `
        <div class="bg-slate-850 p-3 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-3 hover:bg-slate-800/80 transition-colors ${u.id === currentUser.id ? 'border-teal-500/50 bg-teal-500/5' : ''}">
          <div class="flex items-center space-x-3 min-w-[180px]">
            <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs relative">
              ${u.name.charAt(0)}
              ${u.id === currentUser.id ? `<div class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-teal-500 rounded-full border border-slate-850"></div>` : ''}
            </div>
            <div>
              <p class="font-bold text-xs text-white">${u.name} <span class="text-[10px] text-slate-500 font-normal ml-1">@${u.username}</span></p>
              <p class="text-[9px] text-slate-500">ID: ${u.id} • С ${u.joined}</p>
            </div>
          </div>
          
          <div class="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-end">
            <div class="text-left md:text-right flex items-center space-x-2">
              <div>
                <p class="text-[9px] text-slate-500 mb-0.5">Баланс</p>
                <p class="font-bold text-teal-400 text-xs">${u.balance.toFixed(2)} USDT</p>
              </div>
              <button onclick="window.openEditBalanceModal(${u.id})" class="w-7 h-7 rounded bg-slate-800 hover:bg-teal-500/20 text-slate-400 hover:text-teal-400 transition-colors tap-effect text-xs mt-3 md:mt-0" title="Изменить баланс"><i class="fas fa-pencil-alt"></i></button>
            </div>
            <div class="flex items-center space-x-2">
              ${u.status === 'active' 
                ? `<span class="px-2 py-0.5 bg-green-500/10 text-green-400 text-[9px] rounded border border-green-500/20">Активен</span>
                   <button onclick="toggleUserBan(${u.id})" class="w-7 h-7 rounded bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors tap-effect text-xs" title="Забанить"><i class="fas fa-ban"></i></button>` 
                : `<span class="px-2 py-0.5 bg-red-500/10 text-red-400 text-[9px] rounded border border-red-500/20">Забанен</span>
                   <button onclick="toggleUserBan(${u.id})" class="w-7 h-7 rounded bg-slate-800 hover:bg-green-500/20 text-slate-400 hover:text-green-400 transition-colors tap-effect text-xs" title="Разбанить"><i class="fas fa-check"></i></button>`
              }
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.openAdminTaskModal = (taskId = null) => {
    triggerHaptic('medium');
    let task = taskId ? state.tasks.find(t => t.id === taskId) : { id: 't'+Date.now(), title: '', reward: 1.0, icon: 'fa-telegram', type: 'tg', url: '' };

    modalContent.innerHTML = `
      <h3 class="text-xl font-bold text-white mb-4">${taskId ? 'Редактировать задание' : 'Новое задание'}</h3>
      <input type="hidden" id="admin-task-id" value="${task.id}">
      <div class="space-y-3 mb-6">
         <div>
            <label class="text-xs text-slate-400 mb-1 block">Название</label>
            <input type="text" id="admin-task-title" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none" value="${task.title}" placeholder="Например: Подписка на канал">
         </div>
         <div class="grid grid-cols-2 gap-3">
             <div>
                <label class="text-xs text-slate-400 mb-1 block">Награда (USDT)</label>
                <input type="number" id="admin-task-reward" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none" value="${task.reward}" step="0.1">
             </div>
             <div>
                <label class="text-xs text-slate-400 mb-1 block">Тип платформы</label>
                <select id="admin-task-type" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none">
                    <option value="tg" ${task.type==='tg'?'selected':''}>Telegram</option>
                    <option value="yt" ${task.type==='yt'?'selected':''}>YouTube</option>
                    <option value="x" ${task.type==='x'?'selected':''}>X (Twitter)</option>
                </select>
             </div>
         </div>
         <div class="grid grid-cols-2 gap-3">
             <div class="col-span-2">
                <label class="text-xs text-slate-400 mb-1 block">Ссылка URL</label>
                <input type="text" id="admin-task-url" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none" value="${task.url}" placeholder="https://...">
             </div>
             <div class="col-span-2">
                <label class="text-xs text-slate-400 mb-1 block">Иконка (класс FontAwesome)</label>
                <input type="text" id="admin-task-icon" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none" value="${task.icon}" placeholder="fa-telegram">
             </div>
         </div>
      </div>
      <div class="flex space-x-3">
         <button onclick="window.closeModal()" class="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm tap-effect">Отмена</button>
         <button onclick="window.saveAdminTask()" class="flex-1 py-3 bg-teal-500 text-slate-900 rounded-xl font-bold text-sm shadow-lg shadow-teal-500/20 tap-effect">Сохранить</button>
      </div>
    `;
    modalOverlay.classList.remove('hidden');
    setTimeout(() => { 
        modalOverlay.classList.remove('opacity-0'); 
        modalContent.classList.remove('scale-95'); 
        modalContent.classList.add('animate-pop-in'); 
    }, 10);
};

window.saveAdminTask = () => {
    const id = document.getElementById('admin-task-id').value;
    const title = document.getElementById('admin-task-title').value.trim();
    const reward = parseFloat(document.getElementById('admin-task-reward').value);
    const icon = document.getElementById('admin-task-icon').value.trim();
    const url = document.getElementById('admin-task-url').value.trim();
    const type = document.getElementById('admin-task-type').value;

    if(!title || !url) { showToast('Заполните название и ссылку'); return; }

    const existingIdx = state.tasks.findIndex(t => t.id === id);
    const taskData = { id, title, reward, icon, url, type, status: 'todo' };

    if(existingIdx >= 0) {
        taskData.status = state.tasks[existingIdx].status;
        state.tasks[existingIdx] = taskData;
    } else {
        state.tasks.push(taskData);
    }

    saveState();
    window.closeModal();
    renderAdminTab('tasks');
    showToast('Задание успешно сохранено');
};

window.deleteAdminTask = (id) => {
    if(confirm('Вы уверены, что хотите удалить это задание?')) {
        state.tasks = state.tasks.filter(t => t.id !== id);
        saveState();
        renderAdminTab('tasks');
        showToast('Задание удалено');
    }
};

function renderAdminTasks() {
  return `
    <div class="mb-5 flex justify-between items-center animate-slide-up">
      <div>
        <h1 class="text-xl font-bold text-white mb-1">Задания</h1>
        <p class="text-slate-400 text-xs">Настройка способов заработка</p>
      </div>
      <button onclick="window.openAdminTaskModal()" class="bg-teal-500 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/20 tap-effect">
        <i class="fas fa-plus mr-1"></i>Новое
      </button>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 animate-slide-up delay-75">
      ${state.tasks.length === 0 ? '<p class="text-slate-500 text-xs">Заданий пока нет.</p>' : ''}
      ${state.tasks.map(t => `
        <div class="bg-slate-850 p-4 rounded-xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-sm text-slate-300 shrink-0">
                <i class="fab ${t.icon}"></i>
              </div>
              <div class="min-w-0 pr-2">
                <h3 class="font-bold text-xs text-white truncate w-full" title="${t.title}">${t.title}</h3>
                <span class="text-[10px] text-teal-400 font-medium">Награда: ${t.reward} USDT</span>
              </div>
            </div>
            <div class="flex space-x-1.5 shrink-0">
              <button onclick="window.openAdminTaskModal('${t.id}')" class="w-7 h-7 rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors tap-effect text-xs"><i class="fas fa-edit"></i></button>
              <button onclick="window.deleteAdminTask('${t.id}')" class="w-7 h-7 rounded bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors tap-effect text-xs"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          <div class="bg-slate-900 rounded-lg p-2 flex items-center justify-between border border-slate-800/50">
            <span class="text-[10px] text-slate-500 truncate mr-2 font-mono">${t.url}</span>
            <span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded uppercase">${t.type}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.processDeposit = async (dId, action) => {
  const pdIndex = state.admin.pendingDeposits.findIndex(d => d.id === dId);
  if (pdIndex === -1) return;
  const pd = state.admin.pendingDeposits[pdIndex];
  state.admin.pendingDeposits.splice(pdIndex, 1);

  let targetUserDoc = null;
  let targetState = null;

  if (pd.userId === currentUser.id) {
      targetState = state;
  } else {
      targetUserDoc = await User.findOne({ id: pd.userId });
      if(targetUserDoc) targetState = targetUserDoc.data;
  }

  if(targetState) {
      const ud = targetState.deposits?.find(d => d.id === dId);
      if (action === 'approve') {
          if(ud) ud.status = 'completed';
          targetState.user.balance += pd.amount;
          state.admin.recentActivity.unshift({ time: 'Только что', text: `Пополнение ${pd.amount} USDT подтверждено` });
          showToast('Пополнение подтверждено, баланс начислен');
      } else {
          if(ud) ud.status = 'rejected';
          state.admin.recentActivity.unshift({ time: 'Только что', text: `Пополнение ${pd.amount} USDT отклонено` });
          showToast('Пополнение отклонено');
      }
      
      if (pd.userId === currentUser.id) {
          saveState();
          updateHeaderUI();
      } else {
          await User.updateOne({ id: pd.userId }, { $set: { data: targetState } });
          saveState(); // сохранить удаление из pending
      }
      renderAdminTab('finances');
  }
};

window.processWithdrawal = async (wId, action) => {
  const pwIndex = state.admin.pendingWithdrawals.findIndex(w => w.id === wId);
  if (pwIndex === -1) return;
  const pw = state.admin.pendingWithdrawals[pwIndex];
  state.admin.pendingWithdrawals.splice(pwIndex, 1);
  
  let targetUserDoc = null;
  let targetState = null;

  if (pw.userId === currentUser.id) {
      targetState = state;
  } else {
      targetUserDoc = await User.findOne({ id: pw.userId });
      if(targetUserDoc) targetState = targetUserDoc.data;
  }

  if (targetState) {
      const uw = targetState.withdrawals?.find(w => w.id === wId);
      if (action === 'approve') {
        if(uw) uw.status = 'completed';
        state.admin.stats.totalPaid += pw.amount;
        state.admin.recentActivity.unshift({ time: 'Только что', text: `Выплата ${pw.amount} USDT подтверждена` });
        showToast('Выплата подтверждена');
      } else {
        if(uw) uw.status = 'rejected';
        targetState.user.balance += pw.amount; // Возврат средств
        state.admin.recentActivity.unshift({ time: 'Только что', text: `Выплата ${pw.amount} USDT отклонена` });
        showToast('Выплата отклонена, средства возвращены юзеру');
      }
      
      if (pw.userId === currentUser.id) {
          saveState();
          updateHeaderUI();
      } else {
          await User.updateOne({ id: pw.userId }, { $set: { data: targetState } });
          saveState(); // сохранить удаление из pending
      }
      renderAdminTab('finances');
  }
};

function renderAdminFinances() {
  const pendingDeposits = state.admin.pendingDeposits || [];
  
  return `
    <div class="mb-5 animate-slide-up">
      <h1 class="text-xl font-bold text-white mb-1">Финансы</h1>
      <p class="text-slate-400 text-xs">Управление пополнениями и выплатами</p>
    </div>
    
    <!-- Pending Deposits -->
    <h2 class="text-sm font-bold text-white mb-3 flex items-center space-x-2 animate-slide-up delay-75">
      <i class="fas fa-arrow-down text-blue-500"></i>
      <span>Ожидают пополнения (${pendingDeposits.length})</span>
    </h2>
    <div class="space-y-3 mb-8 animate-slide-up delay-150">
      ${pendingDeposits.length === 0 ? `<div class="p-4 text-center bg-slate-850 rounded-xl border border-slate-800 text-slate-500"><p class="text-xs">Нет заявок</p></div>` : ''}
      ${pendingDeposits.map(d => `
        <div class="bg-slate-850 p-4 rounded-xl border border-blue-500/20 flex flex-col justify-between gap-3">
          <div class="flex items-center space-x-3 mb-1">
            <span class="font-bold text-white text-sm">${d.user}</span>
            <span class="bg-blue-500/10 text-blue-400 text-[9px] px-1.5 py-0.5 rounded border border-blue-500/20">Проверка</span>
          </div>
          <div class="flex flex-col space-y-1 text-xs mb-1">
            <div class="text-slate-400">Сумма: <span class="text-blue-400 font-bold ml-1">+${d.amount} USDT</span></div>
            <div class="text-slate-400">Метод: <span class="text-white ml-1 uppercase">${d.method}</span></div>
            <div class="text-slate-400">Memo: <span class="text-white ml-1 font-mono">${d.memo || 'Нет'}</span></div>
          </div>
          <div class="flex space-x-2 mt-1 w-full">
            <button onclick="window.processDeposit('${d.id}', 'approve')" class="flex-1 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold transition-colors tap-effect">Одобрить</button>
            <button onclick="window.processDeposit('${d.id}', 'reject')" class="flex-1 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 rounded-lg text-xs font-bold transition-colors tap-effect">Отклонить</button>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Pending Withdrawals -->
    <h2 class="text-sm font-bold text-white mb-3 flex items-center space-x-2 animate-slide-up delay-225">
      <i class="fas fa-arrow-up text-yellow-500"></i>
      <span>Ожидают выплаты (${state.admin.pendingWithdrawals.length})</span>
    </h2>
    <div class="space-y-3 animate-slide-up delay-300">
      ${state.admin.pendingWithdrawals.length === 0 ? `<div class="p-4 text-center bg-slate-850 rounded-xl border border-slate-800 text-slate-500"><p class="text-xs">Нет заявок</p></div>` : ''}
      ${state.admin.pendingWithdrawals.map(w => `
        <div class="bg-slate-850 p-4 rounded-xl border border-yellow-500/20 flex flex-col md:flex-row justify-between md:items-center gap-3">
          <div>
            <div class="flex items-center space-x-3 mb-1.5">
              <span class="font-bold text-white text-sm">${w.user}</span>
              <span class="bg-yellow-500/10 text-yellow-500 text-[9px] px-1.5 py-0.5 rounded border border-yellow-500/20">Ожидает</span>
            </div>
            <div class="flex items-center space-x-4 text-[11px]">
              <div class="text-slate-400">Сумма: <span class="text-teal-400 font-bold ml-1">-${w.amount} USDT</span></div>
              <div class="text-slate-400">Сеть: <span class="text-white ml-1">${w.network}</span></div>
            </div>
            <div class="mt-2 text-[9px] text-slate-500 font-mono bg-slate-900 p-1.5 rounded border border-slate-800 break-all select-all">
              ${w.address}
            </div>
          </div>
          <div class="flex md:flex-col space-x-2 md:space-x-0 md:space-y-2 w-full md:w-28 shrink-0">
            <button onclick="window.processWithdrawal('${w.id}', 'approve')" class="flex-1 md:w-full py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded-lg text-xs font-bold transition-colors tap-effect">Оплатить</button>
            <button onclick="window.processWithdrawal('${w.id}', 'reject')" class="flex-1 md:w-full py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold transition-colors tap-effect">Отклонить</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.saveAdminSettings = () => {
  const minWith = parseFloat(document.getElementById('set-min-with').value);
  const mRate = parseFloat(document.getElementById('set-mining-rate').value);
  const uCost = parseFloat(document.getElementById('set-upgrade-cost').value);
  const refFix = parseFloat(document.getElementById('set-ref-fixed').value);
  const refPercent = parseFloat(document.getElementById('set-ref-bonus').value);
  const tonWallet = document.getElementById('set-ton-wallet').value.trim();
  const maintenance = document.getElementById('set-maintenance').checked;

  if(isNaN(minWith) || isNaN(mRate) || isNaN(uCost) || isNaN(refFix) || isNaN(refPercent)) {
      showToast('Введите корректные числа');
      return;
  }

  state.settings.minWithdrawal = minWith;
  state.settings.miningRatePerHour = mRate;
  state.settings.upgradeBaseCost = uCost;
  state.settings.refBonusFixed = refFix;
  state.settings.refBonusPercent = refPercent;
  state.settings.tonWallet = tonWallet;
  state.settings.maintenanceMode = maintenance;
  
  state.admin.recentActivity.unshift({ time: 'Только что', text: 'Обновлены настройки системы' });

  saveState();
  showToast('Настройки успешно сохранены');
  checkAccess();
};

function renderAdminSettings() {
  const settings = state.settings;
  const mRate = settings.miningRatePerHour !== undefined ? settings.miningRatePerHour : 0.01;
  const uCost = settings.upgradeBaseCost !== undefined ? settings.upgradeBaseCost : 5;
  const refFix = settings.refBonusFixed !== undefined ? settings.refBonusFixed : 0.1;
  const refPercent = settings.refBonusPercent !== undefined ? settings.refBonusPercent : 10;
  const tonWallet = settings.tonWallet || '';

  return `
    <div class="mb-5 animate-slide-up">
      <h1 class="text-xl font-bold text-white mb-1">Настройки</h1>
      <p class="text-slate-400 text-xs">Глобальные параметры системы</p>
    </div>

    <div class="max-w-xl bg-slate-850 rounded-xl border border-slate-800 p-4 space-y-4 animate-slide-up delay-75">
      
      <div>
        <label class="block text-xs font-bold text-slate-300 mb-1">Базовая добыча USDT в час</label>
        <p class="text-[10px] text-slate-500 mb-1.5">Сколько дает 1-й уровень.</p>
        <input type="number" id="set-mining-rate" value="${mRate}" step="0.001" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:border-teal-500 outline-none">
      </div>

      <div>
        <label class="block text-xs font-bold text-slate-300 mb-1">Базовая стоимость улучшения (USDT)</label>
        <p class="text-[10px] text-slate-500 mb-1.5">Цена апгрейда с 1 на 2 уровень.</p>
        <input type="number" id="set-upgrade-cost" value="${uCost}" step="0.5" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:border-teal-500 outline-none">
      </div>

      <div class="pt-3 border-t border-slate-800">
        <label class="block text-xs font-bold text-slate-300 mb-1">Фикс. бонус за реферала (USDT)</label>
        <input type="number" id="set-ref-fixed" value="${refFix}" step="0.01" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:border-teal-500 outline-none">
      </div>

      <div>
        <label class="block text-xs font-bold text-slate-300 mb-1">Реферальный бонус (%)</label>
        <input type="number" id="set-ref-bonus" value="${refPercent}" step="1" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:border-teal-500 outline-none">
      </div>

      <div class="pt-3 border-t border-slate-800">
        <label class="block text-xs font-bold text-slate-300 mb-1">Мин. сумма вывода (USDT)</label>
        <input type="number" id="set-min-with" value="${settings.minWithdrawal}" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:border-teal-500 outline-none">
      </div>

      <div class="pt-3 border-t border-slate-800">
        <h3 class="font-bold text-white mb-2 text-sm">Методы пополнения</h3>
        <div class="mb-3">
          <label class="block text-[11px] font-bold text-slate-300 mb-1">Кошелек TON (Tonkeeper)</label>
          <input type="text" id="set-ton-wallet" value="${tonWallet}" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:border-teal-500 outline-none" placeholder="EQ...">
        </div>
      </div>

      <div class="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700 mt-2">
        <div>
          <p class="font-bold text-white text-xs mb-0.5">Тех. обслуживание</p>
          <p class="text-[10px] text-slate-500">Закрыть доступ для пользователей</p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="set-maintenance" class="sr-only peer" ${settings.maintenanceMode ? 'checked' : ''}>
          <div class="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
        </label>
      </div>

      <button onclick="window.saveAdminSettings()" class="w-full py-3 bg-teal-500 text-white font-extrabold text-sm rounded-xl hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/20 tap-effect mt-4 mb-6">
        Сохранить изменения
      </button>

      <!-- Promo Codes Section -->
      <div class="pt-4 border-t border-slate-800 animate-slide-up delay-150">
        <div class="flex justify-between items-center mb-3">
          <div>
            <h3 class="font-bold text-white text-sm">Промокоды</h3>
            <p class="text-[10px] text-slate-500">Бонусные коды для игроков</p>
          </div>
          <button onclick="window.openPromoModal()" class="bg-teal-500 text-white px-2.5 py-1.5 rounded-lg font-bold text-[11px] hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/20 tap-effect">
            <i class="fas fa-plus mr-1"></i>Создать
          </button>
        </div>
        <div class="space-y-2">
          ${(!state.admin.promoCodes || state.admin.promoCodes.length === 0) ? '<p class="text-[11px] text-slate-500 bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">Нет созданных промокодов</p>' : ''}
          ${(state.admin.promoCodes || []).map(p => `
            <div class="bg-slate-900 p-2.5 rounded-lg border border-slate-700 flex justify-between items-center hover:border-slate-600 transition-colors">
              <div>
                <p class="font-bold text-teal-400 text-xs font-mono">${p.code}</p>
                <p class="text-[9px] text-slate-400 mt-0.5">Награда: <span class="text-white">${p.reward} USDT</span> • Использований: <span class="text-white">${p.currentUses}/${p.maxUses || '∞'}</span></p>
              </div>
              <button onclick="window.deletePromo('${p.code}')" class="text-slate-500 hover:text-red-400 p-1.5 transition-colors tap-effect text-xs"><i class="fas fa-trash"></i></button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="pt-5 mt-2 border-t border-slate-800 animate-slide-up delay-225">
        <h3 class="font-bold text-red-500 mb-3 text-sm flex items-center"><i class="fas fa-exclamation-triangle mr-2"></i> Опасная зона</h3>
        <button onclick="window.resetTotalPaid()" class="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-xs rounded-xl transition-colors tap-effect shadow-sm">
          Обнулить статистику "Выплачено" в Дашборде
        </button>
      </div>

    </div>
  `;
}

window.resetTotalPaid = async () => {
  if (!confirm("Вы уверены? Это удалит историю всех успешных выплат у всех пользователей и сбросит счетчик до 0.")) return;
  
  const allDocs = await User.find({});
  for (let doc of allDocs) {
    if (doc.data && doc.data.withdrawals) {
      doc.data.withdrawals = doc.data.withdrawals.filter(w => w.status !== 'completed');
      await User.updateOne({ id: doc.id }, { $set: { data: doc.data } });
    }
  }
  
  if (state.withdrawals) {
    state.withdrawals = state.withdrawals.filter(w => w.status !== 'completed');
  }
  
  state.admin.stats.totalPaid = 0;
  saveState();
  await syncAdminData();
  
  showToast("Статистика выплат успешно обнулена");
};

window.openPromoModal = () => {
  triggerHaptic('medium');
  modalContent.innerHTML = `
    <h3 class="text-xl font-bold text-white mb-4">Новый промокод</h3>
    <div class="space-y-4 mb-6">
      <div>
        <label class="block text-xs text-slate-400 mb-2">Код (буквы и цифры)</label>
        <input type="text" id="new-promo-code" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm uppercase focus:border-teal-500 outline-none font-mono" placeholder="Например: BONUS100">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-slate-400 mb-2">Награда (USDT)</label>
          <input type="number" id="new-promo-reward" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none" placeholder="1.0" step="0.1" min="0">
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-2">Макс. активаций</label>
          <input type="number" id="new-promo-max" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-teal-500 outline-none" placeholder="0 = Безлимит" min="0">
        </div>
      </div>
    </div>
    <div class="flex space-x-3">
      <button onclick="window.closeModal()" class="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm tap-effect">Отмена</button>
      <button onclick="window.savePromo()" class="flex-1 py-3 bg-teal-500 text-slate-900 rounded-xl font-bold text-sm shadow-lg shadow-teal-500/20 tap-effect">Создать</button>
    </div>
  `;
  modalOverlay.classList.remove('hidden');
  setTimeout(() => { 
    modalOverlay.classList.remove('opacity-0'); 
    modalContent.classList.remove('scale-95'); 
    modalContent.classList.add('animate-pop-in'); 
  }, 10);
};

window.savePromo = () => {
  const code = document.getElementById('new-promo-code').value.trim().toUpperCase();
  const reward = parseFloat(document.getElementById('new-promo-reward').value);
  const maxUses = parseInt(document.getElementById('new-promo-max').value) || 0;

  if (!code || isNaN(reward) || reward <= 0) {
    return showToast("Заполните все поля корректно");
  }

  if (!state.admin.promoCodes) state.admin.promoCodes = [];
  
  if (state.admin.promoCodes.find(p => p.code === code)) {
    return showToast("Такой код уже существует");
  }

  state.admin.promoCodes.push({
    code,
    reward,
    maxUses,
    currentUses: 0,
    active: true
  });

  saveState();
  window.closeModal();
  renderAdminTab('settings');
  showToast("Промокод успешно создан");
};

window.deletePromo = (code) => {
  if (confirm("Вы уверены, что хотите удалить этот промокод?")) {
    state.admin.promoCodes = state.admin.promoCodes.filter(p => p.code !== code);
    saveState();
    renderAdminTab('settings');
    showToast("Промокод удален");
  }
};

window.openLeaderboardModal = async () => {
  modalContent.innerHTML = '<div class="flex justify-center py-8"><i class="fas fa-circle-notch fa-spin text-teal-400 text-3xl"></i></div>';
  modalOverlay.classList.remove('hidden');
  setTimeout(() => { modalOverlay.classList.remove('opacity-0'); modalContent.classList.remove('scale-95'); modalContent.classList.add('animate-pop-in'); }, 10);

  try {
    const allDocs = await User.find({});
    let leaders = allDocs.map(doc => {
        const friends = doc.data?.friends || [];
        const uData = doc.data?.user || {};
        const refEarned = friends.reduce((sum, f) => sum + (f.earned || 0), 0);
        return {
            id: doc.id,
            name: uData.firstName || uData.username || ('User ' + doc.id),
            avatar: uData.photoUrl || null,
            refCount: friends.length,
            refEarned: refEarned
        };
    }).filter(u => u.refCount > 0);

    leaders.sort((a, b) => b.refCount - a.refCount);
    const top10 = leaders.slice(0, 10);

    let html = '<div class="flex justify-between items-center mb-4"><h3 class="text-base font-bold text-white flex items-center"><i class="fas fa-trophy text-yellow-400 mr-2 text-lg"></i> Топ-10 рефоводов</h3><button onclick="window.closeModal()" class="text-slate-400 hover:text-white p-1 text-lg"><i class="fas fa-times"></i></button></div>';
    html += '<div class="space-y-2 max-h-[60vh] overflow-y-auto hide-scrollbar pb-2">';

    if (top10.length === 0) {
        html += '<div class="text-center text-slate-500 text-xs py-6 bg-slate-850 rounded-xl border border-slate-700/50">Пока никто не пригласил друзей.<br>Будьте первыми!</div>';
    } else {
        top10.forEach((u, index) => {
            let rankIcon = ''; let rankColor = 'text-slate-400'; let bgHighlight = 'bg-slate-850 border-slate-700/50';
            if (index === 0) { rankIcon = '👑'; rankColor = 'text-yellow-400'; bgHighlight = 'bg-yellow-500/10 border-yellow-500/30'; }
            else if (index === 1) { rankIcon = '🥈'; rankColor = 'text-slate-300'; bgHighlight = 'bg-slate-300/10 border-slate-300/30'; }
            else if (index === 2) { rankIcon = '🥉'; rankColor = 'text-orange-400'; bgHighlight = 'bg-orange-500/10 border-orange-500/30'; }
            else { rankIcon = '#' + (index + 1); }

            const isMe = u.id === currentUser.id;
            if (isMe && index > 2) bgHighlight = 'bg-teal-500/10 border-teal-500/30';

            html += `
                <div class="p-2 rounded-xl border ${bgHighlight} flex items-center justify-between transition-colors">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-5 text-center font-bold text-[11px] ${rankColor} shrink-0">${rankIcon}</div>
                        <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white border border-slate-600 overflow-hidden shrink-0 shadow-inner">
                            ${u.avatar ? `<img src="${u.avatar}" class="w-full h-full object-cover">` : u.name.charAt(0)}
                        </div>
                        <div class="min-w-0 pr-2">
                            <p class="font-bold text-[11px] text-white truncate max-w-[110px]">${u.name} ${isMe ? '<span class="text-[8px] text-teal-400 ml-1 font-normal">(Вы)</span>' : ''}</p>
                            <p class="text-[8px] text-slate-400 mt-0.5">Доход: <span class="text-teal-400">+${u.refEarned.toFixed(2)}</span></p>
                        </div>
                    </div>
                    <div class="text-right shrink-0 bg-slate-900/50 px-2 py-1 rounded-lg border border-slate-700/50">
                        <p class="text-white font-bold text-[11px]">${u.refCount}</p>
                        <p class="text-[6px] text-slate-500 uppercase mt-0.5 tracking-wider">друзей</p>
                    </div>
                </div>
            `;
        });
    }

    html += '</div><button onclick="window.closeModal()" class="w-full py-2.5 mt-2 bg-slate-800 text-white rounded-xl font-bold text-xs tap-effect hover:bg-slate-700 transition-colors">Закрыть</button>';
    modalContent.innerHTML = html;
  } catch (err) {
    modalContent.innerHTML = '<div class="p-4 text-center text-red-400 text-xs">Ошибка загрузки данных</div><button onclick="window.closeModal()" class="w-full py-2.5 mt-4 bg-slate-800 text-white rounded-xl font-bold text-xs">Закрыть</button>';
  }
};

// Start app
document.addEventListener('DOMContentLoaded', initApp);

