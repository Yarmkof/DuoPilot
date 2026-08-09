
window.DUOPILOT_VERSION = "1.12";
const TASKS_KEY = "duopilot.tasks.v1";
const UNIVERSES_KEY = "duopilot.universes.v2";
const DEFAULT_UNIVERSES = ["Maison", "Véhicule", "Administratif", "Santé", "Professionnel", "Voyage", "Autre"];

const addDays = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const defaultTasks = [
  {id: crypto.randomUUID(), title:"Révision de la Mercedes", owner:"SONKA", category:"Véhicule", dueDate:addDays(12), priority:"important", alerts:[14,7], notes:"Demander un devis et vérifier le carnet d’entretien.", done:false},
  {id: crypto.randomUUID(), title:"Contrôle de la VMC", owner:"Commun", category:"Maison", dueDate:addDays(25), priority:"normal", alerts:[14,7], notes:"Prévoir le contrôle annuel.", done:false},
  {id: crypto.randomUUID(), title:"Échéance professionnelle", owner:"SONKI", category:"Professionnel", dueDate:addDays(5), priority:"urgent", alerts:[14,7,1], notes:"Préparer les justificatifs.", done:false}
];

const q = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const list = q("#taskList");
const empty = q("#empty");
const modal = q("#modal");
const form = q("#taskForm");

let activeOwner = "all";
let smart = null;
let cal = new Date();
let installPrompt = null;
let editingTaskId = null;

function migrateOwner(owner) {
  if (owner === "Christelle") return "SONKI";
  if (owner === "Armand") return "SONKA";
  return owner;
}

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(TASKS_KEY));
    if (!Array.isArray(stored)) return defaultTasks;
    const migrated = stored.map(t => ({...t, owner:migrateOwner(t.owner)}));
    localStorage.setItem(TASKS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return defaultTasks;
  }
}

let tasks = loadTasks();

function loadUniverses() {
  let stored = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(UNIVERSES_KEY));
    if (Array.isArray(parsed)) stored = parsed;
  } catch {}
  const fromTasks = tasks.map(t => t.category).filter(Boolean);
  return [...new Set([...DEFAULT_UNIVERSES, ...stored, ...fromTasks])];
}

let universes = loadUniverses();
const saveTasks = () => localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
const saveUniverses = () => localStorage.setItem(UNIVERSES_KEY, JSON.stringify(universes));

const parse = v => new Date(v + "T12:00:00");
const today = () => { const d = new Date(); d.setHours(12,0,0,0); return d; };
const days = v => Math.ceil((parse(v) - today()) / 86400000);
const fmt = (v,o={}) => new Intl.DateTimeFormat("fr-FR", {day:"numeric",month:"short",year:"numeric",...o}).format(parse(v));
const esc = s => String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const alertTxt = n => n===14?"2 sem.":n===7?"1 sem.":n===1?"veille":n===0?"jour J":`${n} j`;
const timing = t => { const d=days(t.dueDate); return t.done?"Terminée":d<0?`${Math.abs(d)} j de retard`:d===0?"Aujourd’hui":d===1?"Demain":`Dans ${d} jours`; };

function normalizeUniverse(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Autre";
  const existing = universes.find(u => u.toLowerCase() === raw.toLowerCase());
  if (existing) return existing;
  universes.push(raw);
  saveUniverses();
  return raw;
}

function applyTheme() {
  let theme = "overview";
  if (activeOwner === "SONKI") theme = "sonki";
  else if (activeOwner === "SONKA") theme = "sonka";
  else if (activeOwner === "Commun") theme = "duo";

  document.body.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}

function renderUniverses() {
  const sidebarSelect = q("#sidebarUniverseSelect");
  const filter = q("#categoryFilter");

  const currentSidebar = sidebarSelect?.value || "all";
  const currentFilter = filter.value || "all";

  if (sidebarSelect) {
    sidebarSelect.innerHTML = '<option value="all">Tous les univers</option>';
    universes.forEach(name => {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      sidebarSelect.appendChild(o);
    });
  }

  filter.innerHTML = '<option value="all">Toutes les catégories</option>';
  universes.forEach(name => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    filter.appendChild(o);
  });

  const selected = universes.includes(currentFilter) ? currentFilter : "all";
  filter.value = selected;
  if (sidebarSelect) sidebarSelect.value = selected;
}

