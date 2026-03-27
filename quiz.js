/**
 * Treffsicher — Quiz Module
 *
 * Handles: loading questions, rendering quiz UI, saving progress,
 * computing scores, displaying results with review tabs.
 *
 * Requires app.js to be loaded first (uses KEYS, storageGet, storageSet,
 * getCurrentUser, showToast, showDashboard, switchTab).
 *
 * NOTE: Fetch requires the site to be served over HTTP (e.g. VS Code Live
 * Server, python -m http.server, GitHub Pages). It will not work on file://
 */

const Quiz = (() => {

  /* -------------------------------------------------
     STATE
  -------------------------------------------------- */
  let questions       = [];   // flat array of all 100 questions
  let currentIndex    = 0;    // 0-based index of the currently shown question
  let questionsLoaded = false;

  /* -------------------------------------------------
     PUBLIC: EXPOSE GETTERS (used by app.js)
  -------------------------------------------------- */
  function getQuestions() { return questions; }

  /* -------------------------------------------------
     LOAD QUESTIONS FROM JSON
  -------------------------------------------------- */
  async function loadQuestions() {
    if (questionsLoaded) return true;

    try {
      const response = await fetch('questions.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Flatten category structure into a single array
      questions = [];
      data.categories.forEach(cat => {
        cat.questions.forEach(q => {
          questions.push({ ...q, category: cat.name });
        });
      });

      questionsLoaded = true;
      return true;
    } catch (err) {
      console.error('Failed to load questions.json:', err);
      showToast('Fragen konnten nicht geladen werden. Bitte nutze einen lokalen Webserver (z.B. VS Code Live Server).', 'error', 6000);
      return false;
    }
  }

  /* -------------------------------------------------
     LOAD RESULTS FROM JSON
  -------------------------------------------------- */
  async function loadResultText(score) {
    try {
      const response = await fetch('results.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const range = data.ranges.find(r => score >= r.min && score <= r.max);
      return range || { title: 'Ergebnis', text: '' };
    } catch (err) {
      console.error('Failed to load results.json:', err);
      return { title: 'Ergebnis', text: 'Ergebnistext konnte nicht geladen werden.' };
    }
  }

  /* -------------------------------------------------
     QUIZ STORAGE HELPERS
  -------------------------------------------------- */
  function getAnswers(userId)      { return storageGet(KEYS.QUIZ_ANSWERS(userId), {}); }
  function isLocked(userId)        { return storageGet(KEYS.QUIZ_LOCKED(userId), false); }

  function saveAnswer(userId, questionId, answerIndex) {
    const answers = getAnswers(userId);
    answers[questionId] = answerIndex;
    storageSet(KEYS.QUIZ_ANSWERS(userId), answers);
  }

  function savePosition(userId, index) {
    storageSet(KEYS.QUIZ_POSITION(userId), index);
  }

  function getSavedPosition(userId) {
    return storageGet(KEYS.QUIZ_POSITION(userId), 0);
  }

  /* -------------------------------------------------
     PUBLIC: START QUIZ
  -------------------------------------------------- */
  async function start() {
    const user = getCurrentUser();
    if (!user) return;

    showToast('Fragen werden geladen…', 'info', 2000);
    const ok = await loadQuestions();
    if (!ok || !questions.length) return;

    // If quiz already locked, jump to results
    if (isLocked(user.id)) {
      showResultsView();
      return;
    }

    // Resume from saved position (find last answered + 1, or first unanswered)
    const answers = getAnswers(user.id);
    let resumeIndex = getSavedPosition(user.id);

    // If no saved position, find first unanswered
    if (resumeIndex === 0 && Object.keys(answers).length === 0) {
      resumeIndex = 0;
    }

    currentIndex = Math.min(resumeIndex, questions.length - 1);

    renderQuizSession();
    renderQuestion(currentIndex);
  }

  /* -------------------------------------------------
     RENDER QUIZ SESSION (show the quiz view)
  -------------------------------------------------- */
  function renderQuizSession() {
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-quiz-session').classList.remove('hidden');
    document.getElementById('view-quiz-overview').classList.add('hidden');
    document.getElementById('view-results').classList.add('hidden');
  }

  /* -------------------------------------------------
     RENDER A SINGLE QUESTION
  -------------------------------------------------- */
  function renderQuestion(index) {
    currentIndex = Math.max(0, Math.min(index, questions.length - 1));

    const user = getCurrentUser();
    const q    = questions[currentIndex];
    const answers = getAnswers(user.id);

    // Progress
    const answeredCount = Object.keys(answers).length;
    const pct = ((currentIndex + 1) / questions.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = `${pct}%`;
    document.getElementById('quiz-progress-text').textContent = `${currentIndex + 1} / ${questions.length}`;

    // Category & number
    document.getElementById('quiz-category-label').textContent = q.category;
    document.getElementById('quiz-question-number').textContent = `Frage ${currentIndex + 1}`;
    document.getElementById('quiz-question-title').textContent  = q.title;

    // Answers
    const letters = 'ABCDEFGH';
    const answersList = document.getElementById('quiz-answers-list');
    const selectedAnswer = answers[q.id];

    answersList.innerHTML = q.answers.map((answer, i) => `
      <li class="quiz-answer-item${selectedAnswer === i ? ' selected' : ''}"
          data-index="${i}"
          role="button" tabindex="0"
          aria-pressed="${selectedAnswer === i}">
        <span class="answer-letter">${letters[i]}</span>
        <span class="answer-text">${answer}</span>
      </li>
    `).join('');

    // Click handlers for answers
    answersList.querySelectorAll('.quiz-answer-item').forEach(item => {
      item.addEventListener('click', () => selectAnswer(parseInt(item.dataset.index, 10)));
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') selectAnswer(parseInt(item.dataset.index, 10));
      });
    });

    // Navigation buttons
    const isFirst = currentIndex === 0;
    const isLast  = currentIndex === questions.length - 1;

    document.getElementById('btn-quiz-prev').disabled = isFirst;
    document.getElementById('btn-quiz-prev').style.opacity = isFirst ? '0.4' : '1';

    const nextBtn   = document.getElementById('btn-quiz-next');
    const finishBtn = document.getElementById('btn-quiz-finish');

    if (isLast) {
      nextBtn.classList.add('hidden');
      finishBtn.classList.remove('hidden');
    } else {
      nextBtn.classList.remove('hidden');
      finishBtn.classList.add('hidden');
    }

    // Save position
    savePosition(user.id, currentIndex);
  }

  /* -------------------------------------------------
     SELECT AN ANSWER
  -------------------------------------------------- */
  function selectAnswer(answerIndex) {
    const user = getCurrentUser();
    const q    = questions[currentIndex];
    saveAnswer(user.id, q.id, answerIndex);

    // Update visual state immediately
    document.querySelectorAll('.quiz-answer-item').forEach((item, i) => {
      const selected = i === answerIndex;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
  }

  /* -------------------------------------------------
     NAVIGATION
  -------------------------------------------------- */
  function goToPrev() {
    if (currentIndex > 0) renderQuestion(currentIndex - 1);
  }

  function goToNext() {
    if (currentIndex < questions.length - 1) renderQuestion(currentIndex + 1);
  }

  function showOverviewView() {
    const user    = getCurrentUser();
    const answers = getAnswers(user.id);

    document.getElementById('view-quiz-session').classList.add('hidden');
    document.getElementById('view-quiz-overview').classList.remove('hidden');

    const missingIds = questions
      .map(q => q.id)
      .filter(id => answers[id] === undefined);

    const subtitle = document.getElementById('quiz-overview-subtitle');
    subtitle.textContent = `${Object.keys(answers).length} von ${questions.length} Fragen beantwortet.`;

    const missingHint = document.getElementById('quiz-overview-missing-hint');
    const missingText = document.getElementById('quiz-overview-missing-text');
    if (missingIds.length > 0) {
      missingHint.classList.remove('hidden');
      missingText.textContent = `${missingIds.length} Frage${missingIds.length > 1 ? 'n fehlen' : ' fehlt'} noch (rot markiert). Klicke darauf, um sie zu beantworten.`;
    } else {
      missingHint.classList.add('hidden');
    }

    const grid = document.getElementById('quiz-overview-list');
    grid.innerHTML = questions.map((q, i) => {
      const answered = answers[q.id] !== undefined;
      const missing  = !answered;
      const cls      = answered ? 'answered' : 'missing';
      return `<button class="overview-q-btn ${cls}" data-qi="${i}" title="${q.title}">${i + 1}</button>`;
    }).join('');

    grid.querySelectorAll('.overview-q-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qi = parseInt(btn.dataset.qi, 10);
        document.getElementById('view-quiz-overview').classList.add('hidden');
        document.getElementById('view-quiz-session').classList.remove('hidden');
        renderQuestion(qi);
      });
    });
  }

  function backFromOverview() {
    document.getElementById('view-quiz-overview').classList.add('hidden');
    document.getElementById('view-quiz-session').classList.remove('hidden');
    renderQuestion(currentIndex);
  }

  /* -------------------------------------------------
     TRY FINISH (called from "Quiz abschließen" button)
  -------------------------------------------------- */
  function tryFinish() {
    const user    = getCurrentUser();
    const answers = getAnswers(user.id);
    const missing = questions.filter(q => answers[q.id] === undefined);

    if (missing.length > 0) {
      // Show overview with missing questions highlighted
      showOverviewView();
      return;
    }

    lockAndShowResults();
  }

  function lockAndShowResults() {
    const user = getCurrentUser();
    storageSet(KEYS.QUIZ_LOCKED(user.id), true);
    showResultsView();
  }

  /* -------------------------------------------------
     SHOW RESULTS VIEW
  -------------------------------------------------- */
  async function showResultsView() {
    const user    = getCurrentUser();
    if (!user) return;

    const ok = await loadQuestions();
    if (!ok) return;

    const answers = getAnswers(user.id);

    // Calculate score
    let score = 0;
    questions.forEach(q => {
      if (answers[q.id] !== undefined && answers[q.id] === q.my_answer) score++;
    });

    // Load result text
    const resultRange = await loadResultText(score);

    // Show results view
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-quiz-session').classList.add('hidden');
    document.getElementById('view-quiz-overview').classList.add('hidden');
    document.getElementById('view-results').classList.remove('hidden');

    // Animate score number
    animateNumber('result-score-number', 0, score, 900);
    document.getElementById('result-score-title').textContent = resultRange.title;
    document.getElementById('result-score-text').textContent  = resultRange.text;

    // Tally matches
    const same      = questions.filter(q => answers[q.id] !== undefined && answers[q.id] === q.my_answer);
    const different = questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== q.my_answer);

    document.getElementById('count-same').textContent      = same.length;
    document.getElementById('count-different').textContent = different.length;

    // Render first tab
    renderReviewTab('same', answers);

    // Tab switching
    document.getElementById('result-tab-same').addEventListener('click', () => {
      setActiveReviewTab('same');
      renderReviewTab('same', answers);
    });
    document.getElementById('result-tab-different').addEventListener('click', () => {
      setActiveReviewTab('different');
      renderReviewTab('different', answers);
    });
  }

  function setActiveReviewTab(tab) {
    document.getElementById('result-tab-same').classList.toggle('active', tab === 'same');
    document.getElementById('result-tab-different').classList.toggle('active', tab === 'different');
  }

  /* -------------------------------------------------
     RENDER REVIEW TAB
  -------------------------------------------------- */
  function renderReviewTab(tab, answers) {
    const isMatch = tab === 'same';
    const filtered = questions.filter(q => {
      const userAns = answers[q.id];
      if (userAns === undefined) return false;
      return isMatch ? (userAns === q.my_answer) : (userAns !== q.my_answer);
    });

    if (filtered.length === 0) {
      document.getElementById('result-review-content').innerHTML = `
        <div class="empty-state" style="margin-top:0">
          <div class="empty-icon">${isMatch ? '🎯' : '🔍'}</div>
          <p>${isMatch ? 'Keine übereinstimmenden Antworten gefunden.' : 'Keine unterschiedlichen Antworten – alles stimmt überein!'}</p>
        </div>`;
      return;
    }

    // Group by category
    const byCategory = {};
    filtered.forEach(q => {
      if (!byCategory[q.category]) byCategory[q.category] = [];
      byCategory[q.category].push(q);
    });

    const html = Object.entries(byCategory).map(([category, qs]) => `
      <div class="review-category-group">
        <div class="review-category-label">${category}</div>
        ${qs.map(q => {
          const userAnsIdx   = answers[q.id];
          const miguelAnsIdx = q.my_answer;
          const userName     = getCurrentUser()?.name || 'Du';
          return `
            <div class="review-item ${isMatch ? 'match' : 'no-match'}">
              <div class="review-question">${q.title}</div>
              <div class="review-answers">
                <div class="review-answer user-answer">
                  <span class="review-answer-dot"></span>
                  <span class="review-answer-who">${userName}:</span>
                  <span class="review-answer-text">${q.answers[userAnsIdx]}</span>
                </div>
                <div class="review-answer miguel-answer">
                  <span class="review-answer-dot"></span>
                  <span class="review-answer-who">Miguel_Baudet:</span>
                  <span class="review-answer-text">${q.answers[miguelAnsIdx]}</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `).join('');

    document.getElementById('result-review-content').innerHTML = html;
  }

  /* -------------------------------------------------
     SCORE ANIMATION
  -------------------------------------------------- */
  function animateNumber(elementId, from, to, duration) {
    const el    = document.getElementById(elementId);
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* -------------------------------------------------
     BIND NAV BUTTONS (called once after DOM is ready)
  -------------------------------------------------- */
  function bindNavButtons() {
    document.getElementById('btn-quiz-prev').addEventListener('click', goToPrev);
    document.getElementById('btn-quiz-next').addEventListener('click', goToNext);
    document.getElementById('btn-quiz-overview').addEventListener('click', showOverviewView);
    document.getElementById('btn-quiz-finish').addEventListener('click', tryFinish);
  }

  /* -------------------------------------------------
     INIT
  -------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', bindNavButtons);

  /* -------------------------------------------------
     PUBLIC API
  -------------------------------------------------- */
  return {
    start,
    showResultsView,
    tryFinish,
    backFromOverview,
    getQuestions,
  };

})();
