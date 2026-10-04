(() => {
  const repository = window.OpenSlotLocalRepository;
  const form = document.getElementById("profileSettingsForm");
  const message = document.getElementById("profileMessage");
  const showToast = (text) => window.OpenSlotSettingsToast?.(text);
  const applyTheme = (preset, color) => {
    document.documentElement.dataset.shopTheme = preset;
    document.documentElement.style.setProperty("--shop-accent", color);
  };
  function render() {
    const profile = repository.getShopProfile();
    document.getElementById("profileName").value = profile.name;
    document.getElementById("profileAddress").value = profile.address;
    document.getElementById("profilePhone").value = profile.phone;
    const themeInput = form.querySelector(`[name="profileTheme"][value="${profile.themePreset}"]`);
    if (themeInput) themeInput.checked = true;
    applyTheme(profile.themePreset, profile.themeColor);
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const profile = repository.getShopProfile();
    try {
      repository.saveShopProfile({ name: document.getElementById("profileName").value, address: document.getElementById("profileAddress").value, phone: document.getElementById("profilePhone").value, themePreset: form.querySelector('[name="profileTheme"]:checked')?.value, languages: profile.languages });
      showToast("Shopprofil wurde lokal gespeichert.");
    } catch (error) { showToast(error.message); }
  });
  document.getElementById("resetProfile").addEventListener("click", () => { render(); showToast("Nicht gespeicherte Änderungen wurden verworfen."); });
  form.querySelectorAll('[name="profileTheme"]').forEach((input) => input.addEventListener("change", () => {
    const colors = { lime: "#dfff2f", pink: "#fbc8bf", glacier: "#67cbef" };
    applyTheme(input.value, colors[input.value]);
  }));
  repository.subscribe("shop-profile", render); render();
})();