function filtered() {
  const c=q("#categoryFilter").value, s=q("#statusFilter").value;
  return tasks
    .filter(t => activeOwner === "all" || t.owner === activeOwner)
    .filter(t => c === "all" || t.category === c)
    .filter(t => {
      const d=days(t.dueDate);
      if (smart === "today") return !t.done && d===0;
      if (smart === "upcoming") return !t.done && d>=0;
      if (smart === "week") return !t.done && d>=0 && d<=7;
      if (smart === "overdue") return !t.done && d<0;
      if (smart === "done") return t.done;
      if (s === "done") return t.done;
      if (s === "todo") return !t.done;
      if (s === "overdue") return !t.done && d<0;
      return true;
    })
    .sort((a,b)=>Number(a.done)-Number(b.done)||parse(a.dueDate)-parse(b.dueDate));
}

function renderTasks() {
  const arr=filtered();
  list.innerHTML="";
  list.classList.toggle("hidden",arr.length===0);
  empty.classList.toggle("hidden",arr.length>0);

  arr.forEach(t => {
    const overdue=!t.done&&days(t.dueDate)<0;
    const a=document.createElement("article");
    a.className=`task-item${t.done?" done":""}${overdue?" overdue":""}`;
    a.dataset.taskId=t.id;
    a.setAttribute("tabindex","0");
    a.setAttribute("role","button");
    a.setAttribute("aria-label",`Modifier l’échéance ${t.title}`);

    a.innerHTML=`
      <button class="complete-button" type="button" aria-label="${t.done?"Rouvrir":"Marquer comme terminée"}"></button>
      <div class="task-click-zone">
        <div class="task-main-row">
          <span class="priority-mark ${t.priority}"></span>
          <h3 class="task-title">${esc(t.title)}</h3>
        </div>
        <div class="task-meta">
          <span>${esc(t.owner)}</span>
          <span>${esc(t.category)}</span>
          <span class="alerts-meta">Alertes : ${t.alerts?.length?t.alerts.map(alertTxt).join(", "):"aucune"}</span>
        </div>
        ${t.notes?`<p class="task-notes">${esc(t.notes)}</p>`:""}
      </div>
      <div class="task-time${overdue?" overdue":""}">
        <strong>${fmt(t.dueDate)}</strong>
        <span>${timing(t)}</span>
      </div>
      <button class="edit-button" type="button" aria-label="Modifier">Modifier</button>
      <button class="delete-button" type="button" aria-label="Supprimer">Supprimer</button>`;

    const openEdit = () => openModal(t);

    a.querySelector(".complete-button").onclick=e=>{
      e.stopPropagation();
      t.done=!t.done;
      saveTasks();
      renderAll();
    };

    a.querySelector(".edit-button").onclick=e=>{
      e.stopPropagation();
      openEdit();
    };

    a.querySelector(".delete-button").onclick=e=>{
      e.stopPropagation();
      if(confirm(`Supprimer « ${t.title} » ?`)){
        tasks=tasks.filter(x=>x.id!==t.id);
        saveTasks();
        renderAll();
      }
    };

    a.querySelector(".task-click-zone").onclick=openEdit;
    a.querySelector(".task-time").onclick=openEdit;

    a.addEventListener("keydown", e=>{
      if(e.key==="Enter" || e.key===" "){
        if(e.target!==a) return;
        e.preventDefault();
        openEdit();
      }
    });

    list.appendChild(a);
  });
}
function count(owner){return tasks.filter(t=>!t.done&&(owner==="all"||t.owner===owner)).length;}
function counters(){
  const cur=tasks.filter(t=>!t.done&&(activeOwner==="all"||t.owner===activeOwner));
  q("#upcoming").textContent=cur.filter(t=>days(t.dueDate)>=0).length;
  q("#week").textContent=cur.filter(t=>{const d=days(t.dueDate);return d>=0&&d<=7;}).length;
  q("#late").textContent=cur.filter(t=>days(t.dueDate)<0).length;
  q("#globalBadge").textContent=count("all");
  q("#christelleBadge").textContent=count("SONKI");
  q("#armandBadge").textContent=count("SONKA");
  q("#communBadge").textContent=count("Commun");
  q("#todayBadge").textContent=tasks.filter(t=>!t.done&&days(t.dueDate)===0).length;
  q("#weekBadgeSide").textContent=tasks.filter(t=>{const d=days(t.dueDate);return !t.done&&d>=0&&d<=7;}).length;
  q("#lateBadgeSide").textContent=tasks.filter(t=>!t.done&&days(t.dueDate)<0).length;
  q("#doneBadgeSide").textContent=tasks.filter(t=>t.done).length;
}

