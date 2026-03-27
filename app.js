/**
 * Treffsicher — Main Application
 *
 * Handles: authentication, session management, routing/views,
 * friends, friend-request timer, profile settings, and toast notifications.
 *
 * NOTE: All data is stored in localStorage. No server communication.
 * Passwords are stored in plain text — this is intentional for a
 * purely local, demo application.
 */

/* ===================================================
   STORAGE KEYS
   =================================================== */
const KEYS = {
  USERS:            'tf_users',
  SESSION:          'tf_session',
  MIGUEL_ACCEPTED:  id => `tf_miguel_${id}`,
  QUIZ_ANSWERS:     id => `tf_quiz_answers_${id}`,
  QUIZ_LOCKED:      id => `tf_quiz_locked_${id}`,
  QUIZ_POSITION:    id => `tf_quiz_pos_${id}`,
};

/* ===================================================
   STORAGE HELPERS
   =================================================== */
function storageGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch { return fallback; }
}
function storageSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function storageRemove(key) {
  localStorage.removeItem(key);
}

/* ===================================================
   USER MANAGEMENT
   =================================================== */
function getUsers()          { return storageGet(KEYS.USERS, []); }
function saveUsers(users)    { storageSet(KEYS.USERS, users); }

function findById(id)        { return getUsers().find(u => u.id === id) || null; }
function findByName(name)    { return getUsers().find(u => u.name.toLowerCase() === name.trim().toLowerCase()) || null; }
function findByEmail(email)  { return getUsers().find(u => u.email.toLowerCase() === email.trim().toLowerCase()) || null; }

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ===================================================
   SESSION
   =================================================== */
function getSession()               { return storageGet(KEYS.SESSION, null); }
function setSession(userId, loginTime) { storageSet(KEYS.SESSION, { userId, loginTime }); }
function clearSession()             { storageRemove(KEYS.SESSION); }

function getCurrentUser() {
  const session = getSession();
  return session ? findById(session.userId) : null;
}

/* ===================================================
   AUTHENTICATION
   =================================================== */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function register(name, email, password) {
  name  = name.trim();
  email = email.trim().toLowerCase();

  if (!name)     return { ok: false, field: 'name',  msg: 'Bitte gib einen Benutzernamen ein.' };
  if (!email)    return { ok: false, field: 'email', msg: 'Bitte gib eine E-Mail-Adresse ein.' };
  if (!validateEmail(email)) return { ok: false, field: 'email', msg: 'Die E-Mail-Adresse ist nicht gültig.' };
  if (!password || password.length < 4) return { ok: false, field: 'password', msg: 'Das Passwort muss mindestens 4 Zeichen lang sein.' };

  if (findByName(name))   return { ok: false, field: 'name',  msg: `Es gibt bereits einen User namens „${name}".` };
  if (findByEmail(email)) return { ok: false, field: 'email', msg: 'Diese E-Mail-Adresse ist bereits registriert.' };

  const user = { id: generateId(), name, email, password, createdAt: Date.now() };
  const users = getUsers();
  users.push(user);
  saveUsers(users);

  const loginTime = Date.now();
  setSession(user.id, loginTime);
  return { ok: true, user };
}

function login(identifier, password) {
  identifier = identifier.trim();
  if (!identifier) return { ok: false, msg: 'Bitte gib deinen Namen oder deine E-Mail ein.' };
  if (!password)   return { ok: false, msg: 'Bitte gib dein Passwort ein.' };

  const user = findByName(identifier) || findByEmail(identifier);
  if (!user)           return { ok: false, msg: 'Kein Konto mit diesem Namen oder dieser E-Mail gefunden.' };
  if (user.password !== password) return { ok: false, msg: 'Das Passwort ist falsch. Bitte versuche es erneut.' };

  const loginTime = Date.now();
  setSession(user.id, loginTime);
  return { ok: true, user };
}

function logout() {
  clearSession();
  showLanding();
}

/* ===================================================
   VIEW MANAGEMENT
   =================================================== */
let currentTab = 'overview';
let friendRequestTimerId = null;

function showLanding() {
  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  clearTimeout(friendRequestTimerId);
}

function showApp() {
  const user = getCurrentUser();
  if (!user) { showLanding(); return; }

  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  updateNavProfile(user);
  showDashboard();
  startFriendRequestTimer();
  updateOverviewStats();
}

