(() => {
  const runtime = Object.freeze({
    environment: "template",
    dataSource: "local",
    namespace: "openslot.template.preview.v2",
  });

  Object.defineProperty(window, "OPENSLOT_RUNTIME", {
    value: runtime,
    configurable: false,
    writable: false,
  });
  window.OPENSLOT_LOCAL_STORAGE_NAMESPACE = runtime.namespace;
})();