function status(){
  const scope=tasks.filter(t=>activeOwner==="all"||t.owner===activeOwner);
  const late=scope.filter(t=>!t.done&&days(t.dueDate)<0).length;
  const w=scope.filter(t=>{const d=days(t.dueDate);return !t.done&&d>=0&&d<=7;}).length;
  const orb=q("#statusOrb");
  orb.classList.remove("warning","danger");
  if(late){q("#dailyStatus").textContent=`${late} retard${late>1?"s":""}`;orb.classList.add("danger");}
  else if(w>=3){q("#dailyStatus").textContent="Semaine active";orb.classList.add("warning");}
  else q("#dailyStatus").textContent="Tout va bien";
}

function heading(){
  const g={
    all:["Votre cockpit","Bonjour 👋","Tout ce qui mérite votre attention, au même endroit."],
    SONKI:["Espace personnel","SONKI","Les échéances dont SONKI garde le pilotage."],
    SONKA:["Espace personnel","SONKA","Les échéances dont SONKA garde le pilotage."],
    Commun:["Espace partagé","À deux","Les sujets qui concernent votre quotidien commun."]
  };
  if(smart){
    const x={today:["Aujourd’hui","À faire aujourd’hui","Une vue simple de ce qui compte maintenant.","Aujourd’hui"],upcoming:["À venir","Vos prochaines échéances","Tout ce qui est prévu à partir d’aujourd’hui.","À venir"],week:["Anticipation","Les 7 prochains jours","Gardez une longueur d’avance sur votre semaine.","Cette semaine"],overdue:["Priorité","À rattraper","Les échéances qui nécessitent votre attention.","En retard"],done:["Historique","Ce qui est terminé","Votre mémoire des tâches déjà réalisées.","Terminées"]}[smart];
    q("#viewEyebrow").textContent=x[0];q("#titleView").textContent=x[1];q("#heroSubtitle").textContent=x[2];q("#listTitle").textContent=x[3];return;
  }
  const x=g[activeOwner];
  q("#viewEyebrow").textContent=x[0];q("#titleView").textContent=x[1];q("#heroSubtitle").textContent=x[2];q("#listTitle").textContent=activeOwner==="all"?"À surveiller":"Échéances";
}

function focus(){
  const rank={urgent:0,important:1,normal:2};
  const scope=tasks.filter(t=>!t.done&&(activeOwner==="all"||t.owner===activeOwner));
  const n=scope.sort((a,b)=>{const al=days(a.dueDate)<0,bl=days(b.dueDate)<0;if(al!==bl)return al?-1:1;if(rank[a.priority]!==rank[b.priority])return rank[a.priority]-rank[b.priority];return parse(a.dueDate)-parse(b.dueDate);})[0];
  q("#nextFocusText").textContent=n?n.title:"Aucune";
  if(!n){q("#focusTitle").textContent="Aucune priorité";q("#focusOwner").textContent="—";q("#focusDate").textContent="Ajoutez une échéance pour commencer.";q("#focusNotes").textContent="";q("#focusMeter").style.width="0%";return;}
  const d=days(n.dueDate),w=d<=0?100:Math.max(10,Math.min(90,100-d/30*100));
  q("#focusTitle").textContent=n.title;q("#focusOwner").textContent=n.owner;q("#focusDate").textContent=`${fmt(n.dueDate,{weekday:"long"})} · ${timing(n)}`;q("#focusNotes").textContent=n.notes||`${n.category} · priorité ${n.priority}`;q("#focusMeter").style.width=`${w}%`;
}

function calendar(){
  const y=cal.getFullYear(),m=cal.getMonth(),ms=new Date(y,m,1,12),fd=(ms.getDay()+6)%7,gs=new Date(y,m,1-fd,12),tk=new Date().toISOString().slice(0,10);
  const scoped=tasks.filter(t=>!t.done&&(activeOwner==="all"||t.owner===activeOwner));
  const td=new Set(scoped.map(t=>t.dueDate));
  q("#calendarTitle").textContent=new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(ms);
  q("#calendarGrid").innerHTML="";
  for(let i=0;i<42;i++){const d=new Date(gs);d.setDate(gs.getDate()+i);const k=d.toISOString().slice(0,10),b=document.createElement("button");b.className="calendar-day";b.textContent=d.getDate();if(d.getMonth()!==m)b.classList.add("muted");if(k===tk)b.classList.add("today");if(td.has(k))b.classList.add("has-task");q("#calendarGrid").appendChild(b);}
}

