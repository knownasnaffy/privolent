// Loan Collector Thin Online Relay Service (ADR-001)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PWA_DIR = path.resolve(__dirname, "../collector-pwa");

export class RelayServer {
  constructor(options = {}) {
    this.port = options.port || 3001;
    this.adminSecret = options.adminSecret || process.env.RELAY_ADMIN_SECRET || "admin_relay_secret_2026";
    this.retentionDays = options.retentionDays || 30;

    // In-memory data stores (with UUID index)
    this.inbox = new Map(); // id -> submission (pending)
    this.acknowledged = new Map(); // id -> submission (archived for retention window)
    this.latestSnapshot = null;
    this.collectors = new Map(); // username -> { active: boolean }

    // Seed default collectors for test/dev
    this.collectors.set("collector1", { active: true });
    this.collectors.set("sukhdev_singh", { active: true });

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        resolve(this.port);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(resolve);
    });
  }

  async parseJson(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }

  sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Collector-Id",
    });
    res.end(JSON.stringify(data));
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Collector-Id",
      });
      return res.end();
    }

    try {
      // 1. Collector Auth
      if (req.method === "POST" && pathname === "/api/collector/login") {
        const body = await this.parseJson(req);
        const username = body.username?.trim();
        if (!username) {
          return this.sendJson(res, 400, { error: "Username required" });
        }
        // In relay, any active collector can log in
        this.collectors.set(username, { active: true });
        return this.sendJson(res, 200, {
          success: true,
          username,
          token: `collector_token_${username}`,
        });
      }

      // 2. Collector Submission to Inbox (PWA -> Relay)
      // ADR-001: UUID is idempotency key; server sets received_at.
      if (req.method === "POST" && pathname === "/api/inbox") {
        const body = await this.parseJson(req);
        const {
          id,
          loan_id,
          principal_amount,
          fine_amount,
          mode,
          reference,
          collected_at,
          collector_id,
        } = body;

        if (!id || !loan_id || principal_amount === undefined) {
          return this.sendJson(res, 400, {
            error: "Missing required fields (id, loan_id, principal_amount)",
          });
        }

        // Idempotency check: if already processed or pending, return existing without duplicate
        if (this.inbox.has(id)) {
          return this.sendJson(res, 200, {
            success: true,
            status: "already_queued",
            submission: this.inbox.get(id),
          });
        }
        if (this.acknowledged.has(id)) {
          return this.sendJson(res, 200, {
            success: true,
            status: "already_acknowledged",
            submission: this.acknowledged.get(id),
          });
        }

        const received_at = new Date().toISOString();
        const submission = {
          id,
          loan_id,
          principal_amount: Number(principal_amount),
          fine_amount: Number(fine_amount || 0),
          mode: mode || "cash",
          reference: reference || null,
          collected_at: collected_at || received_at,
          collector_id: collector_id || "field_collector",
          received_at,
        };

        this.inbox.set(id, submission);
        return this.sendJson(res, 201, {
          success: true,
          status: "queued",
          submission,
        });
      }

      // 3. Desktop Admin Pull Protocol (Relay -> Desktop)
      if (req.method === "GET" && pathname === "/api/inbox/pending") {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${this.adminSecret}`) {
          return this.sendJson(res, 401, { error: "Unauthorized admin access" });
        }

        const pending = Array.from(this.inbox.values());
        return this.sendJson(res, 200, {
          success: true,
          count: pending.length,
          submissions: pending,
        });
      }

      // 4. Desktop Admin Acknowledge and Purge (Ack-then-delete protocol)
      if (req.method === "POST" && pathname === "/api/inbox/ack") {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${this.adminSecret}`) {
          return this.sendJson(res, 401, { error: "Unauthorized admin access" });
        }

        const body = await this.parseJson(req);
        const ids = body.submission_ids || [];
        let acknowledgedCount = 0;
        const now = new Date().toISOString();

        for (const id of ids) {
          if (this.inbox.has(id)) {
            const item = this.inbox.get(id);
            this.inbox.delete(id);
            // Move to acknowledged store with retention timestamp
            item.acknowledged_at = now;
            this.acknowledged.set(id, item);
            acknowledgedCount++;
          }
        }

        return this.sendJson(res, 200, {
          success: true,
          acknowledged_count: acknowledgedCount,
        });
      }

      // 5. Admin Publish Snapshot to Outbox (Desktop -> Relay)
      if (req.method === "POST" && pathname === "/api/outbox/snapshot") {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${this.adminSecret}`) {
          return this.sendJson(res, 401, { error: "Unauthorized admin access" });
        }

        const body = await this.parseJson(req);
        this.latestSnapshot = {
          published_at: new Date().toISOString(),
          active_loans: body.active_loans || [],
        };

        return this.sendJson(res, 200, {
          success: true,
          published_at: this.latestSnapshot.published_at,
          loan_count: this.latestSnapshot.active_loans.length,
        });
      }

      // 6. Collector Fetch Read-Only Snapshot from Outbox (Relay -> PWA)
      if (req.method === "GET" && pathname === "/api/outbox/snapshot") {
        if (!this.latestSnapshot) {
          return this.sendJson(res, 200, {
            published_at: null,
            active_loans: [],
            message: "No snapshot published yet",
          });
        }
        return this.sendJson(res, 200, this.latestSnapshot);
      }

      // 7. Serve Collector PWA statically for convenience
      if (pathname === "/collector" || pathname.startsWith("/collector/")) {
        let subpath = pathname.replace(/^\/collector\/?/, "");
        if (!subpath || subpath === "") {
          subpath = "index.html";
        }
        const filePath = path.join(PWA_DIR, subpath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          const mimeTypes = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".json": "application/json",
            ".css": "text/css",
            ".png": "image/png",
            ".svg": "image/svg+xml",
          };
          const contentType = mimeTypes[ext] || "text/plain";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
          });
          return res.end(fs.readFileSync(filePath));
        }
      }

      // Health check endpoint
      if (pathname === "/health" || pathname === "/") {
        return this.sendJson(res, 200, {
          status: "ok",
          service: "Loan Collector Online Relay",
          inbox_count: this.inbox.size,
          has_snapshot: this.latestSnapshot !== null,
        });
      }

      return this.sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("Relay server error:", err);
      return this.sendJson(res, 500, { error: "Internal server error" });
    }
  }
}

// Standalone execution if run via CLI: `node relay/server.js`
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const port = process.env.PORT || 3001;
  const server = new RelayServer({ port });
  server.start().then(() => {
    console.log(`Loan Collector Relay listening on http://localhost:${port}`);
  });
}
