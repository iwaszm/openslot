(() => {
  const repository = window.OpenSlotLocalRepository;
  const form = document.getElementById("profileSettingsForm");
  const message = document.getElementById("profileMessage");
  const showToast = (text) => window.OpenSlotSettingsToast?.(text);
  const languages = [["de", "Deutsch"], ["en", "English"], ["zh", "中文"]];
  const applyTheme = (preset, color) => {
    document.documentElement.dataset.shopTheme = preset;
    document.documentElement.style.setProperty("--shop-accent", color);
  };
  [1, 2, 3].forEach((position) => { document.getElementById(`profileLanguage${position}`).innerHTML = languages.map(([value, label]) => `<option value="${value}">${label}</option>`).join(""); });
  function render() {
    const profile = repository.getShopProfile();
    document.getElementById("profileName").value = profile.name;
    document.getElementById("profileAddress").value = profile.address;
    document.getElementById("profilePhone").value = profile.phone;
    const themeInput = form.querySelector(`[name="profileTheme"][value="${profile.themePreset}"]`);
    if (themeInput) themeInput.checked = true;
    applyTheme(profile.themePreset, profile.themeColor);
    profile.languages.forEach((language, index) => { document.getElementById(`profileLanguage${index + 1}`).value = language; });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault(); const selectedLanguages = [1, 2, 3].map((position) => document.getElementById(`profileLanguage${position}`).value);
    if (new Set(selectedLanguages).size !== 3) { showToast("Jede Sprache darf nur einmal gewählt werden."); return; }
    try {
      repository.saveShopProfile({ name: document.getElementById("profileName").value, address: document.getElementById("profileAddress").value, phone: document.getElementById("profilePhone").value, themePreset: form.querySelector('[name="profileTheme"]:checked')?.value, languages: selectedLanguages });
      showToast("Shopprofil wurde lokal gespeichert.");
    } catch (error) { showToast(error.message); }
  });
  document.getElementById("resetProfile").addEventListener("click", () => { render(); showToast("Nicht gespeicherte Änderungen wurden verworfen."); });
  form.querySelectorAll('[name="profileTheme"]').forEach((input) => input.addEventListener("change", () => {
    const colors = { lime: "#dfff2f", pink: "#ff7cb8", glacier: "#67cbef" };
    applyTheme(input.value, colors[input.value]);
  }));
  repository.subscribe("shop-profile", render); render();
})();
