
window.DUOPILOT_VERSION = "1.9.1";
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
  const container = q("#universeList");
  container.innerHTML = "";
  universes.forEach(name => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.category = name;
    b.setAttribute("data-tooltip", `Afficher les échéances de l’univers « ${name} ».`);
    b.innerHTML = `<i class="u-dot"></i><span>${esc(name)}</span>`;
    b.onclick = () => {
      q("#categoryFilter").value = name;
      smart = null;
      renderAll();
      closeSide();
    };
    container.appendChild(b);
  });

  const filter = q("#categoryFilter");
  const selected = filter.value;
  filter.innerHTML = '<option value="all">Toutes les catégories</option>';
  universes.forEach(name => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    filter.appendChild(o);
  });
  filter.value = universes.includes(selected) ? selected : "all";
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

q("#universeForm").addEventListener("submit",e=>{
  e.preventDefault();
  const input=q("#newUniverseInput");
  const name=normalizeUniverse(input.value);
  input.value="";
  renderAll();
  q("#categoryFilter").value=name;
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
