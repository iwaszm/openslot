(() => {
  const salonBody = document.querySelector(".salon-body");
  const toggle = document.querySelector(".salon-info-toggle");
  if (!salonBody || !toggle) return;

  function syncLabel() {
    const language = window.OpenSlotI18n?.language || document.documentElement.lang || "de";
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    const labels = language.startsWith("zh")
      ? ["显示店铺信息", "收起店铺信息"]
      : language === "en"
        ? ["Show salon information", "Hide salon information"]
        : ["Saloninformationen anzeigen", "Saloninformationen verbergen"];
    toggle.setAttribute("aria-label", labels[Number(expanded)]);
  }

  function setOpen(open) {
    salonBody.classList.toggle("is-contact-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    syncLabel();
  }

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("click", (event) => {
    if (!salonBody.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
  window.addEventListener("openslot:language-change", syncLabel);
  syncLabel();
})();
