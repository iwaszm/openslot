export function listActiveServices({
  services,
  laneLayout,
  staffServiceKeys,
  defaultServiceOrder = new Map(),
  normalizeServiceId = (id) => id,
}) {
  const staffKeys = [...new Set(laneLayout.map((lane) => lane.staffKey))];
  return services
    .filter((service) => (
      service.isActive
      && service.acceptsOnline !== false
      && isServiceAssignedToOnlineStaff(service.id, staffKeys, staffServiceKeys)
    ))
    .slice()
    .sort((left, right) => compareServiceOrder(
      left,
      right,
      defaultServiceOrder,
      normalizeServiceId,
    ));
}

export function buildStaffOptions({ laneLayout, services, staffServiceKeys }) {
  const byStaff = new Map();
  laneLayout.forEach((lane) => {
    if (byStaff.has(lane.staffKey)) return;
    byStaff.set(lane.staffKey, {
      staffKey: lane.staffKey,
      name: lane.staffName || lane.staffShortName || lane.staffKey,
      shortName: lane.staffShortName || lane.staffName || lane.staffKey,
      color: lane.staffColor || "#d7ef57",
      serviceIds: [],
    });
  });

  if (staffServiceKeys) {
    byStaff.forEach((employee) => {
      employee.serviceIds = services
        .filter((service) => staffServiceKeys.has(`${employee.staffKey}:${service.id}`))
        .map((service) => service.id);
    });
  }

  return [...byStaff.values()].filter((employee) => (
    !staffServiceKeys || employee.serviceIds.length > 0
  ));
}

export function groupServicesByCategory({
  services,
  categoryOrder,
  categoryLabels,
  getCategoryLabel,
  fallbackLabel,
}) {
  const byCategory = new Map(categoryOrder.map((category) => [
    category,
    { category, label: categoryLabels[category], services: [] },
  ]));

  services.forEach((service) => {
    const category = service.category || "care";
    if (!byCategory.has(category)) {
      byCategory.set(category, {
        category,
        label: categoryLabels[category] || fallbackLabel,
        services: [],
      });
    }
    byCategory.get(category).services.push(service);
  });

  return [...byCategory.values()]
    .filter((group) => group.services.length > 0)
    .map((group) => ({
      ...group,
      label: getCategoryLabel(group.services[0], group.category),
      sortOrder: group.services[0]?.categorySortOrder ?? 999,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function isServiceAssignedToOnlineStaff(serviceId, staffKeys, staffServiceKeys) {
  if (!staffServiceKeys) return true;
  return staffKeys.some((staffKey) => staffServiceKeys.has(`${staffKey}:${serviceId}`));
}

function compareServiceOrder(left, right, defaultServiceOrder, normalizeServiceId) {
  const leftCategory = Number.isFinite(left.categorySortOrder) ? left.categorySortOrder : 999;
  const rightCategory = Number.isFinite(right.categorySortOrder) ? right.categorySortOrder : 999;
  const leftService = Number.isFinite(left.sortOrder)
    ? left.sortOrder
    : defaultServiceOrder.get(normalizeServiceId(left.id)) ?? 999;
  const rightService = Number.isFinite(right.sortOrder)
    ? right.sortOrder
    : defaultServiceOrder.get(normalizeServiceId(right.id)) ?? 999;
  return (leftCategory - rightCategory)
    || (leftService - rightService)
    || left.name.localeCompare(right.name);
}
