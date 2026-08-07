const STORAGE_KEY = "duopilot.tasks.v1";

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const defaultTasks = [
  {
    id: crypto.randomUUID(),
    title: "Révision de la Mercedes",
    owner: "Armand",
    category: "Véhicule",
    dueDate: addDays(12),
    priority: "important",
    alerts: [14, 7],
    notes: "Demander un devis et vérifier le carnet d’entretien.",
    done: false
  },
  {
    id: crypto.randomUUID(),
    title: "Contrôle de la VMC",
    owner: "Commun",
    category: "Maison",
    dueDate: addDays(25),
    priority: "normal",
    alerts: [14, 7],
    notes: "Maison de La Frette-sur-Seine.",
    done: false
  },
  {
    id: crypto.randomUUID(),
    title: "Échéance professionnelle",
    owner: "Christelle",
    category: "Professionnel",
    dueDate: addDays(5),
    priority: "urgent",
    alerts: [14, 7, 1],
    notes: "Préparer les justificatifs.",
    done: false
  }
];

let tasks = loadTasks();
let activeOwner = "all";
let activeSmartFilter = null;
let calendarCursor = new Date();
let deferredInstallPrompt = null;

const q = (selector) => document.querySelector(selector);
const qa = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  taskList: q("#taskList"),
  empty: q("#empty"),
  modal: q("#modal"),
  form: q("#taskForm"),
  categoryFilter: q("#categoryFilter"),
  statusFilter: q("#statusFilter"),
  titleView: q("#titleView"),
  viewEyebrow: q("#viewEyebrow"),
  dateNow: q("#dateNow"),
  sidebar: q("#sidebar"),
  sidebarBackdrop: q("#sidebarBackdrop"),
  calendarTitle: q("#calendarTitle"),
  calendarGrid: q("#calendarGrid")
};

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : defaultTasks;
  } catch {
    return defaultTasks;
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function startOfToday() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

function daysUntil(value) {
  return Math.ceil((parseDate(value) - startOfToday()) / 86400000);
}

function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options
  }).format(parseDate(value));
}

