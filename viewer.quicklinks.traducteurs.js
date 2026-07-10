(() => {
  const BASE = "https://andric31-traductions.pages.dev";
  const LINKS = [
    ["quickWikiBtn", "/wiki/", "Wiki", `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`],
    ["quickLaboBtn", "/labo/", "Labo", `<path d="M9 3h6"/><path d="M10 3v5.25L5.35 17.1A2.6 2.6 0 0 0 7.65 21h8.7a2.6 2.6 0 0 0 2.3-3.9L14 8.25V3"/><path d="M8.35 15h7.3"/><path d="M10 18h4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`],
    ["quickBlogBtn", "/blog/", "Blog", `<path d="M4 6.25A2.25 2.25 0 0 1 6.25 4h11.5A2.25 2.25 0 0 1 20 6.25v11.5A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75z"/><path d="M7.5 8h9"/><path d="M7.5 12h9"/><path d="M7.5 16h5"/><circle cx="16.75" cy="16.25" r=".9" fill="currentColor" stroke="none"/>`],
    ["quickTicketBtn", "/ticket/", "Ticket", `<path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16v-2a2 2 0 0 0 0-4V8A1.5 1.5 0 0 1 5 6.5Z"/><path d="M9 10h6"/><path d="M9 14h6"/>`],
    ["quickMessagesBtn", "/messages/", "Messages", `<path d="M6.25 6.25h11.5A2.25 2.25 0 0 1 20 8.5v6a2.25 2.25 0 0 1-2.25 2.25H11l-4.75 3v-3H6.25A2.25 2.25 0 0 1 4 14.5v-6a2.25 2.25 0 0 1 2.25-2.25Z"/><path d="M8 10.5h8"/><path d="M8 13.5h5.5"/>`],
    ["quickEventsBtn", "/evenements/", "Événements", `<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 10h16"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 17h.01"/><path d="M12 17h.01"/>`],
    ["quickNotificationsBtn", "/notifications/", "Notifications", `<path d="M15 18H5.75A1.75 1.75 0 0 1 4 16.25c0-.55.27-1.07.72-1.39l.73-.53a2.5 2.5 0 0 0 1.05-2.03V10a5.5 5.5 0 1 1 11 0v2.3a2.5 2.5 0 0 0 1.05 2.03l.73.53c.45.32.72.84.72 1.39A1.75 1.75 0 0 1 18.25 18H17"/><path d="M9.5 18a2.5 2.5 0 0 0 5 0"/>`],
  ];

  function svg(paths){
    return `<span class="header-icon-svg"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg></span>`;
  }

  function makeLink(id, path, label, paths, refClass){
    const a=document.createElement('a');
    a.id=id;
    a.href=BASE+path;
    a.target='_blank';
    a.rel='noopener noreferrer';
    a.className=`${refClass} header-icon-link header-icon-link--quick traducteurs-main-link`;
    a.title=`${label} - andric31`;
    a.setAttribute('aria-label', `${label} - andric31`);
    a.innerHTML=svg(paths);
    return a;
  }

  function addLinks(){
    if(document.getElementById('quickWikiBtn')) return;
    const anchor = document.getElementById('hamburgerBtnViewer') || document.getElementById('hamburgerBtn') || document.querySelector('.hamburger-btn');
    if(!anchor) return;
    const refClass = Array.from(anchor.classList || []).find(c => c.endsWith('-btn')) || 'hamburger-btn';
    let after = anchor;
    for(const item of LINKS){
      const el=makeLink(item[0], item[1], item[2], item[3], refClass);
      after.insertAdjacentElement('afterend', el);
      after=el;
    }
  }

  function addThemeCss(){
    if(document.getElementById('traducteursQuicklinksPatch')) return;
    const style=document.createElement('style');
    style.id='traducteursQuicklinksPatch';
    style.textContent=`
      .traducteurs-main-link{display:inline-flex;align-items:center;justify-content:center;}
      .traducteurs-main-link:hover{color:var(--primary, #58a6ff);}
      html.viewer-rating-hidden #ratingBox,
      html.viewer-rating-hidden #statRatingWrap,
      html.viewer-rating-hidden .stat-icon-rating,
      html.viewer-rating-hidden .stat-icon-rating + span{display:none!important;}
      html.viewer-rating-hidden .card-stat:has(.stat-icon-rating){display:none!important;}
      #ratingBox,#statRatingWrap{display:none!important;}
    `;
    document.head.appendChild(style);
  }


  function removeRatingElements(){
    document.querySelectorAll('#ratingBox,#statRatingWrap').forEach(el => el.remove());
    document.querySelectorAll('.stat-icon-rating').forEach(icon => {
      const stat = icon.closest('.card-stat,.statsItem');
      if(stat) stat.remove();
    });
  }

  function removeRatingSort(){
    document.querySelectorAll('option[value*="rating"], option[value*="note"], option[data-rating-sort]').forEach(o => o.remove());
  }

  document.documentElement.classList.add('viewer-rating-hidden');
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', () => { addThemeCss(); addLinks(); removeRatingSort(); removeRatingElements(); setInterval(removeRatingElements, 800); });
  } else {
    addThemeCss(); addLinks(); removeRatingSort(); removeRatingElements(); setInterval(removeRatingElements, 800);
  }
})();