function renderAll(){applyTheme();renderUniverses();renderTasks();counters();status();heading();focus();calendar();}
function clearSmart(){
  smart=null;
  qa(".shortcut").forEach(b=>b.classList.remove("active"));
  qa(".pulse-card").forEach(b=>{
    b.classList.remove("active");
    b.setAttribute("aria-pressed","false");
  });
}
function closeSide(){
  const sidebar=q("#sidebar");
  const backdrop=q("#sidebarBackdrop");
  if(sidebar) sidebar.classList.remove("open");
  if(backdrop) backdrop.classList.add("hidden");
  document.body.classList.remove("mobile-menu-open");
}
function openModal(task=null){
  form.reset();
  editingTaskId = task?.id || null;

  const modalKicker=q("#taskModalKicker");
  const modalTitle=q("#taskModalTitle");
  const submitBtn=q("#taskSubmitBtn");

  if(task){
    modalKicker.textContent="Modifier l’échéance";
    modalTitle.textContent="Mettre à jour dans DuoPilot";
    submitBtn.textContent="Enregistrer les modifications";

    form.title.value=task.title || "";
    form.owner.value=task.owner || "SONKA";
    form.category.value=task.category || "";
    form.dueDate.value=task.dueDate || addDays(7);
    form.priority.value=task.priority || "normal";
    form.notes.value=task.notes || "";

    const selectedAlerts=new Set((task.alerts||[]).map(Number));
    qa('[name="alerts"]').forEach(i=>i.checked=selectedAlerts.has(Number(i.value)));
  }else{
    modalKicker.textContent="Nouvelle échéance";
    modalTitle.textContent="Ajouter à DuoPilot";
    submitBtn.textContent="Enregistrer";

    form.owner.value=activeOwner==="all"?"SONKA":activeOwner;
    form.dueDate.value=addDays(7);
    form.category.value="";
    qa('[name="alerts"]').forEach(i=>i.checked=["14","📅"].includes(i.value));
  }

  modal.showModal();
  setTimeout(()=>form.title.focus(),0);
}
function activateSpace(owner, sourceButton = null) {
  activeOwner = owner || "all";
  clearSmart();

  qa(".space-item").forEach(item => {
    const isActive = item.dataset.owner === activeOwner;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (sourceButton) {
    sourceButton.classList.add("active");
    sourceButton.setAttribute("aria-pressed", "true");
  }

  const statusFilter = q("#statusFilter");
  if (statusFilter) statusFilter.value = "all";

  applyTheme();
  renderAll();
  closeSide();
}

qa(".space-item").forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    activateSpace(button.dataset.owner, button);
  });
});
qa(".shortcut").forEach(b=>b.onclick=()=>{
  qa(".shortcut").forEach(x=>x.classList.remove("active"));
  qa(".pulse-card").forEach(x=>{x.classList.remove("active");x.setAttribute("aria-pressed","false");});
  b.classList.add("active");
  smart=b.dataset.smart;
  activeOwner="all";
  qa(".space-item").forEach(x=>x.classList.remove("active"));
  q("#statusFilter").value="all";
  renderAll();
  closeSide();
});

qa(".pulse-card").forEach(card=>card.onclick=()=>{
  const requested = card.dataset.pulse;
  const wasActive = smart === requested && card.classList.contains("active");

  qa(".pulse-card").forEach(x=>{
    x.classList.remove("active");
    x.setAttribute("aria-pressed","false");
  });
  qa(".shortcut").forEach(x=>x.classList.remove("active"));
  q("#statusFilter").value="all";

  if (wasActive) {
    smart = null;
  } else {
    smart = requested;
    card.classList.add("active");
    card.setAttribute("aria-pressed","true");
  }

  renderAll();
});

q("#categoryFilter").onchange=()=>{clearSmart();renderAll();};
q("#statusFilter").onchange=()=>{clearSmart();renderAll();};
qa(".density").forEach(b=>b.onclick=()=>{qa(".density").forEach(x=>x.classList.remove("active"));b.classList.add("active");list.classList.toggle("compact",b.dataset.mode==="compact");});
["#addBtn","#quickAddBtn","#mobileAddBtn"].forEach(s=>{const el=q(s);if(el)el.onclick=()=>openModal();});
q("#closeBtn").onclick=()=>{editingTaskId=null;modal.close();};q("#cancelBtn").onclick=()=>{editingTaskId=null;modal.close();};

