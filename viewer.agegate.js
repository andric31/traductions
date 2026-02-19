// viewer.agegate.js
(function () {
  const KEY = "ageVerified";
  const gate = document.getElementById("age-gate");
  if (!gate) return;

  if (!localStorage.getItem(KEY)) {
    gate.style.display = "flex";
    document.body.classList.add("age-gate-active");
    document.body.style.overflow = "hidden";
  }

  document.getElementById("age-yes")?.addEventListener("click", () => {
    localStorage.setItem(KEY, "true");
    gate.remove();
    document.body.classList.remove("age-gate-active");
    document.body.style.overflow = "";
  });

  document.getElementById("age-no")?.addEventListener("click", () => {
    window.location.href = "https://www.google.com";
  });
})();
