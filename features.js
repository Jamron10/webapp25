// ==========================================
// ФУНКЦИИ: Скины, Достижения, Сейф, Кланы, FAQ
// ==========================================

const getModalEl = () => ({
    overlay: document.getElementById('modal-overlay'),
    content: document.getElementById('modal-content')
});

// --- СКИНЫ МАЙНЕРА ---
window.SKINS = [
    { id: 'default', name: 'Оригинал', cost: 0, icon: 'fa-dharmachakra', colors: 'from-slate-800 to-slate-900', ring: 'border-t-teal-400', iconColor: 'text-teal-400' },
    { id: 'neon', name: 'Неон', cost: 15, icon: 'fa-compact-disc', colors: 'from-purple-900 to-fuchsia-900', ring: 'border-t-fuchsia-400', iconColor: 'text-fuchsia-400' },
    { id: 'gold', name: 'Голд Асик', cost: 50, icon: 'fa-microchip', colors: 'from-yellow-700 to-yellow-900', ring: 'border-t-yellow-400', iconColor: 'text-yellow-400' },
    { id: 'hacker', name: 'Хакер', cost: 100, icon: 'fa-terminal', colors: 'from-green-900 to-slate-900', ring: 'border-t-green-400', iconColor: 'text-green-400' }
];

window.openSkinsModal = () => {
    if(typeof triggerHaptic === 'function') triggerHaptic('medium');
    const { overlay, content } = getModalEl();
    const activeId = state.user.activeSkin || 'default';
    const unlocked = state.user.unlockedSkins || ['default'];

    let html = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-black text-white"><i class="fas fa-paint-brush text-pink-400 mr-2"></i> Магазин скинов</h3>
            <button onclick="window.closeModal()" class="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
        </div>
        <p class="text-xs text-slate-400 mb-4">Улучшайте внешний вид вашего майнера! Купленные скины остаются навсегда.</p>
        <div class="grid grid-cols-2 gap-3 mb-2 max-h-[60vh] overflow-y-auto hide-scrollbar">
    `;

    window.SKINS.forEach(skin => {
        const isUnlocked = unlocked.includes(skin.id);
        const isActive = activeId === skin.id;

        let btnHtml = '';
        if (isActive) {
            btnHtml = `<button class="w-full py-2 bg-teal-500/20 text-teal-400 rounded-lg text-xs font-bold border border-teal-500/50 cursor-default"><i class="fas fa-check mr-1"></i> Выбран</button>`;
        } else if (isUnlocked) {
            btnHtml = `<button onclick="window.equipSkin('${skin.id}')" class="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition-colors tap-effect">Надеть</button>`;
        } else {
            const canBuy = state.user.balance >= skin.cost;
            btnHtml = `<button onclick="window.buySkin('${skin.id}', ${skin.cost})" class="w-full py-2 ${canBuy ? 'bg-pink-500 hover:bg-pink-400 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'bg-slate-800 text-slate-500 border border-slate-700'} rounded-lg text-xs font-bold transition-colors tap-effect flex items-center justify-center"><i class="fas fa-shopping-cart mr-1.5"></i> ${skin.cost} USDT</button>`;
        }

        html += `
            <div class="bg-slate-850 p-3 rounded-xl border ${isActive ? 'border-teal-500/50 shadow-[0_0_15px_rgba(45,212,191,0.1)]' : 'border-slate-700/50'} flex flex-col items-center relative overflow-hidden group">
                <div class="w-16 h-16 rounded-full bg-gradient-to-b ${skin.colors} border-2 border-slate-700 flex items-center justify-center mb-3 relative shadow-inner">
                    <i class="fas ${skin.icon} ${skin.iconColor} text-3xl"></i>
                </div>
                <h4 class="text-white font-bold text-xs mb-2">${skin.name}</h4>
                ${btnHtml}
            </div>
        `;
    });

    html += `</div>`;
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('animate-pop-in'); }, 10);
};

window.buySkin = (id, cost) => {
    if (state.user.balance < cost) return showToast('Недостаточно USDT');
    state.user.balance -= cost;
    if(!state.user.unlockedSkins) state.user.unlockedSkins = ['default'];
    state.user.unlockedSkins.push(id);
    state.user.activeSkin = id;
    
    if(typeof saveState === 'function') saveState();
    showToast('Скин успешно куплен!');
    if(typeof triggerHaptic === 'function') triggerHaptic('success');
    if(typeof updateHeaderUI === 'function') updateHeaderUI();
    if (typeof currentTab !== 'undefined' && currentTab === 'home' && typeof renderTab === 'function') renderTab('home');
    window.openSkinsModal();
};

window.equipSkin = (id) => {
    state.user.activeSkin = id;
    if(typeof saveState === 'function') saveState();
    showToast('Скин применен');
    if(typeof triggerHaptic === 'function') triggerHaptic('light');
    if (typeof currentTab !== 'undefined' && currentTab === 'home' && typeof renderTab === 'function') renderTab('home');
    window.openSkinsModal();
};


// --- ДОСТИЖЕНИЯ ---
window.ACHIEVEMENTS = [
    { id: 'inv_1', title: 'Душа компании', desc: 'Пригласи 1 друга', type: 'friends', target: 1, reward: 0.01, icon: 'fa-user-plus' },
    { id: 'inv_10', title: 'Сетевик', desc: 'Пригласи 10 друзей', type: 'friends', target: 10, reward: 0.1, icon: 'fa-users' },
    { id: 'lvl_5', title: 'Инженер', desc: 'Прокачай майнер до 5 уровня', type: 'level', target: 5, reward: 0.04, icon: 'fa-arrow-up' },
    { id: 'earn_10', title: 'Первые деньги', desc: 'Намайни 10 USDT', type: 'earned', target: 10, reward: 0.02, icon: 'fa-coins' },
    { id: 'with_1', title: 'Инвестор', desc: 'Сделай первый вывод', type: 'withdraw', target: 1, reward: 0.04, icon: 'fa-wallet' }
];

window.checkAchievementProgress = (type) => {
    if (type === 'friends') return state.friends ? state.friends.length : 0;
    if (type === 'level') return state.user.level || 1;
    if (type === 'earned') return state.user.totalEarned || 0;
    if (type === 'withdraw') return state.withdrawals ? state.withdrawals.length : 0;
    return 0;
};

window.openAchievementsModal = () => {
    if(typeof triggerHaptic === 'function') triggerHaptic('medium');
    const { overlay, content } = getModalEl();
    if(!state.user.achievements) state.user.achievements = [];

    let html = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-black text-white"><i class="fas fa-medal text-yellow-400 mr-2"></i> Достижения</h3>
            <button onclick="window.closeModal()" class="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-3 mb-2 max-h-[60vh] overflow-y-auto hide-scrollbar">
    `;

    window.ACHIEVEMENTS.forEach(ach => {
        const progress = window.checkAchievementProgress(ach.type);
        const isCompleted = progress >= ach.target;
        const isClaimed = state.user.achievements.includes(ach.id);
        const percent = Math.min(100, (progress / ach.target) * 100);

        let btnHtml = '';
        if (isClaimed) {
            btnHtml = `<span class="bg-teal-500/10 text-teal-400 text-[10px] font-bold px-2 py-1 rounded border border-teal-500/20"><i class="fas fa-check mr-1"></i>Получено</span>`;
        } else if (isCompleted) {
            btnHtml = `<button onclick="window.claimAchievement('${ach.id}', ${ach.reward})" class="bg-yellow-500 hover:bg-yellow-400 text-slate-900 text-[10px] font-black px-3 py-1.5 rounded shadow-lg tap-effect animate-pulse">Забрать +${ach.reward}</button>`;
        } else {
            btnHtml = `<span class="text-[10px] text-slate-500 font-mono">${typeof progress === 'number' && !Number.isInteger(progress) ? progress.toFixed(1) : progress}/${ach.target}</span>`;
        }

        html += `
            <div class="bg-slate-850 p-3.5 rounded-xl border ${isCompleted && !isClaimed ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]' : 'border-slate-700/50'} flex items-center justify-between">
                <div class="flex items-center space-x-3 w-full pr-2">
                    <div class="w-10 h-10 rounded-full ${isClaimed ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30' : (isCompleted ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-slate-800 text-slate-500')} flex items-center justify-center shrink-0">
                        <i class="fas ${ach.icon}"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <h4 class="text-white font-bold text-xs truncate">${ach.title}</h4>
                        <p class="text-[9px] text-slate-400 mt-0.5 truncate">${ach.desc}</p>
                        ${!isClaimed ? `
                        <div class="w-full bg-slate-900 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-700/50">
                            <div class="bg-gradient-to-r from-yellow-500 to-orange-500 h-1.5 rounded-full" style="width: ${percent}%"></div>
                        </div>` : ''}
                    </div>
                </div>
                <div class="shrink-0 flex items-center justify-end min-w-[60px]">
                    ${btnHtml}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('animate-pop-in'); }, 10);
};

window.claimAchievement = (id, reward) => {
    state.user.balance += reward;
    state.user.totalEarned += reward;
    if(!state.user.achievements) state.user.achievements = [];
    state.user.achievements.push(id);
    if(typeof saveState === 'function') saveState();
    showToast(`Достижение получено: +${reward} USDT!`);
    if(typeof triggerHaptic === 'function') triggerHaptic('success');
    if(typeof updateHeaderUI === 'function') updateHeaderUI();
    window.openAchievementsModal();
};


// --- СЕЙФ (СТЕЙКИНГ) ---
window.openStakingModal = () => {
    if(typeof triggerHaptic === 'function') triggerHaptic('medium');
    const { overlay, content } = getModalEl();
    if(!state.user.staking) state.user.staking = [];

    let html = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-black text-white"><i class="fas fa-vault text-blue-400 mr-2"></i> Сейф (Стейкинг)</h3>
            <button onclick="window.closeModal()" class="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
        </div>
        <p class="text-xs text-slate-400 mb-4">Заморозьте USDT на время и получите гарантированный процент прибыли.</p>
        
        <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-5">
            <label class="block text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-2">Сумма депозита (USDT)</label>
            <div class="relative">
                <input type="number" id="stake-amount" class="w-full bg-slate-900 border border-blue-500/30 rounded-lg p-3 pr-16 text-white text-sm focus:border-blue-400 outline-none" placeholder="Мин. 5 USDT">
                <button onclick="document.getElementById('stake-amount').value = state.user.balance.toFixed(2)" class="absolute right-2 top-2 bottom-2 bg-slate-800 text-blue-400 text-xs font-bold px-3 rounded-md hover:bg-slate-700 transition-colors">МАКС</button>
            </div>
            
            <label class="block text-[10px] text-blue-400 font-bold uppercase tracking-wider mt-4 mb-2">Срок и доходность</label>
            <div class="grid grid-cols-3 gap-2">
                <button onclick="window.selectStakePlan(7, 5, this)" class="stake-plan-btn active bg-blue-500 text-white py-2 rounded-lg text-xs font-bold transition-colors border border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]">7 дней<br><span class="text-[10px] font-medium">+5%</span></button>
                <button onclick="window.selectStakePlan(14, 12, this)" class="stake-plan-btn bg-slate-800 text-slate-400 py-2 rounded-lg text-xs font-bold transition-colors border border-slate-700">14 дней<br><span class="text-[10px] font-medium">+12%</span></button>
                <button onclick="window.selectStakePlan(30, 30, this)" class="stake-plan-btn bg-slate-800 text-slate-400 py-2 rounded-lg text-xs font-bold transition-colors border border-slate-700">30 дней<br><span class="text-[10px] font-medium">+30%</span></button>
            </div>
            
            <button onclick="window.startStaking()" class="w-full mt-4 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-sm shadow-lg tap-effect transition-colors">Положить в сейф</button>
        </div>

        <h4 class="font-bold text-white text-sm mb-3">Ваши вклады</h4>
        <div class="space-y-2 max-h-[30vh] overflow-y-auto hide-scrollbar">
    `;

    if (state.user.staking.length === 0) {
        html += `<div class="text-center py-4 text-slate-500 text-xs bg-slate-850 rounded-xl border border-slate-700/50">Вкладов пока нет</div>`;
    } else {
        const now = Date.now();
        state.user.staking.forEach(s => {
            const isReady = now >= s.unlockDate;
            const profit = s.amount * (s.percent / 100);
            const total = s.amount + profit;
            const timeLeft = Math.max(0, s.unlockDate - now);
            const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
            
            html += `
                <div class="bg-slate-850 p-3 rounded-xl border ${isReady ? 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.1)]' : 'border-slate-700/50'} flex justify-between items-center">
                    <div>
                        <p class="text-white font-bold text-xs">${s.amount} USDT <i class="fas fa-arrow-right text-[10px] text-slate-500 mx-1"></i> <span class="text-green-400">${total.toFixed(2)} USDT</span></p>
                        <p class="text-[9px] text-slate-400 mt-1">${isReady ? '<span class="text-green-400 font-bold">Готово к сбору!</span>' : `Осталось дней: ${daysLeft}`}</p>
                    </div>
                    ${isReady ? `<button onclick="window.claimStaking('${s.id}')" class="bg-green-500 hover:bg-green-400 text-slate-900 font-black px-3 py-1.5 rounded text-xs shadow-lg tap-effect">Собрать</button>` : `<span class="bg-slate-800 text-slate-500 text-[10px] px-2 py-1 rounded border border-slate-700"><i class="fas fa-lock mr-1"></i>Заморожено</span>`}
                </div>
            `;
        });
    }

    html += `</div>`;
    window.currentStakePlan = { days: 7, percent: 5 };
    
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('animate-pop-in'); }, 10);
};

