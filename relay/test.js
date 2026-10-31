import { RelayServer } from "./server.js";
import assert from "node:assert";

async function runTests() {
  console.log("=== Running Relay Integration Tests ===");
  const server = new RelayServer({ port: 3099, adminSecret: "test_secret_123" });
  await server.start();
  const baseUrl = "http://localhost:3099";

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    const health = await healthRes.json();
    assert.strictEqual(health.status, "ok");
    console.log("✓ Health check passed");

    // 2. Collector Login
    const loginRes = await fetch(`${baseUrl}/api/collector/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "sukhdev" }),
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.success, true);
    assert.strictEqual(loginData.username, "sukhdev");
    console.log("✓ Collector login passed");

    // 3. Outbox Snapshot publish (Admin auth check)
    const unauthSnapRes = await fetch(`${baseUrl}/api/outbox/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_loans: [] }),
    });
    assert.strictEqual(unauthSnapRes.status, 401, "Unauthenticated snapshot push must be 401");

    const authSnapRes = await fetch(`${baseUrl}/api/outbox/snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test_secret_123",
      },
      body: JSON.stringify({
        active_loans: [
          {
            loan_id: "loan-test-1",
            name: "Harpreet Singh",
            photo: null,
            locality: "Majitha Road, Amritsar",
            phone_last4: "9876",
            assigned_collector: "sukhdev",
            lookahead: [
              { date: "2026-11-01", principal_due: 100, fine_due: 0, is_prepaid: false },
              { date: "2026-11-02", principal_due: 100, fine_due: 20, is_prepaid: false },
            ],
          },
        ],
      }),
    });
    assert.strictEqual(authSnapRes.status, 200);
    const snapData = await authSnapRes.json();
    assert.strictEqual(snapData.loan_count, 1);
    console.log("✓ Snapshot publishing (admin authenticated) passed");

    // 4. Collector fetches snapshot
    const getSnapRes = await fetch(`${baseUrl}/api/outbox/snapshot`);
    const fetchedSnap = await getSnapRes.json();
    assert.strictEqual(fetchedSnap.active_loans.length, 1);
    assert.strictEqual(fetchedSnap.active_loans[0].phone_last4, "9876");
    console.log("✓ Collector fetching read-only snapshot passed");

    // 5. Collector submits payment to inbox
    const submissionId = "sub-uuid-12345";
    const subRes1 = await fetch(`${baseUrl}/api/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: submissionId,
        loan_id: "loan-test-1",
        principal_amount: 100,
        fine_amount: 20,
        mode: "cash",
        collected_at: "2026-11-01T10:00:00.000Z",
        collector_id: "sukhdev",
      }),
    });
    assert.strictEqual(subRes1.status, 201);
    const subData1 = await subRes1.json();
    assert.strictEqual(subData1.status, "queued");
    assert(subData1.submission.received_at, "Server must assign received_at timestamp");
    console.log("✓ Collector payment submission with server received_at passed");

    // 6. Idempotency test: Retry same UUID
    const subRes2 = await fetch(`${baseUrl}/api/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: submissionId,
        loan_id: "loan-test-1",
        principal_amount: 100,
        fine_amount: 20,
        mode: "cash",
        collected_at: "2026-11-01T10:00:00.000Z",
        collector_id: "sukhdev",
      }),
    });
    assert.strictEqual(subRes2.status, 200);
    const subData2 = await subRes2.json();
    assert.strictEqual(subData2.status, "already_queued");
    console.log("✓ Submission idempotency on duplicate UUID passed");

    // 7. Desktop pulls pending submissions
    const pullRes = await fetch(`${baseUrl}/api/inbox/pending`, {
      headers: { Authorization: "Bearer test_secret_123" },
    });
    const pullData = await pullRes.json();
    assert.strictEqual(pullData.count, 1);
    assert.strictEqual(pullData.submissions[0].id, submissionId);
    console.log("✓ Desktop admin inbox pull passed");

    // 8. Desktop acknowledges and purges from inbox (ack-then-delete protocol)
    const ackRes = await fetch(`${baseUrl}/api/inbox/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test_secret_123",
      },
      body: JSON.stringify({ submission_ids: [submissionId] }),
    });
    const ackData = await ackRes.json();
    assert.strictEqual(ackData.acknowledged_count, 1);

    // Verify inbox is now empty
    const pullRes2 = await fetch(`${baseUrl}/api/inbox/pending`, {
      headers: { Authorization: "Bearer test_secret_123" },
    });
    const pullData2 = await pullRes2.json();
    assert.strictEqual(pullData2.count, 0, "Inbox must be empty after acknowledgment");
    console.log("✓ Ack-then-delete protocol and retention passed");

    console.log("\nALL RELAY INTEGRATION TESTS PASSED SUCCESSFULLY!");
  } finally {
    await server.stop();
  }
}

runTests().catch((err) => {
  console.error("Relay test failure:", err);
  process.exit(1);
});
