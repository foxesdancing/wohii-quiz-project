// --- Global Game State Management Variables ---
let activeQuizQuestions = [];
let activeQuestionIndex = 0;
let quizCorrectCount = 0; // Tracks in-memory session scores
// --- State ---
let isRegisterMode = false;

// --- Helpers ---
function getCurrentUserId() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.userId;
  } catch {
    return null;
  }
}

function getToken() {
  return localStorage.getItem(CONFIG.STORAGE_KEY);
}

function setToken(token) {
  localStorage.setItem(CONFIG.STORAGE_KEY, token);
}

function removeToken() {
  localStorage.removeItem(CONFIG.STORAGE_KEY);
}

async function apiFetch(route, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const headers = { ...options.headers };
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${CONFIG.API_URL}${route}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.msg || "Request failed");
  return data;
}

// --- Auth ---
function showAuth() {
  document.getElementById("auth-section").style.display = "block";
  document.getElementById("app-section").style.display = "none";
  document.getElementById("logout-btn").style.display = "none";
  renderAuthForm();
}

function renderAuthForm() {
  const fields = isRegisterMode ? CONFIG.FIELDS.REGISTER : CONFIG.FIELDS.LOGIN;
  const title = isRegisterMode ? "Sign Up" : "Log In";
  const switchText = isRegisterMode
    ? 'Already have an account? <a href="#" id="switch-mode">Log in</a>'
    : 'Don\'t have an account? <a href="#" id="switch-mode">Sign up</a>';

  const formHTML = `
    <h2>${title}</h2>
    <form id="auth-form">
      ${fields
        .map((f) => {
          const type =
            f === "password" ? "password" : f === "email" ? "email" : "text";
          const label = f.charAt(0).toUpperCase() + f.slice(1);
          return `
          <div class="form-group">
            <label for="${f}">${label}</label>
            <input type="${type}" id="${f}" name="${f}" required />
          </div>`;
        })
        .join("")}
      <button type="submit">${title}</button>
    </form>
    <p class="switch-text">${switchText}</p>
    <p id="auth-error" class="error"></p>
  `;

  document.getElementById("auth-section").innerHTML = formHTML;
  document.getElementById("auth-form").addEventListener("submit", handleAuth);
  document.getElementById("switch-mode").addEventListener("click", (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    renderAuthForm();
  });
}

