const KEY="duopilot.tasks.v1";
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const defaults=[
{id:crypto.randomUUID(),title:"Révision de la Mercedes",owner:"Armand",category:"Véhicule",dueDate:addDays(12),priority:"important",alerts:[14,7],notes:"Demander un devis et vérifier le carnet d’entretien.",done:false},
{id:crypto.randomUUID(),title:"Contrôle de la VMC",owner:"Commun",category:"Maison",dueDate:addDays(25),priority:"normal",alerts:[14,7],notes:"Maison de La Frette-sur-Seine.",done:false},
{id:crypto.randomUUID(),title:"Échéance professionnelle",owner:"Christelle",category:"Professionnel",dueDate:addDays(5),priority:"urgent",alerts:[14,7,1],notes:"Préparer les justificatifs.",done:false}
];
let tasks;
try{tasks=JSON.parse(localStorage.getItem(KEY))||defaults}catch{tasks=defaults}
let activeOwner="all";
let installPrompt=null;

const q=s=>document.querySelector(s);
const list=q("#taskList"), empty=q("#empty"), modal=q("#modal"), form=q("#taskForm");

function save(){localStorage.setItem(KEY,JSON.stringify(tasks))}
function dateObj(v){return new Date(v+"T12:00:00")}
function daysLeft(v){const t=new Date();t.setHours(12,0,0,0);return Math.ceil((dateObj(v)-t)/86400000)}
function formatDate(v){return new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(dateObj(v))}
function alertText(n){return n===14?"2 semaines avant":n===7?"1 semaine avant":n===1?"la veille":"le jour même"}

function render(){
  const cat=q("#categoryFilter").value, stat=q("#statusFilter").value;
  const filtered=tasks.filter(t=>activeOwner==="all"||t.owner===activeOwner)
    .filter(t=>cat==="all"||t.category===cat)
    .filter(t=>{
      const overdue=!t.done&&daysLeft(t.dueDate)<0;
      if(stat==="done")return t.done;
      if(stat==="todo")return !t.done;
      if(stat==="overdue")return overdue;
      return true;
    }).sort((a,b)=>a.done-b.done||dateObj(a.dueDate)-dateObj(b.dueDate));

  list.innerHTML="";
  empty.classList.toggle("hidden",filtered.length>0);

  filtered.forEach(t=>{
    const d=daysLeft(t.dueDate), overdue=!t.done&&d<0;
    const card=document.createElement("article");
    card.className="task"+(t.done?" done":"")+(overdue?" overdue":"");
    const timing=t.done?"Terminée":d<0?`En retard de ${Math.abs(d)} jour${Math.abs(d)>1?"s":""}`:d===0?"Aujourd’hui":d===1?"Demain":`Dans ${d} jours`;
    card.innerHTML=`
      <button class="check" aria-label="Terminer"></button>
      <div>
        <div>
          <span class="badge">${t.owner}</span>
          <span class="badge">${t.category}</span>
          <span class="badge priority ${t.priority}">${t.priority==="urgent"?"Urgente":t.priority==="important"?"Importante":"Normale"}</span>
        </div>
        <h3>${escapeHtml(t.title)}</h3>
        <p class="meta">${formatDate(t.dueDate)} · ${timing}</p>
        ${t.notes?`<p>${escapeHtml(t.notes)}</p>`:""}
        <p class="meta">Alertes : ${t.alerts.length?t.alerts.map(alertText).join(", "):"aucune"}</p>
      </div>
      <button class="delete">Supprimer</button>`;
    card.querySelector(".check").onclick=()=>{t.done=!t.done;save();render()};
    card.querySelector(".delete").onclick=()=>{if(confirm(`Supprimer « ${t.title} » ?`)){tasks=tasks.filter(x=>x.id!==t.id);save();render()}};
    list.appendChild(card);
  });

  const visible=tasks.filter(t=>activeOwner==="all"||t.owner===activeOwner);
  q("#upcoming").textContent=visible.filter(t=>!t.done&&daysLeft(t.dueDate)>=0).length;
  q("#week").textContent=visible.filter(t=>!t.done&&daysLeft(t.dueDate)>=0&&daysLeft(t.dueDate)<=7).length;
  q("#late").textContent=visible.filter(t=>!t.done&&daysLeft(t.dueDate)<0).length;
  q("#titleView").textContent=activeOwner==="all"?"Toutes les échéances":activeOwner==="Commun"?"Échéances communes":`Échéances de ${activeOwner}`;
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}

document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); activeOwner=btn.dataset.owner; render();
});
q("#categoryFilter").onchange=render;
q("#statusFilter").onchange=render;
q("#addBtn").onclick=()=>{
  form.reset();
  form.owner.value=activeOwner==="all"?"Armand":activeOwner;
  form.dueDate.value=addDays(7);
  [...form.querySelectorAll('[name="alerts"]')].forEach(x=>x.checked=["14","7"].includes(x.value));
  modal.showModal();
};
q("#closeBtn").onclick=()=>modal.close();
q("#cancelBtn").onclick=()=>modal.close();

form.onsubmit=e=>{
  e.preventDefault();
  const data=new FormData(form);
  tasks.push({
    id:crypto.randomUUID(),
    title:data.get("title").trim(),
    owner:data.get("owner"),
    category:data.get("category"),
    dueDate:data.get("dueDate"),
    priority:data.get("priority"),
    alerts:data.getAll("alerts").map(Number),
    notes:data.get("notes").trim(),
    done:false
  });
  save();modal.close();render();
};

q("#dateNow").textContent=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;q("#installBtn").classList.remove("hidden")});
q("#installBtn").onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;q("#installBtn").classList.add("hidden")};

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js"));
render();