form.onsubmit=e=>{
  e.preventDefault();
  const d=new FormData(form);
  const universe=normalizeUniverse(d.get("category"));

  const payload={
    title:String(d.get("title")||"").trim(),
    owner:migrateOwner(d.get("owner")),
    category:universe,
    dueDate:d.get("dueDate"),
    priority:d.get("priority"),
    alerts:d.getAll("alerts").map(Number),
    notes:String(d.get("notes")||"").trim()
  };

  if(editingTaskId){
    const task=tasks.find(t=>t.id===editingTaskId);
    if(task) Object.assign(task,payload);
  }else{
    tasks.push({
      id:crypto.randomUUID(),
      ...payload,
      done:false
    });
  }

  saveTasks();
  editingTaskId=null;
  modal.close();
  q("#categoryFilter").value="all";
  renderAll();
};

const sidebarUniverseSelect = q("#sidebarUniverseSelect");
if (sidebarUniverseSelect) {
  sidebarUniverseSelect.addEventListener("change", () => {
    const value = sidebarUniverseSelect.value;
    q("#categoryFilter").value = value;
    smart = null;
    renderAll();
    closeSide();
  });
}

q("#universeForm").addEventListener("submit",e=>{
  e.preventDefault();
  const input=q("#newUniverseInput");
  const name=normalizeUniverse(input.value);
  input.value="";
  renderAll();
  q("#categoryFilter").value=name;
  if (q("#sidebarUniverseSelect")) q("#sidebarUniverseSelect").value=name;
  renderAll();
});

q("#menuBtn").onclick=()=>{
  const sidebar=q("#sidebar");
  const backdrop=q("#sidebarBackdrop");
  if(sidebar) sidebar.classList.add("open");
  if(backdrop) backdrop.classList.remove("hidden");
  document.body.classList.add("mobile-menu-open");
};
q("#sidebarBackdrop").onclick=closeSide;
q("#prevMonth").onclick=()=>{cal=new Date(cal.getFullYear(),cal.getMonth()-1,1);calendar();};
q("#nextMonth").onclick=()=>{cal=new Date(cal.getFullYear(),cal.getMonth()+1,1);calendar();};


// =========================================================
// DuoPilot V1.5 — Recherche + Aide
// =========================================================
const searchBtn = q("#searchBtn");
const helpBtn = q("#helpBtn");
const searchDialog = q("#searchDialog");
const helpDialog = q("#helpDialog");
const globalSearchInput = q("#globalSearchInput");
const searchResults = q("#searchResults");
const searchResultCount = q("#searchResultCount");

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function searchTaskHaystack(task) {
  return normalizeSearch([
    task.title,
    task.notes,
    task.category,
    task.owner,
    task.priority,
    task.date
  ].join(" "));
}

function openSearch() {
  if (!searchDialog) return;
  searchDialog.showModal();
  setTimeout(() => globalSearchInput?.focus(), 30);
}

function openHelp() {
  if (!helpDialog) return;
  helpDialog.showModal();
}

function closeUtilityDialog(dialog) {
  if (dialog?.open) dialog.close();
}

searchBtn?.addEventListener("click", openSearch);
helpBtn?.addEventListener("click", openHelp);

qa("[data-close-dialog]").forEach(button => {
  button.addEventListener("click", () => {
    closeUtilityDialog(q("#" + button.dataset.closeDialog));
  });
});

[searchDialog, helpDialog].forEach(dialog => {
  dialog?.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
});

document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
  }
  if (event.key === "Escape") {
    closeUtilityDialog(searchDialog);
    closeUtilityDialog(helpDialog);
  }
});