function escapeHtml(text = "") {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

function alertText(days) {
  if (days === 14) return "2 sem.";
  if (days === 7) return "1 sem.";
  if (days === 1) return "veille";
  if (days === 0) return "jour J";
  return `${days} j`;
}

function priorityLabel(priority) {
  return priority === "urgent" ? "Urgente" :
    priority === "important" ? "Importante" : "Normale";
}

function timingText(task) {
  const delta = daysUntil(task.dueDate);
  if (task.done) return "Terminée";
  if (delta < 0) return `${Math.abs(delta)} j de retard`;
  if (delta === 0) return "Aujourd’hui";
  if (delta === 1) return "Demain";
  return `Dans ${delta} jours`;
}

function baseFilteredTasks() {
  const category = elements.categoryFilter.value;
  const status = elements.statusFilter.value;

  return tasks
    .filter((task) => activeOwner === "all" || task.owner === activeOwner)
    .filter((task) => category === "all" || task.category === category)
    .filter((task) => {
      const delta = daysUntil(task.dueDate);
      if (activeSmartFilter === "today") return !task.done && delta === 0;
      if (activeSmartFilter === "week") return !task.done && delta >= 0 && delta <= 7;
      if (activeSmartFilter === "overdue") return !task.done && delta < 0;
      if (activeSmartFilter === "done") return task.done;
      if (status === "done") return task.done;
      if (status === "todo") return !task.done;
      if (status === "overdue") return !task.done && delta < 0;
      return true;
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || parseDate(a.dueDate) - parseDate(b.dueDate));
}

function renderTasks() {
  const filtered = baseFilteredTasks();
  elements.taskList.innerHTML = "";
  elements.empty.classList.toggle("hidden", filtered.length > 0);
  elements.taskList.classList.toggle("hidden", filtered.length === 0);

  filtered.forEach((task) => {
    const delta = daysUntil(task.dueDate);
    const overdue = !task.done && delta < 0;
    const article = document.createElement("article");
    article.className = `task-item${task.done ? " done" : ""}${overdue ? " overdue" : ""}`;

    article.innerHTML = `
      <button class="complete-button" type="button" aria-label="${task.done ? "Rouvrir" : "Terminer"}"></button>
      <div class="task-content">
        <div class="task-main-row">
          <i class="priority-dot ${task.priority}" title="${priorityLabel(task.priority)}"></i>
          <h3 class="task-title">${escapeHtml(task.title)}</h3>
        </div>
        <div class="task-meta">
          <span class="owner-chip">${escapeHtml(task.owner)}</span>
          <span class="category-chip">${escapeHtml(task.category)}</span>
          <span class="alert-chip">Alertes : ${task.alerts?.length ? task.alerts.map(alertText).join(", ") : "aucune"}</span>
        </div>
        ${task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ""}
      </div>
      <div class="task-time${overdue ? " overdue-text" : ""}">
        <strong>${formatDate(task.dueDate)}</strong>
        <span>${timingText(task)}</span>
      </div>
      <button class="delete-button" type="button">Supprimer</button>
    `;

    article.querySelector(".complete-button").addEventListener("click", () => {
      task.done = !task.done;
      saveTasks();
      renderAll();
    });

    article.querySelector(".delete-button").addEventListener("click", () => {
      if (confirm(`Supprimer « ${task.title} » ?`)) {
        tasks = tasks.filter((item) => item.id !== task.id);
        saveTasks();
        renderAll();
      }
    });

    elements.taskList.appendChild(article);
  });
}

function visibleOwnerTasks(owner) {
  return tasks.filter((task) => (owner === "all" || task.owner === owner) && !task.done);
}

function updateCounters() {
  const current = visibleOwnerTasks(activeOwner);
  q("#upcoming").textContent = current.filter((task) => daysUntil(task.dueDate) >= 0).length;
  q("#week").textContent = current.filter((task) => {
    const days = daysUntil(task.dueDate);
    return days >= 0 && days <= 7;
  }).length;
  q("#late").textContent = current.filter((task) => daysUntil(task.dueDate) < 0).length;

  q("#globalBadge").textContent = visibleOwnerTasks("all").length;
  q("#christelleBadge").textContent = visibleOwnerTasks("Christelle").length;
  q("#armandBadge").textContent = visibleOwnerTasks("Armand").length;
  q("#communBadge").textContent = visibleOwnerTasks("Commun").length;
  q("#todayBadge").textContent = tasks.filter((task) => !task.done && daysUntil(task.dueDate) === 0).length;
  q("#weekBadgeSide").textContent = tasks.filter((task) => {
    const days = daysUntil(task.dueDate);
    return !task.done && days >= 0 && days <= 7;
  }).length;
  q("#lateBadgeSide").textContent = tasks.filter((task) => !task.done && daysUntil(task.dueDate) < 0).length;
  q("#doneBadgeSide").textContent = tasks.filter((task) => task.done).length;
}

function updateHeading() {
  if (activeSmartFilter) {
    const labels = {
      today: ["Aujourd’hui", "Échéances du jour"],
      week: ["Planification", "7 prochains jours"],
      overdue: ["À traiter", "Échéances en retard"],
      done: ["Historique", "Tâches terminées"]
    };
    elements.viewEyebrow.textContent = labels[activeSmartFilter][0];
    elements.titleView.textContent = labels[activeSmartFilter][1];
    return;
  }

  elements.viewEyebrow.textContent = activeOwner === "all" ? "Tableau de bord" : "Espace personnel";
  elements.titleView.textContent =
    activeOwner === "all" ? "Toutes les échéances" :
    activeOwner === "Commun" ? "Échéances communes" :
    `Échéances de ${activeOwner}`;
}

function updateFocusCard() {
  const upcoming = tasks
    .filter((task) => !task.done)
    .sort((a, b) => {
      const aOverdue = daysUntil(a.dueDate) < 0;
      const bOverdue = daysUntil(b.dueDate) < 0;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (a.priority !== b.priority) {
        const rank = { urgent: 0, important: 1, normal: 2 };
        return rank[a.priority] - rank[b.priority];
      }
      return parseDate(a.dueDate) - parseDate(b.dueDate);
    })[0];

  if (!upcoming) {
    q("#focusTitle").textContent = "Aucune échéance";
    q("#focusOwner").textContent = "—";
    q("#focusDate").textContent = "Ajoutez une échéance pour commencer.";
    q("#focusNotes").textContent = "";
    q("#focusProgress span").style.width = "0%";
    return;
  }

  const delta = daysUntil(upcoming.dueDate);
  const progress = delta <= 0 ? 100 : Math.max(8, Math.min(92, 100 - (delta / 30) * 100));
  q("#focusTitle").textContent = upcoming.title;
  q("#focusOwner").textContent = upcoming.owner;
  q("#focusDate").textContent = `${formatDate(upcoming.dueDate, { weekday: "long" })} · ${timingText(upcoming)}`;
  q("#focusNotes").textContent = upcoming.notes || `${upcoming.category} · priorité ${priorityLabel(upcoming.priority).toLowerCase()}`;
  q("#focusProgress span").style.width = `${progress}%`;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const monthStart = new Date(year, month, 1, 12);
  const firstDay = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstDay, 12);
  const todayKey = new Date().toISOString().slice(0, 10);
  const taskDates = new Set(tasks.filter((task) => !task.done).map((task) => task.dueDate));

  elements.calendarTitle.textContent = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric"
  }).format(monthStart);

  elements.calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = date.getDate();
    if (date.getMonth() !== month) button.classList.add("muted");
    if (key === todayKey) button.classList.add("today");
    if (taskDates.has(key)) button.classList.add("has-task");
    elements.calendarGrid.appendChild(button);
  }
}

