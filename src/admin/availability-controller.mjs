export function createAvailabilityController({
  elements,
  closeServiceMenus,
  onCreateTimeBlock,
  onDeleteTimeBlock,
  onRenderTimeControls,
  onToggleDayBlock,
}) {
  const { availabilityPanel, availabilityToggle, dayBlockButton, existingTimeBlocks,
    timeBlockAction, timeBlockEnd, timeBlockPanel, timeBlockStart, timeBlockToggle } = elements;

  function closeTimePanel() {
    if (!timeBlockPanel) return;
    timeBlockPanel.hidden = true;
    timeBlockToggle?.setAttribute("aria-expanded", "false");
  }

  function toggleTimePanel() {
    if (!timeBlockPanel) return;
    const willOpen = timeBlockPanel.hidden;
    timeBlockPanel.hidden = !willOpen;
    timeBlockToggle?.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) onRenderTimeControls();
  }

  function closePanel() {
    if (!availabilityPanel) return;
    availabilityPanel.hidden = true;
    availabilityToggle?.setAttribute("aria-expanded", "false");
    closeTimePanel();
  }

  function togglePanel() {
    if (!availabilityPanel) return;
    const willOpen = availabilityPanel.hidden;
    availabilityPanel.hidden = !willOpen;
    availabilityToggle?.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      closeServiceMenus();
      onRenderTimeControls();
    } else {
      closeTimePanel();
    }
  }

  function bind() {
    availabilityToggle?.addEventListener("click", togglePanel);
    dayBlockButton?.addEventListener("click", onToggleDayBlock);
    timeBlockToggle?.addEventListener("click", toggleTimePanel);
    timeBlockStart?.addEventListener("change", onRenderTimeControls);
    timeBlockEnd?.addEventListener("change", onRenderTimeControls);
    timeBlockAction?.addEventListener("click", onCreateTimeBlock);
    existingTimeBlocks?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-unblock-time]");
      if (button) onDeleteTimeBlock(button.dataset.unblockTime);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".availability-shell")) closePanel();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || timeBlockPanel?.hidden) return;
      closeTimePanel();
      timeBlockToggle?.focus();
    });
  }

  return Object.freeze({ bind, closePanel, closeTimePanel, togglePanel, toggleTimePanel });
}