globalSearchInput?.addEventListener("input", () => {
  const query = normalizeSearch(globalSearchInput.value);

  if (!query) {
    searchResultCount.textContent = "Commencez à saisir votre recherche.";
    searchResults.innerHTML = `
      <div class="search-empty">
        <span>⌕</span>
        <strong>Recherche instantanée</strong>
        <p>Vous pouvez rechercher dans les titres, les notes, les univers et les responsables.</p>
      </div>`;
    return;
  }

  const results = tasks
    .filter(task => searchTaskHaystack(task).includes(query))
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  searchResultCount.textContent = `${results.length} résultat${results.length > 1 ? "s" : ""}`;

  if (!results.length) {
    searchResults.innerHTML = `
      <div class="search-empty">
        <span>∅</span>
        <strong>Aucun résultat</strong>
        <p>Essayez un autre mot-clé.</p>
      </div>`;
    return;
  }

  searchResults.innerHTML = results.map(task => `
    <button class="search-result-item" type="button" data-search-task="${escapeHtml(task.id)}">
      <div class="search-result-main">
        <strong>${escapeHtml(task.title || "Sans titre")}</strong>
        <span>${escapeHtml(task.owner || "")} · ${escapeHtml(task.category || "Autre")}</span>
        ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ""}
      </div>
      <div class="search-result-date">
        <strong>${escapeHtml(task.date || "")}</strong>
        <span>${task.done ? "Terminée" : "À faire"}</span>
      </div>
    </button>
  `).join("");

  qa("[data-search-task]").forEach(button => {
    button.addEventListener("click", () => {
      const task = tasks.find(item => String(item.id) === String(button.dataset.searchTask));
      if (!task) return;

      // Navigate to corresponding owner view
      activeOwner = task.owner === "SONKI" || task.owner === "SONKA" || task.owner === "Commun"
        ? task.owner
        : "all";
      smart = null;

      qa(".space-item").forEach(item => {
        item.classList.toggle("active", item.dataset.owner === activeOwner);
      });
      qa(".shortcut").forEach(item => item.classList.remove("active"));
      qa(".pulse-card").forEach(item => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed","false");
      });

      const categoryFilter = q("#categoryFilter");
      const statusFilter = q("#statusFilter");
      if (categoryFilter) categoryFilter.value = task.category || "all";
      if (statusFilter) statusFilter.value = "all";

      renderAll();
      searchDialog.close();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
});

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;q("#installBtn").classList.remove("hidden");});
q("#installBtn").onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;q("#installBtn").classList.add("hidden");};
q("#dateNow").textContent=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
renderAll();


// DuoPilot V1.4.2 — retour accueil sans modifier la structure de l'application
const homeBrand = document.getElementById("homeBrand");
if (homeBrand) {
  const returnHome = () => {
    activeOwner = "all";
    smart = null;

    qa(".space-item").forEach(item => {
      item.classList.toggle("active", item.dataset.owner === "all");
    });

    qa(".shortcut").forEach(item => item.classList.remove("active"));
    qa(".pulse-card").forEach(item => {
      item.classList.remove("active");
      item.setAttribute("aria-pressed", "false");
    });

    const category = q("#categoryFilter");
    const status = q("#statusFilter");
    if (category) category.value = "all";
    if (status) status.value = "all";

    renderAll();
    if (typeof closeSide === "function") closeSide();
    window.scrollTo({top: 0, behavior: "smooth"});
  };

  homeBrand.addEventListener("click", returnHome);
  homeBrand.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      returnHome();
    }
  });
}


// =========================================================
// DuoPilot V1.12 — Notifications + Web Push Railway
// =========================================================
const PUSH_SERVER_URL = String(window.DUOPILOT_CONFIG?.PUSH_SERVER_URL || "").replace(/\/+$/,"");
const notificationDialog = q("#notificationDialog");
const notificationBtn = q("#notificationBtn");
const mobileNotificationBtn = q("#mobileNotificationBtn");
const enableNotificationsBtn = q("#enableNotificationsBtn");
const testNotificationBtn = q("#testNotificationBtn");
const syncPushBtn = q("#syncPushBtn");
const notificationPermissionLabel = q("#notificationPermissionLabel");
const notificationPermissionHelp = q("#notificationPermissionHelp");
const notificationReminderList = q("#notificationReminderList");
const notificationBadge = q("#notificationBadge");
const mobileNotificationBadge = q("#mobileNotificationBadge");
const pushBackendStatus = q("#pushBackendStatus");
const pushBackendHelp = q("#pushBackendHelp");

const NOTIFICATION_SENT_KEY = "duopilot.notifications.sent.v12";

function loadSentNotifications(){
  try { return JSON.parse(localStorage.getItem(NOTIFICATION_SENT_KEY)) || {}; }
  catch { return {}; }
}
let sentNotifications = loadSentNotifications();

function saveSentNotifications(){
  localStorage.setItem(NOTIFICATION_SENT_KEY, JSON.stringify(sentNotifications));
}

