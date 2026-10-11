export function createCatalogDraft(data) {
  const categoryIds = data.categories.map((category) => category.id);
  return {
    categoryIds,
    serviceIdsByCategory: Object.fromEntries(categoryIds.map((id) => [
      id,
      data.services.filter((service) => service.categoryId === id).map((service) => service.id),
    ])),
  };
}

export function findServiceCategory(draft, serviceId) {
  return draft.categoryIds.find((categoryId) => draft.serviceIdsByCategory[categoryId]?.includes(serviceId));
}

export function getDefaultServiceColor(data, categoryId) {
  return data.services.find((service) => service.categoryId === categoryId)?.color || "#dfeee8";
}

export function getAssignedServiceIds(assignments, staffId) {
  return new Set(assignments
    .filter((assignment) => assignment.staffId === staffId && assignment.isActive)
    .map((assignment) => assignment.serviceId));
}

export function moveCatalogItem(draft, source, target) {
  const next = structuredClone(draft);
  if (!target || source.id === target.itemId) return next;
  if (source.type === "category") {
    if (target.type !== "category") return next;
    const from = next.categoryIds.indexOf(source.id);
    const to = next.categoryIds.indexOf(target.itemId);
    if (from < 0 || to < 0) return next;
    next.categoryIds.splice(from, 1);
    next.categoryIds.splice(to, 0, source.id);
    return next;
  }

  Object.values(next.serviceIdsByCategory).forEach((ids) => {
    const index = ids.indexOf(source.id);
    if (index >= 0) ids.splice(index, 1);
  });
  const targetIds = next.serviceIdsByCategory[target.categoryId];
  if (!targetIds) return draft;
  const targetIndex = target.type === "service" ? targetIds.indexOf(target.itemId) : targetIds.length;
  targetIds.splice(targetIndex < 0 ? targetIds.length : targetIndex, 0, source.id);
  return next;
}

export function buildCatalogOrder(draft) {
  const serviceIds = [];
  const serviceCategoryIds = [];
  draft.categoryIds.forEach((categoryId) => {
    (draft.serviceIdsByCategory[categoryId] || []).forEach((serviceId) => {
      serviceIds.push(serviceId);
      serviceCategoryIds.push(categoryId);
    });
  });
  return { categoryIds: [...draft.categoryIds], serviceIds, serviceCategoryIds };
}

export function buildTimeOptions() {
  return Array.from({ length: 48 }, (_, index) => {
    const hours = String(Math.floor(index / 2)).padStart(2, "0");
    return `${hours}:${index % 2 ? "30" : "00"}`;
  });
}

export function hasInvalidWeeklyHours(hours) {
  return hours.some((entry) => !entry.isClosed && entry.closeTime <= entry.openTime);
}

export function buildOccupiedSlotNumbers(duration) {
  return Array.from({ length: Math.max(1, Math.ceil(Number(duration || 30) / 30)) }, (_, index) => index + 1);
}
