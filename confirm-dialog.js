(function initializeOpenSlotConfirmDialog() {
  let dialog = null;
  let activeResolve = null;

  function ensureDialog() {
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("aria-labelledby", "confirmDialogTitle");
    dialog.setAttribute("aria-describedby", "confirmDialogMessage");
    dialog.innerHTML = `
      <form class="confirm-dialog-panel" method="dialog">
        <div class="confirm-dialog-copy">
          <h2 id="confirmDialogTitle"></h2>
          <p id="confirmDialogMessage"></p>
        </div>
        <div class="confirm-dialog-actions">
          <button class="confirm-dialog-cancel" type="submit" value="cancel">Abbrechen</button>
          <button class="confirm-dialog-submit" type="submit" value="confirm">Bestätigen</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close("cancel");
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close("cancel");
    });
    dialog.addEventListener("close", () => {
      const resolve = activeResolve;
      activeResolve = null;
      resolve?.(dialog.returnValue === "confirm");
    });

    return dialog;
  }

  function ask({
    title = "Bitte bestätigen",
    message,
    confirmLabel = "Bestätigen",
    cancelLabel = "Abbrechen",
    tone = "danger",
  }) {
    const currentDialog = ensureDialog();
    if (currentDialog.open) return Promise.resolve(false);

    currentDialog.returnValue = "cancel";
    currentDialog.dataset.tone = tone;
    currentDialog.querySelector("#confirmDialogTitle").textContent = title;
    currentDialog.querySelector("#confirmDialogMessage").textContent = message;
    currentDialog.querySelector(".confirm-dialog-submit").textContent = confirmLabel;
    currentDialog.querySelector(".confirm-dialog-cancel").textContent = cancelLabel;

    return new Promise((resolve) => {
      activeResolve = resolve;
      currentDialog.showModal();
      requestAnimationFrame(() => currentDialog.querySelector(".confirm-dialog-cancel")?.focus());
    });
  }

  window.OpenSlotConfirm = { ask };
})();
