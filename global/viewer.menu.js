"use strict";

(function(){
  const state = {
    items: [],
    pop: null,
    btns: [],
    open: false
  };

  function setAria(expanded){
    for(const b of state.btns){
      b.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
    if (state.pop){
      state.pop.setAttribute("aria-hidden", expanded ? "false" : "true");
    }
  }

  function closeMenu(){
    if(!state.pop) return;
    state.open = false;
    state.pop.classList.add("hidden");
    setAria(false);
  }

  function buildMenu(){
    const pop = state.pop;
    if(!pop) return;
    pop.innerHTML = "";

    const items = [...state.items].sort((a,b)=>(a.order??999)-(b.order??999));

    for(const it of items){
      if(!it) continue;

      if(it.type === "sep"){
        const d = document.createElement("div");
        d.className = "menu-sep";
        pop.appendChild(d);
        continue;
      }

      const a = document.createElement("a");
      a.className = "menu-item";
      a.href = it.href || "#";
      a.textContent = it.label || "Lien";
      if(it.title) a.title = it.title;

      a.addEventListener("click", ()=> closeMenu());
      pop.appendChild(a);
    }
  }

  function openMenu(){
    if(!state.pop) return;
    buildMenu();
    state.open = true;
    state.pop.classList.remove("hidden");
    setAria(true);
  }

  function toggleMenu(){
    state.open ? closeMenu() : openMenu();
  }

  function init(){
    state.pop = document.getElementById("topMenuPopover");
    if(!state.pop) return;

    // ✅ 2 boutons possibles
    const b1 = document.getElementById("hamburgerBtn");
    const b2 = document.getElementById("hamburgerBtnGame");
    state.btns = [b1, b2].filter(Boolean);

    for(const b of state.btns){
      b.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        toggleMenu();
      });
    }

    // click dehors
    document.addEventListener("click", (e)=>{
      if(!state.open) return;
      const t = e.target;
      if(state.pop.contains(t)) return;
      for(const b of state.btns){
        if(b.contains(t)) return;
      }
      closeMenu();
    });

    // ESC
    document.addEventListener("keydown", (e)=>{
      if(!state.open) return;
      if(e.key === "Escape") closeMenu();
    });

    // état initial
    closeMenu();
  }

  // API (modules)
  window.ViewerMenu = {
    register(item){ state.items.push(item); }
  };

  // ✅ items de base : Accueil en 1er
  // /global/ => accueil du site = "/"
  window.ViewerMenu.register({ label:"🏠 Accueil", href:"/", order:10, title:"Accueil" });

  document.addEventListener("DOMContentLoaded", init);
})();