function showDashboard() {
  document.getElementById('view-dashboard').classList.remove('hidden');
  document.getElementById('view-quiz-session').classList.add('hidden');
  document.getElementById('view-quiz-overview').classList.add('hidden');
  document.getElementById('view-results').classList.add('hidden');
  switchTab(currentTab, false);
}

function switchTab(tab, updateCurrent = true) {
  if (updateCurrent) currentTab = tab;

  // Update nav tab buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Show / hide panels
  const panels = {
    'overview':   'panel-overview',
    'friends':    'panel-friends',
    'quiz-area':  'panel-quiz-area',
  };
  Object.entries(panels).forEach(([key, id]) => {
    document.getElementById(id).classList.toggle('hidden', key !== tab);
  });

  // Refresh panel content
  if (tab === 'overview')   updateOverviewStats();
  if (tab === 'friends')    updateFriendsPanel();
  if (tab === 'quiz-area')  updateQuizAreaPanel();
}

/* ===================================================
   NAV PROFILE
   =================================================== */
function updateNavProfile(user) {
  document.getElementById('nav-user-name').textContent = user.name;
  document.getElementById('nav-avatar-initial').textContent = user.name.charAt(0).toUpperCase();
}

/* ===================================================
   OVERVIEW PANEL
   =================================================== */
function updateOverviewStats() {
  const user = getCurrentUser();
  if (!user) return;

  const miguelAccepted = isMiguelAccepted(user.id);
  const answers = storageGet(KEYS.QUIZ_ANSWERS(user.id), {});
  const answered = Object.keys(answers).length;
  const locked = storageGet(KEYS.QUIZ_LOCKED(user.id), false);

  // Update greeting
  const hour = new Date().getHours();
  let greeting = 'Willkommen zurück';
  if (hour < 11)  greeting = 'Guten Morgen';
  else if (hour < 17) greeting = 'Guten Tag';
  else if (hour < 21) greeting = 'Guten Abend';
  document.getElementById('overview-greeting').textContent = `${greeting}, ${user.name}!`;

  const subTexts = [
    'Schön, dass du wieder da bist.',
    'Was möchtest du heute erkunden?',
    'Dein Matching wartet auf dich.',
  ];
  document.getElementById('overview-subtext').textContent = subTexts[Math.floor(Math.random() * subTexts.length)];

  // Stats
  document.getElementById('stat-friends').textContent = miguelAccepted ? '1' : '0';

  if (locked) {
    document.getElementById('stat-quiz-status').textContent = 'Abgeschlossen ✓';
    const score = calculateScore(user.id);
    document.getElementById('stat-score').textContent = `${score} / 100`;
  } else if (answered > 0) {
    document.getElementById('stat-quiz-status').textContent = `${answered} / 100`;
    document.getElementById('stat-score').textContent = '–';
  } else {
    document.getElementById('stat-quiz-status').textContent = 'Nicht gestartet';
    document.getElementById('stat-score').textContent = '–';
  }

  // Hint
  if (!miguelAccepted) {
    document.getElementById('hint-title').textContent = 'Nächster Schritt';
    document.getElementById('hint-body').textContent = 'Warte auf deine erste Verbindungsanfrage, um das Quiz starten zu können. Sie erscheint in Kürze.';
  } else if (locked) {
    document.getElementById('hint-title').textContent = 'Quiz abgeschlossen!';
    document.getElementById('hint-body').textContent = 'Du hast alle 100 Fragen beantwortet. Schau dir dein Ergebnis im Quiz-Bereich an.';
  } else if (answered > 0) {
    document.getElementById('hint-title').textContent = 'Quiz fortsetzen';
    document.getElementById('hint-body').textContent = `Du hast ${answered} von 100 Fragen beantwortet. Gehe zum Quiz-Bereich, um weiterzumachen.`;
  } else {
    document.getElementById('hint-title').textContent = 'Quiz starten';
    document.getElementById('hint-body').textContent = 'Du bist mit Miguel_Baudet verbunden! Gehe zum Quiz-Bereich und starte das Matching-Quiz.';
  }
}

