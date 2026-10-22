import test from "node:test";
import assert from "node:assert/strict";

import { createAdminSessionController } from "../../src/admin/auth/session-controller.mjs";

test("ignores duplicate auth events for the initialized user", async () => {
  let authChange;
  let accessRefreshes = 0;
  const state = {};
  const controller = createAdminSessionController({
    elements: {},
    repository: {
      authSupported: true,
      getCurrentUser: async () => ({ id: "user-1" }),
      getSalonAccess: async () => ({ allowed: true, role: "owner", staffId: null }),
      onAuthChange: (callback) => { authChange = callback; },
    },
    security: {},
    state,
    t: (key) => key,
    onAccessChanged: async () => { accessRefreshes += 1; },
    renderAuthState: () => {},
  });

  await controller.initialize();
  await authChange({ id: "user-1" });
  assert.equal(accessRefreshes, 0);

  await authChange({ id: "user-2" });
  assert.equal(accessRefreshes, 1);
  assert.equal(state.isOwner, true);
});
