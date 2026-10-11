import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogOrder,
  buildOccupiedSlotNumbers,
  createCatalogDraft,
  hasInvalidWeeklyHours,
  moveCatalogItem,
} from "../../src/settings/settings-model.mjs";

const data = {
  categories: [{ id: "cut" }, { id: "care" }],
  services: [
    { id: "men", categoryId: "cut" },
    { id: "women", categoryId: "cut" },
    { id: "wash", categoryId: "care" },
  ],
};

test("builds and reorders the service catalog without mutating its source", () => {
  const draft = createCatalogDraft(data);
  const moved = moveCatalogItem(draft, { type: "service", id: "women" }, { type: "end", categoryId: "care" });
  assert.deepEqual(draft.serviceIdsByCategory.cut, ["men", "women"]);
  assert.deepEqual(moved.serviceIdsByCategory.cut, ["men"]);
  assert.deepEqual(moved.serviceIdsByCategory.care, ["wash", "women"]);
  assert.deepEqual(buildCatalogOrder(moved), {
    categoryIds: ["cut", "care"],
    serviceIds: ["men", "wash", "women"],
    serviceCategoryIds: ["cut", "care", "care"],
  });
});

test("validates open weekly hours while allowing closed days", () => {
  assert.equal(hasInvalidWeeklyHours([{ openTime: "10:00", closeTime: "18:00", isClosed: false }]), false);
  assert.equal(hasInvalidWeeklyHours([{ openTime: "18:00", closeTime: "10:00", isClosed: false }]), true);
  assert.equal(hasInvalidWeeklyHours([{ openTime: "18:00", closeTime: "10:00", isClosed: true }]), false);
});

test("derives occupied slot options from duration", () => {
  assert.deepEqual(buildOccupiedSlotNumbers(120), [1, 2, 3, 4]);
});