function calculateScore(userId) {
  const answers = storageGet(KEYS.QUIZ_ANSWERS(userId), {});
  const allQ = Quiz && Quiz.getQuestions ? Quiz.getQuestions() : [];
  if (!allQ.length) return 0;
  let score = 0;
  allQ.forEach(q => {
    const userAnswer = answers[q.id];
    if (userAnswer !== undefined && userAnswer === q.my_answer) score++;
  });
  return score;
}

/* ===================================================
   FRIENDS PANEL
   =================================================== */
function isMiguelAccepted(userId) {
  return storageGet(KEYS.MIGUEL_ACCEPTED(userId), false);
}
function setMiguelAccepted(userId) {
  storageSet(KEYS.MIGUEL_ACCEPTED(userId), true);
}

function updateFriendsPanel() {
  const user = getCurrentUser();
  if (!user) return;

  const miguelAccepted = isMiguelAccepted(user.id);
  const popupVisible = !document.getElementById('popup-friend-request').classList.contains('hidden');

  // Pending section: show only if popup is visible (request is pending)
  const pendingWrap = document.getElementById('friends-pending-wrap');
  const pendingList = document.getElementById('friends-pending-list');

  if (popupVisible && !miguelAccepted) {
    pendingWrap.classList.remove('hidden');
    pendingList.innerHTML = buildPendingCardHTML();
  } else {
    pendingWrap.classList.add('hidden');
    pendingList.innerHTML = '';
  }

  // Friends list
  const friendsList = document.getElementById('friends-list');
  const emptyState = document.getElementById('friends-empty-state');

  if (miguelAccepted) {
    emptyState && emptyState.remove();
    friendsList.innerHTML = buildFriendCardHTML(user);
  } else {
    if (!emptyState) {
      friendsList.innerHTML = `
        <div class="empty-state" id="friends-empty-state">
          <div class="empty-icon">👋</div>
          <p>Du hast noch keine Verbindungen.<br />Warte auf eine Anfrage oder suche nach jemandem.</p>
        </div>`;
    }
  }
}

function buildPendingCardHTML() {
  return `
    <div class="pending-card">
      <div class="friend-avatar">M</div>
      <div class="friend-info">
        <div class="friend-name">Miguel_Baudet</div>
        <div class="friend-status">Möchte dich als Freund hinzufügen</div>
      </div>
      <div class="friend-actions">
        <button class="btn btn-success" onclick="acceptFriendRequest()">Annehmen</button>
      </div>
    </div>`;
}

function buildFriendCardHTML(currentUser) {
  const locked  = storageGet(KEYS.QUIZ_LOCKED(currentUser.id), false);
  const answers = storageGet(KEYS.QUIZ_ANSWERS(currentUser.id), {});
  const count   = Object.keys(answers).length;

  let statusText = 'Verbunden · Quiz ausstehend';
  let actionBtn  = `<button class="btn btn-primary" onclick="goToQuizArea()">Quiz starten</button>`;

  if (locked) {
    statusText = 'Verbunden · Quiz abgeschlossen ✓';
    actionBtn  = `<button class="btn btn-ghost" onclick="goToQuizArea()">Ergebnis ansehen</button>`;
  } else if (count > 0) {
    statusText = `Verbunden · Quiz: ${count}/100`;
    actionBtn  = `<button class="btn btn-primary" onclick="goToQuizArea()">Quiz fortsetzen</button>`;
  }

  return `
    <div class="friend-card">
      <div class="friend-avatar">M</div>
      <div class="friend-info">
        <div class="friend-name">Miguel_Baudet</div>
        <div class="friend-status">${statusText}</div>
      </div>
      <div class="friend-actions">${actionBtn}</div>
    </div>`;
}

function goToQuizArea() {
  switchTab('quiz-area');
}

/* ===================================================
   QUIZ AREA PANEL
   =================================================== */
