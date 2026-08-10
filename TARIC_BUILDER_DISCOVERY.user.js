// ==UserScript==
// @name         TARIC BUILDER - Auto Discovery TEST
// @namespace    fabry-aida-crawler
// @version      0.1.0-test
// @description  Scopre automaticamente capitoli e sottocapitoli TARIC navigando l'indice AIDA. Non estrae ancora i dettagli.
// @match        https://aidaonline7.adm.gov.it/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

const STATE_KEY='TARIC_BUILDER_DISCOVERY_STATE';
const PANEL_ID='taric-builder-discovery-panel';
const WAIT=900;

function clean(v){return String(v||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
function digits(v){return String(v||'').replace(/\D/g,'');}
function load(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null')||empty();}catch(e){return empty();}}
function empty(){return {running:false,phase:'fermo',chapters:[],chapterIndex:0,subchapters:[],errors:[]};}
let state=load();
function save(){localStorage.setItem(STATE_KEY,JSON.stringify(state));render();}

function exactCodeLinks(len){
  const out=[]; const seen=new Set();
  document.querySelectorAll('a').forEach(a=>{
    const txt=clean(a.innerText||a.textContent);
    const d=digits(txt);
    if(d.length!==len) return;
    // Il testo visibile deve essere sostanzialmente solo il codice (eventuali spazi ammessi)
    if(!new RegExp('^\\s*'+d.match(/.{1,2}/g).join('\\s*')+'\\s*$').test(txt)) return;
    if(seen.has(d)) return;
    seen.add(d); out.push({code:d,href:a.getAttribute('href')||'',el:a});
  });
  return out.sort((a,b)=>a.code.localeCompare(b.code));
}

function chapterLinks(){return exactCodeLinks(2).filter(x=>+x.code>=1 && +x.code<=99);}
function subchapterLinks(chapter){return exactCodeLinks(4).filter(x=>x.code.startsWith(chapter));}

function addError(type,msg){state.errors.push({type,msg,url:location.href,at:new Date().toISOString()});save();}

function clickBack(){
  const controls=[...document.querySelectorAll('input,button,a')];
  const back=controls.find(el=>/^(indietro|back)$/i.test(clean(el.value||el.innerText||el.textContent)));
  if(back){back.click();return true;}
  history.back(); return true;
}

function start(){
  const chapters=chapterLinks();
  if(!chapters.length){alert('Apri prima la pagina INDICE TARIC, quella dove vedi i capitoli 01, 02, 03...');return;}
  state=empty();
  state.running=true;
  state.phase='indice';
  state.chapters=chapters.map(x=>x.code);
  save();
  setTimeout(step,250);
}

function step(){
  if(!state.running)return;
  if(state.chapterIndex>=state.chapters.length){complete();return;}
  const chapter=state.chapters[state.chapterIndex];

  // Se siamo sull'indice generale, apriamo il capitolo corrente.
  const chapters=chapterLinks();
  const target=chapters.find(x=>x.code===chapter);
  if(target){
    state.phase='apro capitolo '+chapter;
    save();
    target.el.click();
    return;
  }

  // Dentro il capitolo: raccogliamo tutti i codici a 4 cifre del capitolo.
  const subs=subchapterLinks(chapter);
  if(subs.length){
    const set=new Set(state.subchapters);
    subs.forEach(x=>set.add(x.code));
    state.subchapters=[...set].sort();
    state.phase='capitolo '+chapter+': '+subs.length+' sottocapitoli';
    state.chapterIndex++;
    save();
    setTimeout(clickBack,WAIT);
    return;
  }

  addError('PAGINA_NON_RICONOSCIUTA','Nessun link capitolo o sottocapitolo trovato per '+chapter);
  state.running=false; state.phase='errore'; save();
}

function complete(){
  state.running=false; state.phase='completato'; save();
  const byChapter={};
  state.subchapters.forEach(s=>(byChapter[s.slice(0,2)]??=[]).push(s));
  console.log('[TARIC DISCOVERY] Capitoli:',state.chapters);
  console.log('[TARIC DISCOVERY] Sottocapitoli:',state.subchapters);
  console.table(Object.entries(byChapter).map(([c,s])=>({capitolo:c,sottocapitoli:s.length,range:s[0]+' → '+s[s.length-1]})));
  alert('Discovery completata. Capitoli: '+state.chapters.length+'. Sottocapitoli: '+state.subchapters.length+'. Errori: '+state.errors.length+'.');
}

function download(){
 const blob=new Blob([JSON.stringify({chapters:state.chapters,subchapters:state.subchapters,errors:state.errors},null,2)],{type:'application/json;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='TARIC_DISCOVERY.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function reset(){if(!confirm('Azzero il test discovery?'))return;localStorage.removeItem(STATE_KEY);state=empty();render();}

function render(){
 let p=document.getElementById(PANEL_ID);
 if(!p){p=document.createElement('div');p.id=PANEL_ID;p.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;width:330px;background:#102536;color:#fff;border:1px solid #52758c;border-radius:10px;padding:14px;font:14px Arial;box-shadow:0 8px 24px #0008';document.body.appendChild(p);}
 p.innerHTML='<div style="font-weight:bold;font-size:17px;margin-bottom:10px">TARIC BUILDER — DISCOVERY</div>'+
 '<div>Stato: '+state.phase+'</div><div>Capitoli trovati: '+state.chapters.length+'</div><div>Sottocapitoli: '+state.subchapters.length+'</div><div>Progresso: '+Math.min(state.chapterIndex+1,state.chapters.length)+' / '+state.chapters.length+'</div><div>Errori: '+state.errors.length+'</div>'+
 '<button id="td-start" style="width:100%;margin-top:10px;padding:9px">SCOPRI TUTTA LA TARIC</button><button id="td-down" style="width:100%;margin-top:6px;padding:9px">SCARICA MAPPA JSON</button><button id="td-reset" style="width:100%;margin-top:6px;padding:9px">AZZERA</button>';
 p.querySelector('#td-start').onclick=start;p.querySelector('#td-down').onclick=download;p.querySelector('#td-reset').onclick=reset;
}

render();
if(state.running)setTimeout(step,WAIT);
})();