window.selectStakePlan = (days, percent, btnEl) => {
    window.currentStakePlan = { days, percent };
    document.querySelectorAll('.stake-plan-btn').forEach(b => {
        b.classList.remove('bg-blue-500', 'text-white', 'border-blue-400', 'shadow-[0_0_10px_rgba(59,130,246,0.3)]', 'active');
        b.classList.add('bg-slate-800', 'text-slate-400', 'border-slate-700');
    });
    btnEl.classList.remove('bg-slate-800', 'text-slate-400', 'border-slate-700');
    btnEl.classList.add('bg-blue-500', 'text-white', 'border-blue-400', 'shadow-[0_0_10px_rgba(59,130,246,0.3)]', 'active');
    if(typeof triggerHaptic === 'function') triggerHaptic('light');
};

window.startStaking = () => {
    const amount = parseFloat(document.getElementById('stake-amount').value);
    if (isNaN(amount) || amount < 5) return showToast('Минимальная сумма 5 USDT');
    if (amount > state.user.balance) return showToast('Недостаточно средств');

    state.user.balance -= amount;
    const plan = window.currentStakePlan;
    const unlockDate = Date.now() + (plan.days * 24 * 60 * 60 * 1000);
    
    state.user.staking.push({
        id: 'st_' + Date.now(),
        amount: amount,
        percent: plan.percent,
        unlockDate: unlockDate,
        date: new Date().toISOString()
    });

    if(!state.withdrawals) state.withdrawals = [];
    state.withdrawals.push({
        id: 'st_' + Date.now() + '_dep',
        amount: amount,
        address: 'Перевод в Сейф',
        network: 'Внутри системы',
        status: 'completed',
        date: new Date().toISOString()
    });

    if(typeof saveState === 'function') saveState();
    if(typeof updateHeaderUI === 'function') updateHeaderUI();
    showToast('Средства отправлены в сейф!');
    if(typeof triggerHaptic === 'function') triggerHaptic('success');
    window.openStakingModal();
    if (typeof currentTab !== 'undefined' && currentTab === 'profile' && typeof renderTab === 'function') renderTab('profile');
};

