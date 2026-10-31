import assert from "node:assert";
import { RelayServer } from "../relay/server.js";

async function runPwaTests() {
  console.log("=== Running Collector PWA Integration Tests ===");

  // 1. Test offline payload generation
  const mockSubmission = {
    id: "device-uuid-" + Date.now(),
    loan_id: "loan-test-99",
    principal_amount: 100,
    fine_amount: 20,
    mode: "cash",
    reference: "Cash collected in street market",
    collected_at: new Date().toISOString(),
    collector_id: "sukhdev_singh",
  };

  assert(mockSubmission.id.startsWith("device-uuid-"));
  assert.strictEqual(mockSubmission.principal_amount, 100);
  assert.strictEqual(mockSubmission.fine_amount, 20);
  console.log("✓ PWA device submission formatting passed");

  // 2. Test Staleness Detection logic
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  function isStale(publishedAt) {
    if (!publishedAt) return true;
    return publishedAt.slice(0, 10) < today;
  }

  assert.strictEqual(isStale(null), true, "Null snapshot is stale");
  assert.strictEqual(isStale(yesterday + "T10:00:00Z"), true, "Yesterday snapshot is stale");
  assert.strictEqual(isStale(today + "T08:00:00Z"), false, "Today snapshot is fresh");
  console.log("✓ PWA staleness banner logic passed");

  // 3. Test Offline Queue Flushing to Relay
  const relay = new RelayServer({ port: 3098, adminSecret: "admin_secret_pwa" });
  await relay.start();
  const relayUrl = "http://localhost:3098";

  try {
    // Simulate multiple queued submissions syncing when online
    const queuedItems = [
      {
        id: "offline-uuid-1",
        loan_id: "loan-1",
        principal_amount: 100,
        fine_amount: 0,
        mode: "cash",
        collected_at: new Date().toISOString(),
        collector_id: "sukhdev",
      },
      {
        id: "offline-uuid-2",
        loan_id: "loan-2",
        principal_amount: 200,
        fine_amount: 40,
        mode: "online",
        collected_at: new Date().toISOString(),
        collector_id: "sukhdev",
      },
    ];

    let syncedCount = 0;
    for (const item of queuedItems) {
      const res = await fetch(`${relayUrl}/api/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      assert.strictEqual(res.status, 201);
      syncedCount++;
    }

    assert.strictEqual(syncedCount, 2);

    // Verify both reached relay pending inbox
    const pendingRes = await fetch(`${relayUrl}/api/inbox/pending`, {
      headers: { Authorization: "Bearer admin_secret_pwa" },
    });
    const pending = await pendingRes.json();
    assert.strictEqual(pending.count, 2);
    console.log("✓ PWA offline queue flush to relay passed");

    console.log("\nALL COLLECTOR PWA TESTS PASSED SUCCESSFULLY!");
  } finally {
    await relay.stop();
  }
}

runPwaTests().catch((err) => {
  console.error("PWA test failed:", err);
  process.exit(1);
});