function updateQuizAreaPanel() {
  const user = getCurrentUser();
  if (!user) return;

  const miguelAccepted = isMiguelAccepted(user.id);
  const locked  = storageGet(KEYS.QUIZ_LOCKED(user.id), false);
  const answers = storageGet(KEYS.QUIZ_ANSWERS(user.id), {});
  const count   = Object.keys(answers).length;
  const container = document.getElementById('quiz-area-content');

  if (!miguelAccepted) {
    container.innerHTML = `
      <div class="quiz-locked-state">
        <div class="locked-icon">🔒</div>
        <h3>Quiz noch nicht verfügbar</h3>
        <p>Nimm zunächst eine Freundschaftsanfrage an, um das Quiz mit Miguel_Baudet starten zu können.</p>
      </div>`;
    return;
  }

  if (locked) {
    const score = calculateScore(user.id);
    container.innerHTML = `
      <div class="quiz-complete-card">
        <div style="font-size:3rem;margin-bottom:16px;">🎉</div>
        <h3>Quiz abgeschlossen!</h3>
        <p style="margin-bottom:20px;">Du hast <strong>${score} von 100</strong> Punkten erreicht.</p>
        <button class="btn btn-primary" onclick="Quiz.showResultsView()">Ergebnis ansehen →</button>
      </div>`;
    return;
  }

  if (count > 0) {
    const pct = Math.round((count / 100) * 100);
    container.innerHTML = `
      <div class="quiz-progress-card">
        <h3>Quiz mit Miguel_Baudet</h3>
        <p>${count} von 100 Fragen beantwortet</p>
        <div class="quiz-area-progress-bar">
          <div class="quiz-area-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="quiz-area-actions">
          <button class="btn btn-primary" onclick="Quiz.start()">Weiter →</button>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="quiz-start-card">
      <div class="quiz-start-avatar">M</div>
      <div class="quiz-start-info">
        <h3>Quiz mit Miguel_Baudet</h3>
        <p>Miguel_Baudet hat alle Fragen bereits beantwortet. Jetzt bist du an der Reihe – beantworte alle 100 Fragen und erfahre, wie gut ihr zusammenpasst.</p>
        <button class="btn btn-primary" onclick="Quiz.start()">Quiz starten →</button>
      </div>
    </div>`;
}

/* ===================================================
   FRIEND REQUEST TIMER & POPUP
   =================================================== */
function startFriendRequestTimer() {
  const session = getSession();
  if (!session) return;

  const { userId, loginTime } = session;
  if (isMiguelAccepted(userId)) return;

  const elapsed = Date.now() - loginTime;
  const delay   = Math.max(0, 60000 - elapsed);

  clearTimeout(friendRequestTimerId);
  friendRequestTimerId = setTimeout(() => {
    if (!isMiguelAccepted(userId)) showFriendRequestPopup();
  }, delay);
}

function showFriendRequestPopup() {
  document.getElementById('popup-friend-request').classList.remove('hidden');
  // Update friends panel if currently visible
  if (currentTab === 'friends') updateFriendsPanel();
}

function acceptFriendRequest() {
  const user = getCurrentUser();
  if (!user) return;

  setMiguelAccepted(user.id);
  document.getElementById('popup-friend-request').classList.add('hidden');

  showToast('Du bist jetzt mit Miguel_Baudet befreundet!', 'success');

  if (currentTab === 'friends')   updateFriendsPanel();
  if (currentTab === 'quiz-area') updateQuizAreaPanel();
  if (currentTab === 'overview')  updateOverviewStats();
}

/* ===================================================
   FRIEND SEARCH (fake — always returns not found)
   =================================================== */
function searchFriend(name) {
  name = name.trim();
  if (!name) return;

  const resultEl = document.getElementById('friends-search-result');
  resultEl.textContent = `Es gibt keine Person namens „${name}".`;
  resultEl.classList.remove('hidden');
  setTimeout(() => resultEl.classList.add('hidden'), 5000);
}

/* ===================================================
   PROFILE SETTINGS
   =================================================== */
function changeName(newName) {
  newName = newName.trim();
  const user = getCurrentUser();
  if (!user) return { ok: false, msg: 'Nicht eingeloggt.' };
  if (!newName) return { ok: false, msg: 'Bitte gib einen neuen Namen ein.' };
  if (newName === user.name) return { ok: false, msg: 'Das ist bereits dein aktueller Name.' };

  const existing = findByName(newName);
  if (existing && existing.id !== user.id) {
    return { ok: false, msg: `Es gibt bereits einen User namens „${newName}".` };
  }

  const users = getUsers().map(u => u.id === user.id ? { ...u, name: newName } : u);
  saveUsers(users);
  updateNavProfile({ ...user, name: newName });
  return { ok: true };
}

function changePassword(newPassword) {
  if (!newPassword || newPassword.length < 4) {
    return { ok: false, msg: 'Das Passwort muss mindestens 4 Zeichen lang sein.' };
  }
  const user = getCurrentUser();
  if (!user) return { ok: false, msg: 'Nicht eingeloggt.' };

  const users = getUsers().map(u => u.id === user.id ? { ...u, password: newPassword } : u);
  saveUsers(users);
  return { ok: true };
}

function deleteAccount() {
  const session = getSession();
  if (!session) { clearAllAndReset(); return; }

  const userId = session.userId;
  // Remove user from users array
  const users = getUsers().filter(u => u.id !== userId);
  saveUsers(users);

  // Remove all user-specific keys
  [
    KEYS.MIGUEL_ACCEPTED(userId),
    KEYS.QUIZ_ANSWERS(userId),
    KEYS.QUIZ_LOCKED(userId),
    KEYS.QUIZ_POSITION(userId),
  ].forEach(k => storageRemove(k));

  clearSession();
  showToast('Dein Konto wurde gelöscht.', 'info');
  setTimeout(() => showLanding(), 600);
}

/* ===================================================
   TOASTS
   =================================================== */
function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || ''}</span><span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('visible'));
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ===================================================
   MODALS
   =================================================== */
