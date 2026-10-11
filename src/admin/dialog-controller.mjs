import { escapeHtml } from "../core/html.mjs";

export function createAdminDialogController({ elements, formatDate, formatTime, getItem, getLane,
  getService, onDelete, onEdit, t }) {
  let selectedItem = null;

  function bind() {
    elements.edit?.addEventListener("click", () => selectedItem && onEdit(selectedItem));
    elements.delete?.addEventListener("click", () => selectedItem && onDelete(selectedItem));
    document.querySelectorAll("[data-close-admin-dialog]").forEach((button) => {
      button.addEventListener("click", () => button.closest("dialog")?.close());
    });
  }

  function open(id, kind) {
    if (!elements.dialog || !id) return;
    const item = getItem(id, kind);
    if (!item) return;
    const service = getService(item);
    const lane = getLane(item);
    const rows = [
      [t("admin.service"), service.shortName || service.name],
      [t("common.date"), formatDate(item.date)],
      [t("common.time"), `${formatTime(item.startMinutes)}-${formatTime(item.endMinutes)}`],
      [t("admin.employee"), lane?.staffShortName || lane?.staffName || ""],
      kind === "online" ? [t("admin.customer"), item.name || ""] : [t("common.note"), item.note || item.reason || ""],
      kind === "online" ? [t("common.phone"), item.phone || ""] : null,
      kind === "online" ? [t("common.email"), item.email || ""] : null,
    ].filter((row) => row && row[1]);
    const editable = kind === "manual" && lane?.canEdit !== false;
    selectedItem = editable ? item : null;
    elements.title.textContent = service.shortName || service.name;
    elements.list.innerHTML = rows.map(([label, value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    if (elements.actions) elements.actions.hidden = !editable;
    elements.dialog.showModal();
  }

  function close() {
    selectedItem = null;
    elements.dialog?.close();
  }

  return Object.freeze({ bind, close, open });
}
