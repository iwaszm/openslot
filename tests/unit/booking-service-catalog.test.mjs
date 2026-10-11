import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStaffOptions,
  groupServicesByCategory,
  listActiveServices,
} from "../../src/booking/service-catalog.mjs";

const lanes = [
  { laneKey: "a", staffKey: "linda", staffName: "Linda", staffColor: "#111111" },
  { laneKey: "b", staffKey: "linda", staffName: "Linda", staffColor: "#111111" },
  { laneKey: "c", staffKey: "tony", staffName: "Tony", staffColor: "#222222" },
];

test("shows only active online services assigned to online staff", () => {
  const result = listActiveServices({
    services: [
      { id: "cut", name: "Cut", isActive: true, acceptsOnline: true, sortOrder: 2 },
      { id: "color", name: "Color", isActive: true, acceptsOnline: false, sortOrder: 1 },
      { id: "perm", name: "Perm", isActive: false, acceptsOnline: true, sortOrder: 3 },
    ],
    laneLayout: lanes,
    staffServiceKeys: new Set(["linda:cut"]),
  });

  assert.deepEqual(result.map((service) => service.id), ["cut"]);
});

test("uses category and service sort order from settings", () => {
  const result = listActiveServices({
    services: [
      { id: "second", name: "Second", isActive: true, acceptsOnline: true, categorySortOrder: 1, sortOrder: 2 },
      { id: "first", name: "First", isActive: true, acceptsOnline: true, categorySortOrder: 1, sortOrder: 1 },
      { id: "last", name: "Last", isActive: true, acceptsOnline: true, categorySortOrder: 2, sortOrder: 1 },
    ],
    laneLayout: lanes,
    staffServiceKeys: null,
  });

  assert.deepEqual(result.map((service) => service.id), ["first", "second", "last"]);
});

test("builds one employee option per staff member with assigned services", () => {
  const staff = buildStaffOptions({
    laneLayout: lanes,
    services: [{ id: "cut" }, { id: "color" }],
    staffServiceKeys: new Set(["linda:cut", "tony:color"]),
  });

  assert.deepEqual(staff.map((employee) => ({
    key: employee.staffKey,
    services: employee.serviceIds,
  })), [
    { key: "linda", services: ["cut"] },
    { key: "tony", services: ["color"] },
  ]);
});

test("groups services using category settings order and translated labels", () => {
  const groups = groupServicesByCategory({
    services: [
      { id: "care", category: "care", categorySortOrder: 2 },
      { id: "cut", category: "cut", categorySortOrder: 1 },
    ],
    categoryOrder: ["cut", "care"],
    categoryLabels: { cut: "Schnitt", care: "Pflege" },
    getCategoryLabel: (_service, category) => category === "cut" ? "Cuts" : "Care",
    fallbackLabel: "Services",
  });

  assert.deepEqual(groups.map((group) => group.label), ["Cuts", "Care"]);
});