function dayKey(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function reminderLabel(offset){
  const n=Number(offset);
  if(n===14) return "2 semaines avant";
  if(n===7) return "1 semaine avant";
  if(n===1) return "La veille";
  if(n===0) return "Le jour même";
  return `${n} jours avant`;
}

function reminderDate(task, offset){
  const d=parse(task.dueDate);
  d.setDate(d.getDate()-Number(offset));
  d.setHours(9,0,0,0);
  return d;
}

function reminderEntries(){
  const rows=[];
  tasks.filter(t=>!t.done).forEach(task=>{
    (task.alerts||[]).forEach(offset=>{
      rows.push({
        task,
        offset:Number(offset),
        when:reminderDate(task,offset),
        key:`${task.id}:${offset}:${task.dueDate}`
      });
    });
  });
  return rows.sort((a,b)=>a.when-b.when);
}

function renderReminderCenter(){
  if(!notificationReminderList) return;
  const today=new Date(); today.setHours(0,0,0,0);
  const entries=reminderEntries().filter(r=>{
    const d=new Date(r.when); d.setHours(0,0,0,0);
    return d>=today;
  }).slice(0,30);

  if(!entries.length){
    notificationReminderList.innerHTML='<div class="notification-empty"><span>✓</span><strong>Aucun rappel à venir</strong><p>Ajoutez une échéance avec une alerte.</p></div>';
  } else {
    notificationReminderList.innerHTML=entries.map(r=>`
      <article class="notification-reminder-item">
        <div class="notification-reminder-icon">🔔</div>
        <div class="notification-reminder-main">
          <strong>${esc(r.task.title)}</strong>
          <span>${esc(r.task.owner)} · ${esc(r.task.category)}</span>
          <p>${reminderLabel(r.offset)} · ${fmt(dayKey(r.when))}</p>
        </div>
        <div class="notification-reminder-due">
          <small>Échéance</small><strong>${fmt(r.task.dueDate)}</strong>
        </div>
      </article>`).join("");
  }

  const current=dayKey(new Date());
  const count=reminderEntries().filter(r=>dayKey(r.when)===current&&!sentNotifications[r.key]).length;
  [notificationBadge,mobileNotificationBadge].forEach(b=>{
    if(!b) return;
    b.textContent=count;
    b.classList.toggle("hidden",count===0);
  });
}

function updateNotificationPermissionUI(){
  if(!notificationPermissionLabel) return;
  if(!("Notification" in window)){
    notificationPermissionLabel.textContent="Non compatible";
    notificationPermissionHelp.textContent="Ce navigateur ne prend pas en charge les notifications Web.";
    enableNotificationsBtn.disabled=true;
    return;
  }
  if(Notification.permission==="granted"){
    notificationPermissionLabel.textContent="Activées ✓";
    notificationPermissionHelp.textContent="Cet appareil autorise les notifications DuoPilot.";
    enableNotificationsBtn.textContent="Activées ✓";
    enableNotificationsBtn.disabled=true;
  } else if(Notification.permission==="denied"){
    notificationPermissionLabel.textContent="Bloquées";
    notificationPermissionHelp.textContent="Autorisez les notifications dans les réglages du navigateur.";
    enableNotificationsBtn.textContent="Bloquées";
    enableNotificationsBtn.disabled=true;
  } else {
    notificationPermissionLabel.textContent="Non activées";
    notificationPermissionHelp.textContent="Cliquez sur Activer pour autoriser les rappels.";
    enableNotificationsBtn.textContent="Activer";
    enableNotificationsBtn.disabled=false;
  }
}

async function apiFetch(path,options={}){
  if(!PUSH_SERVER_URL) throw new Error("PUSH_SERVER_NOT_CONFIGURED");
  const response=await fetch(`${PUSH_SERVER_URL}${path}`,{
    ...options,
    headers:{"Content-Type":"application/json",...(options.headers||{})}
  });
  if(!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text().catch(()=>"")}`);
  return response.status===204?null:response.json();
}

function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

async function checkPushBackend(){
  if(!pushBackendStatus) return;
  try{
    const data=await apiFetch("/health");
    pushBackendStatus.textContent=data?.status==="ok"?"Disponible ✓":"Disponible";
    pushBackendHelp.textContent="Le service Railway est accessible.";
  }catch(err){
    pushBackendStatus.textContent="Non connecté";
    pushBackendHelp.textContent="Le backend Railway doit être configuré avant les notifications en arrière-plan.";
  }
}

async function ensurePushSubscription(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window)) throw new Error("PUSH_NOT_SUPPORTED");
  if(Notification.permission!=="granted") throw new Error("NOTIFICATION_PERMISSION_REQUIRED");

  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();

  if(!sub){
    const {publicKey}=await apiFetch("/api/push/public-key");
    sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(publicKey)
    });
  }

  await apiFetch("/api/push/subscribe",{
    method:"POST",
    body:JSON.stringify({
      subscription:sub.toJSON(),
      device:{userAgent:navigator.userAgent,language:navigator.language}
    })
  });
  return sub;
}

function remindersForServer(){
  return tasks.filter(t=>!t.done).map(t=>({
    id:t.id,title:t.title,owner:t.owner,category:t.category,
    dueDate:t.dueDate,alerts:(t.alerts||[]).map(Number)
  }));
}

async function syncPushReminders(){
  try{
    pushBackendStatus.textContent="Synchronisation…";
    const sub=await ensurePushSubscription();
    await apiFetch("/api/reminders/sync",{
      method:"POST",
      body:JSON.stringify({
        endpoint:sub.endpoint,
        reminders:remindersForServer(),
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Europe/Paris"
      })
    });
    pushBackendStatus.textContent="Synchronisé ✓";
    pushBackendHelp.textContent="Les alertes sont enregistrées sur Railway.";
    return true;
  }catch(err){
    console.error("Push sync",err);
    pushBackendStatus.textContent="À configurer";
    pushBackendHelp.textContent="Vérifiez les variables Railway puis réessayez.";
    return false;
  }
}

async function enableDuoPilotNotifications(){
  if(!("Notification" in window)) return;
  const permission=await Notification.requestPermission();
  updateNotificationPermissionUI();
  if(permission==="granted"){
    await syncPushReminders();
  }
}

async function showLocalNotification(title,options={}){
  if(Notification.permission!=="granted") return;
  const reg=await navigator.serviceWorker.ready;
  await reg.showNotification(title,{
    icon:"./assets/icon-192.png",
    badge:"./assets/icon-192.png",
    ...options
  });
}

async function checkTodayLocalReminders(){
  if(!("Notification" in window)||Notification.permission!=="granted") return;
  const today=dayKey(new Date());
  for(const r of reminderEntries().filter(x=>dayKey(x.when)===today&&!sentNotifications[x.key])){
    await showLocalNotification(`DuoPilot · ${r.task.title}`,{
      body:`${reminderLabel(r.offset)} · ${r.task.owner} · ${r.task.category}`,
      tag:`duopilot-${r.key}`,
      data:{url:"./",taskId:r.task.id}
    });
    sentNotifications[r.key]=Date.now();
    saveSentNotifications();
  }
  renderReminderCenter();
}

function openNotificationCenter(){
  updateNotificationPermissionUI();
  renderReminderCenter();
  checkPushBackend();
  notificationDialog?.showModal();
}

notificationBtn?.addEventListener("click",openNotificationCenter);
mobileNotificationBtn?.addEventListener("click",openNotificationCenter);
enableNotificationsBtn?.addEventListener("click",enableDuoPilotNotifications);
syncPushBtn?.addEventListener("click",syncPushReminders);
testNotificationBtn?.addEventListener("click",async()=>{
  if(Notification.permission!=="granted"){
    await enableDuoPilotNotifications();
    if(Notification.permission!=="granted") return;
  }
  await showLocalNotification("Test DuoPilot 🔔",{
    body:"Les notifications fonctionnent sur cet appareil.",
    tag:`duopilot-test-${Date.now()}`,
    data:{url:"./"}
  });
});

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") checkTodayLocalReminders();
});
window.addEventListener("focus",checkTodayLocalReminders);
setInterval(checkTodayLocalReminders,60000);

setTimeout(()=>{
  updateNotificationPermissionUI();
  renderReminderCenter();
  checkPushBackend();
  checkTodayLocalReminders();
},800);



let __pushSyncTimer=null;
function schedulePushSync(){
  clearTimeout(__pushSyncTimer);
  __pushSyncTimer=setTimeout(()=>{
    if(typeof syncPushReminders==="function" && "Notification" in window && Notification.permission==="granted"){
      syncPushReminders().catch(console.error);
    }
  },900);
}