async function handleAuth(e) {
  e.preventDefault();
  const errorEl = document.getElementById("auth-error");
  errorEl.textContent = "";

  const fields = isRegisterMode ? CONFIG.FIELDS.REGISTER : CONFIG.FIELDS.LOGIN;
  const route = isRegisterMode ? CONFIG.ROUTES.REGISTER : CONFIG.ROUTES.LOGIN;

  const body = {};
  fields.forEach((f) => {
    body[f] = document.getElementById(f).value;
  });

  try {
    const data = await apiFetch(route, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setToken(data.token);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// --- App ---
async function showApp() {
  document.getElementById("auth-section").style.display = "none";
  document.getElementById("app-section").style.display = "block";
  document.getElementById("logout-btn").style.display = "inline-block";
  await loadQuestions();
}

async function loadQuestions(keyword = "", difficulty = "", page = 1) {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading questions...</p>';

  try {
    const params = new URLSearchParams({
      page,
      limit: CONFIG.QUESTIONS_PER_PAGE,
    });
    if (keyword) params.set("keyword", keyword);
    if (difficulty) params.set("difficulty", difficulty);
    const result = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}?${params}`);
    const { data: questions, total, totalPages } = result;
    const currentUserId = getCurrentUserId();

    const solvedCount = questions.filter(
      (q) => q[CONFIG.API_FIELDS.SOLVED],
    ).length;

    let html = `
      <div class="score-bar">
        <div class="score-item">
          <div class="score-value">${total}</div>
          <div class="score-label">Questions</div>
        </div>
        <div class="score-item">
          <div class="score-value">${solvedCount}/${questions.length}</div>
          <div class="score-label">Solved (this page)</div>
        </div>
      </div>
      <div class="toolbar" style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; flex-wrap: wrap;">
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary" id="new-question-btn" style="margin-bottom:0;">+ New Question</button>
          <button class="btn-quiz-launch" id="launch-quiz-btn" style="margin-bottom:0; background: #3b82f6; color: white; padding: 10px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">⚡ Start Quiz Session</button>
        </div>
        
        <div class="search-bar" style="display: flex; gap: 0.5rem; align-items: center;">
          <select id="difficulty-filter" style="padding: 0.55rem 1rem; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; font-size: 0.85rem; font-family: inherit; color: #fff; cursor: pointer;">
            <option value="" ${difficulty === "" ? "selected" : ""} style="background: #24243e; color: #fff;">All Tiers</option>
            <option value="EASY" ${difficulty === "EASY" ? "selected" : ""} style="background: #24243e; color: #51cf66;">Easy</option>
            <option value="MEDIUM" ${difficulty === "MEDIUM" ? "selected" : ""} style="background: #24243e; color: #ffd200;">Medium</option>
            <option value="HARD" ${difficulty === "HARD" ? "selected" : ""} style="background: #24243e; color: #ff6b6b;">Hard</option>
          </select>

          <input type="text" id="keyword-input" placeholder="Search by keyword..." value="${keyword}" />
          <button class="btn btn-search" id="search-btn">Search</button>
          ${keyword || difficulty ? `<button class="btn btn-clear" id="clear-btn">Clear</button>` : ""}
        </div>
      </div>`;

    if (questions.length === 0) {
      html +=
        '<p class="empty-state">No questions found. Create one to get started!</p>';
    } else {
      html += questions
        .map(
          (q) => `
        <article class="question-card ${q[CONFIG.API_FIELDS.SOLVED] ? "solved-card" : ""}">
          <h3>
            <a href="#" class="question-link" data-id="${q.id}">${q.question}</a>
            ${q[CONFIG.API_FIELDS.SOLVED] ? `<span class="badge-solved">Solved</span>` : ""}
          </h3>
          ${
            q.keywords && q.keywords.length
              ? `<div class="question-keywords">${q.keywords.map((k) => `<span class="keyword">${k}</span>`).join("")}</div>`
              : ""
          }
          <div class="question-actions">
            <span>
              <button class="btn btn-play" data-id="${q.id}">Play</button>
              <a href="#" class="read-more" data-id="${q.id}">See answer</a>
            </span>
            ${
              q.userId === currentUserId
                ? `<span class="owner-actions">
                    <button class="btn btn-edit" data-id="${q.id}">Edit</button>
                    <button class="btn btn-delete" data-id="${q.id}">Delete</button>
                  </span>`
                : ""
            }
          </div>
        </article>`,
        )
        .join("");
    }

    if (totalPages > 1) {
      html += `
        <div class="pagination">
          <button class="btn btn-page" id="prev-btn" ${page <= 1 ? "disabled" : ""}>Previous</button>
          <span class="page-info">Page ${page} of ${totalPages}</span>
          <button class="btn btn-page" id="next-btn" ${page >= totalPages ? "disabled" : ""}>Next</button>
        </div>`;
    }

    container.innerHTML = html;

    // --- Core Navigation Actions ---
    document
      .getElementById("new-question-btn")
      .addEventListener("click", () => showQuestionForm());
    document
      .getElementById("launch-quiz-btn")
      .addEventListener("click", () => showQuizLauncherForm());

    // Trigger search when difficulty option is changed
    document
      .getElementById("difficulty-filter")
      .addEventListener("change", (e) => {
        const currentKeyword = document
          .getElementById("keyword-input")
          .value.trim();
        loadQuestions(currentKeyword, e.target.value, 1);
      });

    document.getElementById("search-btn").addEventListener("click", () => {
      const currentDiff = document.getElementById("difficulty-filter").value;
      loadQuestions(
        document.getElementById("keyword-input").value.trim(),
        currentDiff,
        1,
      );
    });

    document
      .getElementById("keyword-input")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const currentDiff =
            document.getElementById("difficulty-filter").value;
          loadQuestions(e.target.value.trim(), currentDiff, 1);
        }
      });

    const clearBtn = document.getElementById("clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => loadQuestions("", "", 1));
    }

    const prevBtn = document.getElementById("prev-btn");
    if (prevBtn)
      prevBtn.addEventListener("click", () =>
        loadQuestions(keyword, difficulty, page - 1),
      );

    const nextBtn = document.getElementById("next-btn");
    if (nextBtn)
      nextBtn.addEventListener("click", () =>
        loadQuestions(keyword, difficulty, page + 1),
      );

    container.querySelectorAll(".question-link, .read-more").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        loadQuestionDetail(el.dataset.id);
      });
    });

    container.querySelectorAll(".btn-edit").forEach((el) => {
      el.addEventListener("click", () => showQuestionForm(el.dataset.id));
    });

    container.querySelectorAll(".btn-delete").forEach((el) => {
      el.addEventListener("click", () => deleteQuestion(el.dataset.id));
    });

    container.querySelectorAll(".btn-play").forEach((el) => {
      el.addEventListener("click", () => playQuestion(el.dataset.id));
    });
  } catch (err) {
    if (
      err.message === "No token provided" ||
      err.message === "Invalid or expired token"
    ) {
      removeToken();
      showAuth();
      return;
    }
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function loadQuestionDetail(qId) {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const q = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`);
    const currentUserId = getCurrentUserId();
    const isOwner = q.userId === currentUserId;

    container.innerHTML = `
      <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
      <article class="question-card question-detail">
        <h3>${q.question} ${q[CONFIG.API_FIELDS.SOLVED] ? `<span class="badge-solved">Solved</span>` : ""}</h3>
        <p class="question-meta">by ${q.userName || "Unknown"}</p>
        ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" alt="">` : ""}
        <p class="question-answer">${q.answer}</p>
        ${
          q.keywords && q.keywords.length
            ? `<div class="question-keywords">${q.keywords.map((k) => `<span class="keyword">${k}</span>`).join("")}</div>`
            : ""
        }
        ${
          isOwner
            ? `<div class="question-actions detail-actions">
                <button class="btn btn-edit" id="detail-edit-btn">Edit</button>
                <button class="btn btn-delete" id="detail-delete-btn">Delete</button>
              </div>`
            : ""
        }
      </article>`;

    document.getElementById("back-btn").addEventListener("click", (e) => {
      e.preventDefault();
      loadQuestions();
    });

    if (isOwner) {
      document
        .getElementById("detail-edit-btn")
        .addEventListener("click", () => showQuestionForm(qId));
      document
        .getElementById("detail-delete-btn")
        .addEventListener("click", () => deleteQuestion(qId));
    }
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// --- Create / Edit ---
async function showQuestionForm(qId) {
  const container = document.getElementById("questions-container");
  const isEdit = !!qId;
  let q = { question: "", answer: "", keywords: [] };

  if (isEdit) {
    try {
      q = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`);
    } catch (err) {
      container.innerHTML = `<p class="error">${err.message}</p>`;
      return;
    }
  }

  const tabNavigationHTML = isEdit
    ? ""
    : `
    <div class="tab-headers" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem;">
      <button id="tab-btn-manual" class="btn btn-edit" style="background: rgba(167, 139, 250, 0.35); border-radius: 8px 8px 0 0;">✍️ Manual Form</button>
      <button id="tab-btn-ai" class="btn btn-clear" style="border-radius: 8px 8px 0 0;">✨ AI Generator</button>
    </div>
  `;

  container.innerHTML = `
    <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
    <div class="question-form-wrapper">
      <h2>${isEdit ? "Edit Question" : "New Question"}</h2>
      
      ${tabNavigationHTML}

      <div id="manual-form-panel">
        <form id="question-form" enctype="multipart/form-data">
          <div class="form-group">
            <label for="q-question">Question</label>
            <input type="text" id="q-question" value="${q.question}" required />
          </div>
          <div class="form-group">
            <label for="q-answer">Answer</label>
            <textarea id="q-answer" rows="4" required>${q.answer}</textarea>
          </div>
          <div class="form-group">
            <label for="q-keywords">Keywords (comma-separated)</label>
            <input type="text" id="q-keywords" value="${q.keywords ? q.keywords.join(", ") : ""}" />
          </div>
          <div class="form-group">
            <label for="q-image">Image ${isEdit ? "(leave blank to keep current)" : "(optional)"}</label>
            <input type="file" id="q-image" accept="image/*" />
            ${isEdit && q.imageUrl ? `<img src="${q.imageUrl}" alt="" style="max-width:200px;margin-top:0.5rem;border-radius:4px" />` : ""}
          </div>
          <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Create Question"}</button>
        </form>
        <p id="question-form-error" class="error"></p>
      </div>

      ${
        isEdit
          ? ""
          : `
      <div id="ai-form-panel" style="display: none;">
        <form id="ai-question-form">
          <div class="form-group">
            <label for="ai-topic">Topic / Concept</label>
            <input type="text" id="ai-topic" placeholder="e.g., JavaScript Scope, HTML semantic tags, SQL Joins..." required />
          </div>
          <div class="form-group">
            <label for="ai-difficulty">Difficulty Rating</label>
            <select id="ai-difficulty" style="width: 100%; padding: 0.7rem 1rem; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; font-size: 1rem; font-family: inherit; color: #fff;">
              <option value="EASY" style="background: #24243e; color: #fff;">Easy Challenge</option>
              <option value="MEDIUM" selected style="background: #24243e; color: #fff;">Medium Challenge</option>
              <option value="HARD" style="background: #24243e; color: #fff;">Hard Challenge</option>
            </select>
          </div>
          <button type="submit" id="ai-submit-btn" class="btn btn-play" style="margin-top: 0.5rem; width: 100%; padding: 0.8rem;">✨ Ask Gemini to Generate</button>
        </form>
        <p id="ai-form-error" class="error"></p>
      </div>
      `
      }
    </div>`;

  document.getElementById("back-btn").addEventListener("click", (e) => {
    e.preventDefault();
    loadQuestions();
  });

  if (!isEdit) {
    const tabBtnManual = document.getElementById("tab-btn-manual");
    const tabBtnAi = document.getElementById("tab-btn-ai");
    const panelManual = document.getElementById("manual-form-panel");
    const panelAi = document.getElementById("ai-form-panel");

    tabBtnManual.addEventListener("click", () => {
      panelManual.style.display = "block";
      panelAi.style.display = "none";
      tabBtnManual.className = "btn btn-edit";
      tabBtnAi.className = "btn btn-clear";
    });

    tabBtnAi.addEventListener("click", () => {
      panelManual.style.display = "none";
      panelAi.style.display = "block";
      tabBtnManual.className = "btn btn-clear";
      tabBtnAi.className = "btn btn-edit";
    });

    document
      .getElementById("ai-question-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById("ai-form-error");
        const submitBtn = document.getElementById("ai-submit-btn");
        errorEl.textContent = "";

        const topic = document.getElementById("ai-topic").value.trim();
        const difficulty = document.getElementById("ai-difficulty").value;

        submitBtn.disabled = true;
        submitBtn.textContent = "🪄 Magic is happening...";
        submitBtn.style.opacity = "0.6";

        try {
          await apiFetch(CONFIG.ROUTES.AI_GENERATE, {
            method: "POST",
            body: JSON.stringify({ topic, difficulty }),
          });
          loadQuestions();
        } catch (err) {
          errorEl.textContent = err.message;
          submitBtn.disabled = false;
          submitBtn.textContent = "✨ Ask Gemini to Generate";
          submitBtn.style.opacity = "1";
        }
      });
  }

  document
    .getElementById("question-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("question-form-error");
      errorEl.textContent = "";

      const body = new FormData();
      body.append("question", document.getElementById("q-question").value);
      body.append("answer", document.getElementById("q-answer").value);
      body.append("keywords", document.getElementById("q-keywords").value);
      const imageFile = document.getElementById("q-image").files[0];
      if (imageFile) body.append("image", imageFile);

      try {
        if (isEdit) {
          await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`, {
            method: "PUT",
            body,
          });
        } else {
          await apiFetch(CONFIG.ROUTES.QUESTIONS, { method: "POST", body });
        }
        loadQuestions();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
}

// --- Play (Single Sandbox Mode) ---
async function playQuestion(qId) {
  const container = document.getElementById("questions-container");
  container.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const q = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`);

    container.innerHTML = `
      <a href="#" id="back-btn" class="back-link">&larr; Back to questions</a>
      <div class="question-form-wrapper" style="text-align:center">
        <div class="play-question-text">${q.question}</div>
        ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" alt="" style="margin:0 auto 1rem">` : ""}
        ${
          q.keywords && q.keywords.length
            ? `<div class="question-keywords" style="justify-content:center;margin-bottom:1.5rem">${q.keywords.map((k) => `<span class="keyword">${k}</span>`).join("")}</div>`
            : ""
        }
        <form id="play-form" style="text-align:left">
          <div class="form-group">
            <label for="play-answer">Your answer</label>
            <textarea id="play-answer" rows="3" required></textarea>
          </div>
          <div style="text-align:center">
            <button type="submit" class="btn btn-play" style="padding:0.7rem 2.5rem;font-size:1rem">Submit</button>
          </div>
        </form>
        <div id="play-result"></div>
        <p id="play-error" class="error"></p>
      </div>`;

    document.getElementById("back-btn").addEventListener("click", (e) => {
      e.preventDefault();
      loadQuestions();
    });

    document
      .getElementById("play-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById("play-error");
        const resultEl = document.getElementById("play-result");
        errorEl.textContent = "";
        resultEl.innerHTML = "";

        const answer = document.getElementById("play-answer").value;

        try {
          const result = await apiFetch(
            `${CONFIG.ROUTES.QUESTIONS}/${qId}/attempt`,
            {
              method: "POST",
              body: JSON.stringify({ answer }),
            },
          );

          let html = "";
          if (result.correct) {
            html += `<div class="play-result correct">Correct!</div>`;
          } else {
            html += `<div class="play-result incorrect">Incorrect! The answer was: <strong>${result.correctAnswer}</strong></div>`;
          }

          if (result.badgeEarned) {
            html += `<div class="play-result badge">🏆 Badge earned: <strong>${result.badgeEarned}</strong></div>`;
          }

          resultEl.innerHTML = html;
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
  } catch (err) {
    container.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// --- Session-Based Quiz Launcher & Gameplay Engine ---
function showQuizLauncherForm() {
  const container = document.getElementById("questions-container");
  container.innerHTML = `
    <a href="#" id="back-btn" class="back-link">&larr; Back to Dashboard</a>
    <div class="question-form-wrapper">
      <h2>⚡ Setup Custom Session Quiz</h2>
      <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Assemble active card challenges into an immediate consecutive session stack.
      </p>
      <form id="quiz-launcher-form">
        <div class="form-group">
          <label for="quiz-topic">Keyword/Filter Topic (Optional)</label>
          <input type="text" id="quiz-topic" placeholder="e.g. JavaScript, CSS, HTML (Leave empty for all)" />
        </div>
        <div class="form-group">
          <label for="quiz-difficulty">Difficulty Focus</label>
          <select id="quiz-difficulty" style="width: 100%; padding: 0.7rem 1rem; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; font-size: 1rem; font-family: inherit; color: #fff;">
            <option value="" style="background: #24243e; color: #fff;">Any Difficulty Tier</option>
            <option value="EASY" style="background: #24243e; color: #51cf66;">Easy</option>
            <option value="MEDIUM" style="background: #24243e; color: #ffd200;">Medium</option>
            <option value="HARD" style="background: #24243e; color: #ff6b6b;">Hard</option>
          </select>
        </div>
        <button type="submit" class="btn btn-play" style="width: 100%; padding: 0.8rem; background:#3b82f6;">🚀 Generate Session Run</button>
      </form>
      <p id="quiz-launch-error" class="error"></p>
    </div>
  `;

  document.getElementById("back-btn").addEventListener("click", (e) => {
    e.preventDefault();
    loadQuestions();
  });

  document
    .getElementById("quiz-launcher-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("quiz-launch-error");
      errorEl.textContent = "";

      const keyword = document.getElementById("quiz-topic").value.trim();
      const difficulty = document.getElementById("quiz-difficulty").value;

      try {
        const params = new URLSearchParams({ page: 1, limit: 30 }); // Gathers up to 30 matching cards to build a pool
        if (keyword) params.set("keyword", keyword);
        if (difficulty) params.set("difficulty", difficulty);

        const result = await apiFetch(`${CONFIG.ROUTES.QUESTIONS}?${params}`);
        let questionsPool = result.data || [];

        if (questionsPool.length === 0) {
          throw new Error(
            "No available questions found matching your preferred configurations.",
          );
        }

        // Shuffle items randomly inside the local state array wrapper and slice a 5-question layout deck
        questionsPool.sort(() => 0.5 - Math.random());
        const selectedDeck = questionsPool.slice(0, 5);

        startQuizSession(selectedDeck);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
}

function startQuizSession(questionsArray) {
  activeQuizQuestions = questionsArray;
  activeQuestionIndex = 0;
  quizCorrectCount = 0;
  playCurrentQuizQuestion();
}

async function playCurrentQuizQuestion() {
  const container = document.getElementById("questions-container");

  // Game End Boundary Evaluation Check
  if (activeQuestionIndex >= activeQuizQuestions.length) {
    const finalPercent = Math.round(
      (quizCorrectCount / activeQuizQuestions.length) * 100,
    );
    container.innerHTML = `
      <div class="question-form-wrapper" style="text-align:center; padding: 2.5rem 1.5rem;">
        <h2 style="font-size: 2rem; margin-bottom: 0.5rem;">🎉 Quiz Completed!</h2>
        <div style="font-size: 4rem; font-weight: bold; color: #a78bfa; margin: 1.5rem 0;">
          ${quizCorrectCount} / ${activeQuizQuestions.length}
        </div>
        <p style="color: rgba(255,255,255,0.7); margin-bottom: 2rem;">Success Ratio: <strong>${finalPercent}%</strong></p>
        <button class="btn btn-primary" id="quiz-exit-btn" style="padding: 0.8rem 2rem;">Return to Dashboard</button>
      </div>
    `;
    document
      .getElementById("quiz-exit-btn")
      .addEventListener("click", () => loadQuestions());
    return;
  }

  const q = activeQuizQuestions[activeQuestionIndex];

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span style="font-weight:600; font-size:0.9rem; color: #a78bfa;">⚡ ACTIVE QUIZ RUN</span>
      <span style="background: rgba(255,255,255,0.1); padding: 0.25rem 0.7rem; border-radius: 20px; font-size: 0.8rem;">
        Question ${activeQuestionIndex + 1} of ${activeQuizQuestions.length}
      </span>
    </div>
    <div class="question-form-wrapper" style="text-align:center">
      <div class="play-question-text" style="font-size: 1.3rem; font-weight: 500; margin-bottom: 1.5rem;">${q.question}</div>
      ${q.imageUrl ? `<img class="question-image" src="${q.imageUrl}" alt="" style="margin:0 auto 1rem; max-height:200px; border-radius:8px;">` : ""}
      
      <form id="quiz-play-form" style="text-align:left">
        <div class="form-group">
          <label for="quiz-play-answer" style="color: rgba(255,255,255,0.5);">Your Answer Selection</label>
          <textarea id="quiz-play-answer" rows="3" required placeholder="Type your response verification details here..."></textarea>
        </div>
        <div style="text-align:center" id="quiz-action-area">
          <button type="submit" class="btn btn-play" style="padding:0.7rem 2.5rem; font-size:1rem; width:100%;">Submit Verification</button>
        </div>
      </form>
      <div id="quiz-play-result" style="margin-top: 1.5rem;"></div>
      <p id="quiz-play-error" class="error"></p>
    </div>
  `;

  document
    .getElementById("quiz-play-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("quiz-play-error");
      const resultEl = document.getElementById("quiz-play-result");
      const actionArea = document.getElementById("quiz-action-area");

      errorEl.textContent = "";
      const answer = document.getElementById("quiz-play-answer").value.trim();

      try {
        // Dispatches verification analysis downstream to your existing API logic
        const result = await apiFetch(
          `${CONFIG.ROUTES.QUESTIONS}/${q.id}/attempt`,
          {
            method: "POST",
            body: JSON.stringify({ answer }),
          },
        );

        let html = "";
        if (result.correct) {
          quizCorrectCount++;
          html += `<div class="play-result correct" style="padding: 1rem; border-radius: 8px; font-weight:600; margin-bottom:1rem;">🎉 Correct Response!</div>`;
        } else {
          html += `
          <div class="play-result incorrect" style="padding: 1rem; border-radius: 8px; text-align: left; margin-bottom:1rem;">
            ❌ Incorrect Analysis.<br>
            <span style="font-size:0.85rem; opacity:0.8;">The accepted validation standard:</span><br>
            <strong style="color:#fff;">${result.correctAnswer}</strong>
          </div>`;
        }

        resultEl.innerHTML = html;

        // Swap out the submission area with a "Next Step" routing button block
        const standardButtonLabel =
          activeQuestionIndex + 1 === activeQuizQuestions.length
            ? "Finish Quiz Run &rarr;"
            : "Proceed to Next Question &rarr;";
        actionArea.innerHTML = `<button type="button" id="quiz-next-btn" class="btn btn-primary" style="width:100%; padding: 0.8rem;">${standardButtonLabel}</button>`;

        document
          .getElementById("quiz-next-btn")
          .addEventListener("click", () => {
            activeQuestionIndex++;
            playCurrentQuizQuestion();
          });
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
}

// --- Delete ---
async function deleteQuestion(qId) {
  if (!confirm("Are you sure you want to delete this question?")) return;

  try {
    await apiFetch(`${CONFIG.ROUTES.QUESTIONS}/${qId}`, { method: "DELETE" });
    loadQuestions();
  } catch (err) {
    alert(err.message);
  }
}

function handleLogout() {
  removeToken();
  showAuth();
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  if (getToken()) {
    showApp();
  } else {
    showAuth();
  }
});