window.claimStaking = (id) => {
    const index = state.user.staking.findIndex(s => s.id === id);
    if (index === -1) return;
    const s = state.user.staking[index];
    if (Date.now() < s.unlockDate) return showToast('Срок еще не вышел');

    const profit = s.amount * (s.percent / 100);
    const total = s.amount + profit;
    state.user.balance += total;
    state.user.totalEarned += profit;
    state.user.staking.splice(index, 1);
    
    if(!state.deposits) state.deposits = [];
    state.deposits.push({
        id: 'st_' + Date.now() + '_prof',
        amount: total,
        method: 'Сбор с Сейфа (+профит)',
        status: 'completed',
        date: new Date().toISOString()
    });

    if(typeof saveState === 'function') saveState();
    if(typeof updateHeaderUI === 'function') updateHeaderUI();
    showToast(`Сейф открыт: +${total.toFixed(2)} USDT`);
    if(typeof triggerHaptic === 'function') triggerHaptic('success');
    window.openStakingModal();
    if (typeof currentTab !== 'undefined' && currentTab === 'profile' && typeof renderTab === 'function') renderTab('profile');
};


// --- FAQ ---
window.openFAQModal = () => {
    if(typeof triggerHaptic === 'function') triggerHaptic('light');
    const { overlay, content } = getModalEl();
    let html = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-black text-white"><i class="fas fa-question-circle text-teal-400 mr-2"></i> Помощь / FAQ</h3>
            <button onclick="window.closeModal()" class="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-3 max-h-[60vh] overflow-y-auto hide-scrollbar pb-4">
            <div class="bg-slate-850 p-4 rounded-xl border border-slate-700/50 animate-slide-up">
                <h4 class="text-white font-bold text-sm mb-2"><i class="fas fa-hammer text-teal-400 mr-1.5"></i> Как работает майнинг?</h4>
                <p class="text-slate-400 text-xs leading-relaxed">Ваш майнер работает 24/7. Даже когда вы закрыли приложение, USDT продолжают капать. Важно: хранилище заполняется за сутки, заходите собирать прибыль хотя бы раз в день.</p>
            </div>
            <div class="bg-slate-850 p-4 rounded-xl border border-slate-700/50 animate-slide-up delay-75">
                <h4 class="text-white font-bold text-sm mb-2"><i class="fas fa-arrow-up text-pink-400 mr-1.5"></i> Как повысить доход?</h4>
                <p class="text-slate-400 text-xs leading-relaxed">Улучшайте оборудование на главном экране за USDT. Чем выше уровень, тем больше добыча в час. Максимальный уровень - 10.</p>
            </div>
            <div class="bg-slate-850 p-4 rounded-xl border border-slate-700/50 animate-slide-up delay-150">
                <h4 class="text-white font-bold text-sm mb-2"><i class="fas fa-users text-blue-400 mr-1.5"></i> Реферальная система</h4>
                <p class="text-slate-400 text-xs leading-relaxed">Приглашайте друзей по своей ссылке. Вы получите фиксированный бонус за регистрацию и процент (%) от каждой их собранной прибыли с майнера.</p>
            </div>
            <div class="bg-slate-850 p-4 rounded-xl border border-slate-700/50 animate-slide-up delay-225">
                <h4 class="text-white font-bold text-sm mb-2"><i class="fas fa-wallet text-yellow-400 mr-1.5"></i> Как вывести деньги?</h4>
                <p class="text-slate-400 text-xs leading-relaxed">Перейдите в "Профиль", нажмите "Вывести", введите адрес вашего USDT кошелька ((сети TON или BEP-20)). Заявка будет обработана администратором.</p>
            </div>
            <div class="bg-slate-850 p-4 rounded-xl border border-slate-700/50 animate-slide-up delay-300">
                <h4 class="text-white font-bold text-sm mb-2"><i class="fas fa-vault text-purple-400 mr-1.5"></i> Что такое Сейф?</h4>
                <p class="text-slate-400 text-xs leading-relaxed">Заморозьте свои USDT на срок от 7 до 30 дней, чтобы получить сверху от 5% до 30% чистой прибыли после завершения срока.</p>
            </div>
        </div>
        <button onclick="window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink ? window.Telegram.WebApp.openTelegramLink('https://t.me/Crypto_adminka') : window.open('https://t.me/Crypto_adminka', '_blank')" class="w-full mt-2 py-3 bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 text-white rounded-xl font-bold text-xs tap-effect shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all animate-slide-up delay-400"><i class="fas fa-headset mr-2"></i>Связаться с поддержкой</button>
    `;
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('animate-pop-in'); }, 10);
};