function openModal(modalId) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(modalId).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById(modalId).classList.add('hidden');
  document.body.style.overflow = '';
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ===================================================
   SCROLL REVEAL (landing page sections)
   =================================================== */
function initScrollReveal() {
  const targets = document.querySelectorAll('.section-features, .section-how, .section-testimonials');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  targets.forEach(el => observer.observe(el));
}

/* ===================================================
   EVENT LISTENERS SETUP
   =================================================== */
function setupEventListeners() {

  // ---- Landing nav buttons ----
  document.getElementById('btn-open-login').addEventListener('click', () => openModal('modal-login'));
  document.getElementById('btn-open-register').addEventListener('click', () => openModal('modal-register'));
  document.getElementById('btn-hero-register').addEventListener('click', () => openModal('modal-register'));
  document.getElementById('btn-cta-register').addEventListener('click', () => openModal('modal-register'));

  // ---- Modal close buttons ----
  document.getElementById('btn-close-login').addEventListener('click', () => closeModal('modal-login'));
  document.getElementById('btn-close-register').addEventListener('click', () => closeModal('modal-register'));
  document.getElementById('btn-close-profile-settings').addEventListener('click', () => closeModal('modal-profile-settings'));
  document.getElementById('btn-close-delete-confirm').addEventListener('click', () => closeModal('modal-delete-confirm'));

  // Overlay click closes modals (except profile-settings, delete-confirm)
  document.getElementById('modal-overlay').addEventListener('click', () => {
    if (!document.getElementById('modal-profile-settings').classList.contains('hidden')) return;
    if (!document.getElementById('modal-delete-confirm').classList.contains('hidden')) return;
    closeAllModals();
  });

  // ---- Modal switchers ----
  document.getElementById('btn-switch-to-register').addEventListener('click', () => {
    closeModal('modal-login');
    openModal('modal-register');
  });
  document.getElementById('btn-switch-to-login').addEventListener('click', () => {
    closeModal('modal-register');
    openModal('modal-login');
  });

  // ---- Login form ----
  document.getElementById('btn-login-submit').addEventListener('click', handleLogin);
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // ---- Register form ----
  document.getElementById('btn-register-submit').addEventListener('click', handleRegister);
  document.getElementById('register-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });

  // ---- App nav tabs ----
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      // Only switch tabs when in dashboard view
      if (document.getElementById('view-dashboard').classList.contains('hidden')) {
        showDashboard();
      }
      switchTab(btn.dataset.tab);
    });
  });

  // ---- Profile dropdown toggle ----
  const profileTrigger = document.getElementById('nav-profile-trigger');
  const profileDropdown = document.getElementById('nav-profile-dropdown');

  profileTrigger.addEventListener('click', e => {
    e.stopPropagation();
    const open = !profileDropdown.classList.contains('hidden');
    profileDropdown.classList.toggle('hidden', open);
    profileTrigger.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('click', () => {
    profileDropdown.classList.add('hidden');
    profileTrigger.setAttribute('aria-expanded', 'false');
  });

  // ---- Profile menu items ----
  document.getElementById('btn-profile-settings').addEventListener('click', () => {
    profileDropdown.classList.add('hidden');
    const user = getCurrentUser();
    if (user) {
      document.getElementById('profile-new-name').value = '';
      document.getElementById('profile-new-password').value = '';
      document.getElementById('name-change-error').classList.add('hidden');
    }
    openModal('modal-profile-settings');
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    profileDropdown.classList.add('hidden');
    logout();
    showToast('Du wurdest erfolgreich abgemeldet.', 'info');
  });

  // ---- Profile settings: save name ----
  document.getElementById('btn-save-name').addEventListener('click', () => {
    const newName = document.getElementById('profile-new-name').value;
    const result  = changeName(newName);
    const errEl   = document.getElementById('name-change-error');
    if (!result.ok) {
      errEl.textContent = result.msg;
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
      document.getElementById('profile-new-name').value = '';
      showToast('Dein Name wurde erfolgreich geändert.', 'success');
      updateOverviewStats();
    }
  });

  // ---- Profile settings: save password ----
  document.getElementById('btn-save-password').addEventListener('click', () => {
    const newPw  = document.getElementById('profile-new-password').value;
    const result = changePassword(newPw);
    if (!result.ok) {
      showToast(result.msg, 'error');
    } else {
      document.getElementById('profile-new-password').value = '';
      showToast('Passwort wurde erfolgreich geändert.', 'success');
    }
  });

  // ---- Profile settings: delete account ----
  document.getElementById('btn-delete-account').addEventListener('click', () => {
    closeModal('modal-profile-settings');
    openModal('modal-delete-confirm');
  });

  document.getElementById('btn-cancel-delete').addEventListener('click', () => {
    closeModal('modal-delete-confirm');
    openModal('modal-profile-settings');
  });

  document.getElementById('btn-confirm-delete').addEventListener('click', () => {
    closeAllModals();
    deleteAccount();
  });

  // ---- Friend request popup ----
  document.getElementById('btn-accept-friend').addEventListener('click', acceptFriendRequest);
  // The fake close button does nothing intentionally
  document.getElementById('btn-popup-close-fake').addEventListener('click', () => {
    // Intentionally non-functional
  });

  // ---- Friends search ----
  document.getElementById('btn-friends-search').addEventListener('click', () => {
    searchFriend(document.getElementById('friends-search-input').value);
  });
  document.getElementById('friends-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchFriend(e.target.value);
  });

  // ---- Quiz back-to-dashboard (results) ----
  document.getElementById('btn-results-back').addEventListener('click', () => {
    showDashboard();
    switchTab('quiz-area');
  });

  // ---- Quiz overview buttons ----
  document.getElementById('btn-overview-back').addEventListener('click', () => {
    if (typeof Quiz !== 'undefined') Quiz.backFromOverview();
  });
  document.getElementById('btn-overview-submit').addEventListener('click', () => {
    if (typeof Quiz !== 'undefined') Quiz.tryFinish();
  });

  // ---- Escape key closes modals ----
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });
}

/* ===================================================
   LOGIN / REGISTER HANDLERS
   =================================================== */
function handleLogin() {
  const identifier = document.getElementById('login-identifier').value;
  const password   = document.getElementById('login-password').value;
  const errEl      = document.getElementById('login-error');

  const result = login(identifier, password);
  if (!result.ok) {
    errEl.textContent = result.msg;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
    document.getElementById('login-identifier').value = '';
    document.getElementById('login-password').value = '';
    closeAllModals();
    showApp();
    showToast(`Willkommen zurück, ${result.user.name}!`, 'success');
  }
}

function handleRegister() {
  const name     = document.getElementById('register-name').value;
  const email    = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const errEl    = document.getElementById('register-error');

  const result = register(name, email, password);
  if (!result.ok) {
    errEl.textContent = result.msg;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
    document.getElementById('register-name').value = '';
    document.getElementById('register-email').value = '';
    document.getElementById('register-password').value = '';
    closeAllModals();
    showApp();
    showToast(`Willkommen bei Treffsicher, ${result.user.name}!`, 'success');
  }
}

/* ===================================================
   INIT
   =================================================== */
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initScrollReveal();

  const user = getCurrentUser();
  if (user) {
    showApp();
  } else {
    showLanding();
  }
});
