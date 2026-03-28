async function assertOk(url, label, opts = {}) {
  const response = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "user-agent": "AfriTalentSynthetic/1.0",
      ...(opts.headers || {}),
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`${label} failed with status ${response.status}`);
  }

  return response;
}

exports.handler = async () => {
  const frontendUrl = process.env.FRONTEND_URL;
  const backendUrl = process.env.BACKEND_URL;

  if (!frontendUrl || !backendUrl) {
    throw new Error("FRONTEND_URL and BACKEND_URL must be configured for the synthetic canary.");
  }

  const summary = {
    event_type: "synthetic_summary",
    started_at: new Date().toISOString(),
    steps: [],
  };

  const runStep = async (name, fn) => {
    const started = Date.now();
    await fn();
    summary.steps.push({
      name,
      duration_ms: Date.now() - started,
      status: "ok",
    });
  };

  await runStep("frontend_root", async () => {
    const response = await assertOk(frontendUrl, "frontend_root");
    const html = await response.text();
    if (!html.toLowerCase().includes("afritalent")) {
      throw new Error("frontend_root did not include expected AfriTalent marker");
    }
  });

  await runStep("backend_health", async () => {
    const response = await assertOk(`${backendUrl}/health`, "backend_health");
    const payload = await response.json();
    if (!payload || !["ok", "degraded"].includes(payload.status)) {
      throw new Error("backend health response was not healthy");
    }
  });

  await runStep("jobs_search", async () => {
    const response = await assertOk(`${backendUrl}/api/jobs?limit=5`, "jobs_search");
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.jobs)) {
      throw new Error("jobs_search response did not include a jobs array");
    }
  });

  if (process.env.STATUS_URL) {
    await runStep("status_page", async () => {
      await assertOk(process.env.STATUS_URL, "status_page");
    });
  }

  summary.completed_at = new Date().toISOString();
  summary.duration_ms = summary.steps.reduce((total, step) => total + step.duration_ms, 0);
  console.log(JSON.stringify(summary));
};
