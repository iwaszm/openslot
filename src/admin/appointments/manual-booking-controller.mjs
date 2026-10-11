export function createManualBookingController({ elements, handlers }) {
  let entry = null;
  let context = null;
  let requestId = 0;

  function bind() {
    elements.add?.addEventListener("click", () => handlers.open());
    elements.form?.addEventListener("submit", handlers.submit);
    elements.employee?.addEventListener("change", () => {
      handlers.setCategories();
      handlers.renderServices();
      handlers.renderTimes({ filterByService: false });
      handlers.updateSubmit();
    });
    elements.category?.addEventListener("change", () => {
      handlers.renderServices({ filterByTime: Boolean(elements.start.value) });
      handlers.renderTimes({ preferred: Number(elements.start.value), filterByService: false });
      handlers.updateSubmit();
    });
    elements.service?.addEventListener("change", () => {
      handlers.renderTimes({ preferred: Number(elements.start.value), filterByService: Boolean(elements.service.value) });
      handlers.updateSubmit();
    });
    elements.start?.addEventListener("change", () => {
      handlers.renderServices({ preferred: elements.service.value, filterByTime: Boolean(elements.start.value) });
      handlers.updateSubmit();
    });
    elements.date?.addEventListener("change", () => handlers.loadDate());
  }

  return Object.freeze({
    bind,
    get entry() { return entry; },
    set entry(value) { entry = value; },
    get context() { return context; },
    set context(value) { context = value; },
    nextRequest() { requestId += 1; return requestId; },
    isCurrentRequest(value) { return requestId === value; },
    clear() { entry = null; context = null; },
  });
}