function renderAll() {
  renderTasks();
  updateCounters();
  updateHeading();
  updateFocusCard();
  renderCalendar();
}

function clearSmartSelection() {
  activeSmartFilter = null;
  qa(".smart-filter").forEach((button) => button.classList.remove("active"));
}

function openModal() {
  elements.form.reset();
  elements.form.owner.value = activeOwner === "all" ? "Armand" : activeOwner;
  elements.form.dueDate.value = addDays(7);
  qa('input[name="alerts"]').forEach((input) => {
    input.checked = ["14", "7"].includes(input.value);
  });
  elements.modal.showModal();
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarBackdrop.classList.add("hidden");
}

qa(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeOwner = button.dataset.owner;
    clearSmartSelection();
    elements.statusFilter.value = "all";
    renderAll();
    closeSidebar();
  });
});

qa(".smart-filter").forEach((button) => {
  button.addEventListener("click", () => {
    qa(".smart-filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeSmartFilter = button.dataset.smart;
    activeOwner = "all";
    qa(".nav-item").forEach((item) => item.classList.remove("active"));
    elements.statusFilter.value = "all";
    renderAll();
    closeSidebar();
  });
});

qa(".categories-menu button").forEach((button) => {
  button.addEventListener("click", () => {
    elements.categoryFilter.value = button.dataset.category;
    activeSmartFilter = null;
    renderAll();
    closeSidebar();
  });
});

elements.categoryFilter.addEventListener("change", () => {
  activeSmartFilter = null;
  renderAll();
});
elements.statusFilter.addEventListener("change", () => {
  activeSmartFilter = null;
  renderAll();
});

qa(".view-mode").forEach((button) => {
  button.addEventListener("click", () => {
    qa(".view-mode").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    elements.taskList.classList.toggle("compact", button.dataset.mode === "compact");
  });
});

["#addBtn", "#quickAddBtn", "#mobileAddBtn"].forEach((selector) => {
  q(selector).addEventListener("click", openModal);
});

q("#closeBtn").addEventListener("click", () => elements.modal.close());
q("#cancelBtn").addEventListener("click", () => elements.modal.close());

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(elements.form);

  tasks.push({
    id: crypto.randomUUID(),
    title: data.get("title").trim(),
    owner: data.get("owner"),
    category: data.get("category"),
    dueDate: data.get("dueDate"),
    priority: data.get("priority"),
    alerts: data.getAll("alerts").map(Number),
    notes: data.get("notes").trim(),
    done: false
  });

  saveTasks();
  elements.modal.close();
  renderAll();
});

q("#menuBtn").addEventListener("click", () => {
  elements.sidebar.classList.add("open");
  elements.sidebarBackdrop.classList.remove("hidden");
});
elements.sidebarBackdrop.addEventListener("click", closeSidebar);

q("#prevMonth").addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});
q("#nextMonth").addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  q("#installBtn").classList.remove("hidden");
});

q("#installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  q("#installBtn").classList.add("hidden");
});

elements.dateNow.textContent = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
}).format(new Date());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}

renderAll();
