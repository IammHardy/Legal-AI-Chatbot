document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("chat-container");
  const input = document.getElementById("user-message");
  const sendBtn = document.getElementById("send-btn");
  const saveBtn = document.getElementById("save-btn");
  const clearBtn = document.getElementById("clear-btn");
  const meta = document.getElementById("meta");

  // Intake report UI
  const reportBtn = document.getElementById("report-btn");
  const reportPanel = document.getElementById("report-panel");
  const reportContent = document.getElementById("report-content");
  const reportClose = document.getElementById("report-close");

  // Document tools UI
  const docFile = document.getElementById("doc-file");
  const docTitle = document.getElementById("doc-title");
  const docUpload = document.getElementById("doc-upload");
  const docStatus = document.getElementById("doc-status");

  const docSummary = document.getElementById("doc-summary");
  const docRisks = document.getElementById("doc-risks");
  const docMissing = document.getElementById("doc-missing");
  const docQuestions = document.getElementById("doc-questions");

  // Clause tools UI
  const clauseQuery = document.getElementById("clause-query");
  const clauseFind = document.getElementById("clause-find");
  const clauseAnalyze = document.getElementById("clause-analyze");
  const clauseStatus = document.getElementById("clause-status");

  if (!container || !input || !sendBtn) return;

  let isSending = false;
  let lastSentAt = 0;
  const COOLDOWN_MS = 1200;

  // Track current uploaded document
  let currentDocumentId = null;

  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function setDocButtonsEnabled(on) {
    [docSummary, docRisks, docMissing, docQuestions].forEach((btn) => {
      if (btn) btn.disabled = !on;
    });
  }

  function setTyping(on) {
    let el = document.getElementById("typing");
    if (on) {
      if (!el) {
        el = document.createElement("div");
        el.id = "typing";
        el.className = "typing";
        el.textContent = "Legal AI is typing…";
        container.appendChild(el);
      }
    } else if (el) {
      el.remove();
    }
    container.scrollTop = container.scrollHeight;
  }

  function addUserMessage(text) {
    const row = document.createElement("div");
    row.className = "row";

    const bubble = document.createElement("div");
    bubble.className = "msg you";
    bubble.textContent = text;

    const stamp = document.createElement("div");
    stamp.className = "stamp";
    stamp.textContent = timeNow();

    const wrap = document.createElement("div");
    wrap.appendChild(bubble);
    wrap.appendChild(stamp);

    row.appendChild(wrap);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  // --- Card helpers ---
  function severityClass(sev) {
    const s = String(sev || "").toLowerCase();
    if (s.includes("high") || s.includes("severe") || s.includes("critical")) return "high";
    if (s.includes("med") || s.includes("moderate")) return "med";
    if (s.includes("low") || s.includes("minor")) return "low";
    return "";
  }

  function addAICard({ title = "AI Response", body = "", badges = [], tag = null, quote = null, chips = [] }) {
    const row = document.createElement("div");
    row.className = "row";

    const wrap = document.createElement("div");
    wrap.className = "ai-cards";

    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "card-title";

    const left = document.createElement("div");
    left.textContent = title;

    const right = document.createElement("div");
    right.className = "badges";

    badges.forEach((b) => {
      const span = document.createElement("span");
      span.className = `badge ${b.kind || ""}`.trim();
      span.textContent = b.text;
      right.appendChild(span);
    });

    if (tag) {
      const t = document.createElement("span");
      t.className = `tag ${severityClass(tag)}`.trim();
      t.textContent = tag;
      right.appendChild(t);
    }

    header.appendChild(left);
    header.appendChild(right);

    const content = document.createElement("div");
    content.className = "card-body";
    content.textContent = body;

    card.appendChild(header);
    card.appendChild(content);

    if (quote) {
      const q = document.createElement("div");
      q.className = "quote";
      q.textContent = quote;
      card.appendChild(q);
    }

    if (chips && chips.length) {
      const chipWrap = document.createElement("div");
      chipWrap.className = "chips";

      chips.forEach((c) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = c.label || "Open";
        chip.addEventListener("click", () => {
          if (typeof c.onClick === "function") c.onClick();
        });
        chipWrap.appendChild(chip);
      });

      card.appendChild(chipWrap);
    }

    wrap.appendChild(card);
    row.appendChild(wrap);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  function addAIPlain(text) {
    // fallback as a simple message bubble
    const row = document.createElement("div");
    row.className = "row";

    const bubble = document.createElement("div");
    bubble.className = "msg ai";
    bubble.textContent = text;

    const stamp = document.createElement("div");
    stamp.className = "stamp";
    stamp.textContent = timeNow();

    const wrap = document.createElement("div");
    wrap.appendChild(bubble);
    wrap.appendChild(stamp);

    row.appendChild(wrap);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  // --- Chat ---
  async function sendMessage(prefill = null) {
    const message = (prefill ?? input.value).trim();
    if (!message || isSending) return;

    const now = Date.now();
    if (now - lastSentAt < COOLDOWN_MS) return;
    lastSentAt = now;

    isSending = true;
    sendBtn.disabled = true;

    addUserMessage(message);
    input.value = "";
    setTyping(true);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message })
      });

      const data = await res.json();
      setTyping(false);

      const reply = (data?.reply ? String(data.reply) : "").trim();
      if (reply) {
        addAICard({
          title: "Legal AI",
          body: reply,
          badges: data?.disclaimer ? [{ text: "Not legal advice", kind: "primary" }] : []
        });
      } else {
        addAIPlain("I didn’t catch that — could you try again?");
      }

      if (data?.disclaimer) {
        addAICard({
          title: "Disclaimer",
          body: String(data.disclaimer),
          badges: [{ text: "Info", kind: "source" }]
        });
      }

      if (data?.cta) {
        addAICard({
          title: "Next step",
          body: String(data.cta),
          badges: [{ text: "Lead capture", kind: "primary" }]
        });

        // Existing lead form insertion (keep as-is)
        const existing = document.getElementById("lead-box");
        if (existing) existing.remove();

        const box = document.createElement("div");
        box.id = "lead-box";
        box.style.cssText =
          "margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:16px";
        box.innerHTML = `
          <div style="font-weight:700;margin-bottom:8px">Request Contact</div>
          <input id="lead-name" placeholder="Your name" style="display:block;width:100%;padding:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:#eaf1ff;border-radius:999px;margin:6px 0;outline:none" />
          <input id="lead-email" placeholder="Your email" style="display:block;width:100%;padding:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:#eaf1ff;border-radius:999px;margin:6px 0;outline:none" />
          <button id="lead-submit" class="primary" style="width:100%" type="button">Submit</button>
          <div id="lead-msg" style="margin-top:8px;font-size:13px;color:rgba(234,241,255,.85)"></div>
        `;
        container.appendChild(box);
        container.scrollTop = container.scrollHeight;
      }

      if (meta && typeof data?.score !== "undefined") {
        meta.textContent = `Inquiry Score: ${data.score}`;
      }
    } catch (err) {
      setTyping(false);
      addAIPlain("Something went wrong. Please try again.");
      console.error("Chat error:", err);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // --- Intake report (download) ---
  async function generateReport() {
    if (isSending) return;

    const now = Date.now();
    if (now - lastSentAt < COOLDOWN_MS) return;
    lastSentAt = now;

    isSending = true;
    if (reportBtn) reportBtn.disabled = true;

    addAICard({ title: "Intake Report", body: "Generating intake report…" });

    try {
      const res = await fetch("/intake_report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({})
      });

      if (!res.ok) {
        addAICard({ title: "Intake Report", body: "Failed to generate report." });
        return;
      }

      const blob = await res.blob();
      const text = await blob.text();

      if (reportPanel && reportContent) {
        reportPanel.style.display = "block";
        reportContent.textContent = text;
        reportPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      const url = window.URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `intake_report_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Report error:", err);
      addAICard({ title: "Intake Report", body: "Something went wrong generating the report." });
    } finally {
      isSending = false;
      if (reportBtn) reportBtn.disabled = false;
    }
  }

  // --- Upload document ---
  async function uploadDocument() {
    if (!docFile || !docFile.files || docFile.files.length === 0) {
      alert("Choose a file first (PDF/DOCX/TXT).");
      return;
    }

    const file = docFile.files[0];
    const form = new FormData();
    form.append("file", file);
    form.append("title", (docTitle?.value || "").trim());

    if (clauseStatus) clauseStatus.textContent = "";
    if (clauseAnalyze) clauseAnalyze.disabled = true;

    if (docUpload) docUpload.disabled = true;
    if (docStatus) docStatus.textContent = "Uploading…";
    setDocButtonsEnabled(false);

    addAICard({ title: "Document", body: "Uploading document…" });

    try {
      const res = await fetch("/documents", {
        method: "POST",
        credentials: "same-origin",
        body: form
      });

      const data = await res.json();

      if (!res.ok || data.status !== "ok") {
        const msg = data?.error || "Upload failed.";
        if (docStatus) docStatus.textContent = msg;
        addAICard({ title: "Document", body: msg });
        return;
      }

      currentDocumentId = data.document.id;

      if (docStatus) {
        docStatus.textContent = `Loaded: ${data.document.filename} (${data.document.chars} chars extracted)`;
      }

      addAICard({
        title: "Document loaded",
        body: `${data.document.filename}\nReady: Summary • Risks • Missing terms • Intake questions`,
        badges: [{ text: "Ready", kind: "primary" }]
      });

      setDocButtonsEnabled(true);
    } catch (err) {
      console.error("Upload error:", err);
      if (docStatus) docStatus.textContent = "Upload failed.";
      addAICard({ title: "Document", body: "Upload failed." });
    } finally {
      if (docUpload) docUpload.disabled = false;
    }
  }

  // --- Review document (cards w/ citations) ---
  async function reviewDocument(task) {
    if (!currentDocumentId) {
      alert("Upload a document first.");
      return;
    }

    addAICard({ title: "Document review", body: `Running: ${task}…` });

    try {
      const res = await fetch("/document_review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ document_id: currentDocumentId, task })
      });

      const data = await res.json();

      if (!res.ok || data.status !== "ok") {
        addAICard({ title: "Document review", body: data?.error || "Review failed." });
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        addAICard({ title: "Document review", body: "No results returned." });
        return;
      }

      items.forEach((it, idx) => {
        addAICard({
          title: it.title || `Item ${idx + 1}`,
          body: (it.point || "").toString(),
          badges: [
            { text: `Source #${it.chunk_id}`, kind: "source" },
            it.confidence ? { text: `Conf: ${it.confidence}`, kind: "primary" } : null
          ].filter(Boolean),
          quote: it.quote ? `“${it.quote}”` : null
        });
      });
    } catch (err) {
      console.error("Review error:", err);
      addAICard({ title: "Document review", body: "Review failed." });
    }
  }

  // --- Clause search (chips + citations) ---
  async function findClause() {
    const q = (clauseQuery?.value || "").trim();
    if (!q) return alert("Type what clause you want (e.g., termination).");
    if (!currentDocumentId) return alert("Upload a document first.");

    if (clauseStatus) clauseStatus.textContent = "Searching…";

    try {
      const res = await fetch("/clause_search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ query: q, document_id: currentDocumentId })
      });

      const data = await res.json();

      if (!res.ok || data.status !== "ok") {
        if (clauseStatus) clauseStatus.textContent = data?.error || "Search failed.";
        addAICard({ title: "Clause search", body: data?.error || "Search failed." });
        return;
      }

      const matches = Array.isArray(data.matches) ? data.matches : [];
      if (!matches.length) {
        if (clauseStatus) clauseStatus.textContent = "No matches found.";
        addAICard({
          title: "Clause search",
          body: `No clear match for "${q}". Try another term (e.g., "termination notice", "fees", "indemnity").`
        });
        if (clauseAnalyze) clauseAnalyze.disabled = true;
        return;
      }

      if (clauseStatus) clauseStatus.textContent = `Found ${matches.length} likely matches.`;

      // Show top matches as a card + chips
      addAICard({
        title: "Clause matches",
        body: `Top matches for “${q}”`,
        badges: [{ text: `${matches.length} found`, kind: "primary" }],
        chips: matches.slice(0, 5).map((m) => ({
          label: `Source #${m.chunk_id} (${m.score})`,
          onClick: () => {
            // Convenience: auto-trigger analyze next
            if (clauseAnalyze) clauseAnalyze.disabled = false;
            addAICard({
              title: "Selected match",
              body: (m.preview || "").toString(),
              badges: [{ text: `Source #${m.chunk_id}`, kind: "source" }]
            });
          }
        }))
      });

      if (clauseAnalyze) clauseAnalyze.disabled = false;
    } catch (err) {
      console.error(err);
      if (clauseStatus) clauseStatus.textContent = "Search failed.";
      addAICard({ title: "Clause search", body: "Clause search failed." });
    }
  }

  // --- Clause analyze (risks w/ severity tags + rewrites) ---
  async function analyzeClause() {
    const q = (clauseQuery?.value || "").trim();
    if (!q) return alert("Type what clause you want (e.g., termination).");
    if (!currentDocumentId) return alert("Upload a document first.");

    addAICard({ title: "Clause analysis", body: `Analyzing: “${q}”…` });

    try {
      const res = await fetch("/clause_rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ query: q, document_id: currentDocumentId })
      });

      const data = await res.json();

      if (!res.ok || data.status !== "ok") {
        addAICard({ title: "Clause analysis", body: data?.error || "Clause analysis failed." });
        return;
      }

      const clause = data.clause || {};
      if (!clause.found) {
        addAICard({
          title: "Couldn’t locate clause confidently",
          body: `I couldn’t confidently locate “${q}”.`,
          badges: [{ text: "Needs clarification", kind: "primary" }]
        });

        (clause.missing_or_ambiguous || []).forEach((x, i) => {
          addAICard({
            title: `Clarifier ${i + 1}`,
            body: x.question || x.item || "Clarify what you want here."
          });
        });
        return;
      }

      addAICard({
        title: `Clause: ${clause.label || q}`,
        body: clause.extracted_clause || "(No clause text extracted)",
        badges: clause.chunk_id ? [{ text: `Source #${clause.chunk_id}`, kind: "source" }] : []
      });

      const risks = Array.isArray(clause.risks) ? clause.risks : [];
      if (risks.length) {
        risks.forEach((r, i) => {
          addAICard({
            title: r.title || `Risk ${i + 1}`,
            body: `${r.why_it_matters || ""}`.trim(),
            tag: r.severity || "",
            badges: r.chunk_id ? [{ text: `Source #${r.chunk_id}`, kind: "source" }] : [],
            quote: r.quote ? `“${r.quote}”` : null
          });
        });
      } else {
        addAICard({ title: "Risks", body: "No risks returned." });
      }

      const rw = clause.rewrite_options || {};
      const rewrites = [
        ["Neutral rewrite", rw.neutral],
        ["Signer-friendly rewrite", rw.signer_friendly],
        ["Counterparty-friendly rewrite", rw.counterparty_friendly]
      ].filter(([, txt]) => txt);

      if (rewrites.length) {
        rewrites.forEach(([t, txt]) => {
          addAICard({
            title: t,
            body: String(txt),
            badges: [{ text: "Draft language", kind: "primary" }]
          });
        });
      }
    } catch (err) {
      console.error(err);
      addAICard({ title: "Clause analysis", body: "Clause analysis failed." });
    }
  }

  // --- Handlers ---
  sendBtn.addEventListener("click", () => sendMessage());
  input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

  document.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const topic = btn.getAttribute("data-topic");
      sendMessage(`Topic: ${topic}\nPlease ask the first 3 intake questions you need to understand my situation.`);
    });
  });

  if (reportBtn) reportBtn.addEventListener("click", generateReport);
  if (reportClose && reportPanel) reportClose.addEventListener("click", () => { reportPanel.style.display = "none"; });

  if (docUpload) docUpload.addEventListener("click", uploadDocument);
  if (docSummary) docSummary.addEventListener("click", () => reviewDocument("summary"));
  if (docRisks) docRisks.addEventListener("click", () => reviewDocument("risks"));
  if (docMissing) docMissing.addEventListener("click", () => reviewDocument("missing"));
  if (docQuestions) docQuestions.addEventListener("click", () => reviewDocument("questions"));

  if (clauseFind) clauseFind.addEventListener("click", findClause);
  if (clauseAnalyze) clauseAnalyze.addEventListener("click", analyzeClause);
  if (clauseAnalyze) clauseAnalyze.disabled = true;

  setDocButtonsEnabled(false);

  // Lead submission
  document.addEventListener("click", async (e) => {
    if (e.target.id !== "lead-submit") return;

    const name = (document.getElementById("lead-name")?.value || "").trim();
    const email = (document.getElementById("lead-email")?.value || "").trim();
    const msgEl = document.getElementById("lead-msg");

    if (!name || !email) return alert("Please enter your name and email.");

    try {
      const res = await fetch("/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, email })
      });

      const data = await res.json();
      if (msgEl) {
        msgEl.textContent =
          data.status === "saved" ? "Thank you — we received your details." : "Something went wrong. Please try again.";
      }
      e.target.disabled = true;
    } catch (err) {
      console.error("Lead submission error:", err);
      alert("Error submitting your details.");
    }
  });

  // Save chat
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/summary", { method: "POST", credentials: "same-origin" });
        alert(res.ok ? "Chat saved!" : "Failed to save chat.");
      } catch (err) {
        console.error("Save chat error:", err);
        alert("Error saving chat.");
      }
    });
  }

  // Clear chat
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      await fetch("/clear_chat", { method: "POST", credentials: "same-origin" }).catch(() => {});
      container.innerHTML = "";
      if (meta) meta.textContent = "";
    });
  }

  container.scrollTop = container.scrollHeight;
});