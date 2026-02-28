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
  const reportDownload = document.getElementById("report-download"); // may not exist now

  // Document tools UI (new)
  const docFile = document.getElementById("doc-file");
  const docTitle = document.getElementById("doc-title");
  const docUpload = document.getElementById("doc-upload");
  const docStatus = document.getElementById("doc-status");

  const docSummary = document.getElementById("doc-summary");
  const docRisks = document.getElementById("doc-risks");
  const docMissing = document.getElementById("doc-missing");
  const docQuestions = document.getElementById("doc-questions");

  // ✅ Guard early
  if (!container || !input || !sendBtn) return;

  let isSending = false;

  // ✅ Cooldown to prevent accidental rate-limits
  let lastSentAt = 0;
  const COOLDOWN_MS = 1200;

  // Track current uploaded document
  let currentDocumentId = null;

  function setDocButtonsEnabled(on) {
    [docSummary, docRisks, docMissing, docQuestions].forEach((btn) => {
      if (btn) btn.disabled = !on;
    });
  }

  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = "row";

    const bubble = document.createElement("div");
    bubble.className = `msg ${role === "you" ? "you" : "ai"}`;
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

  async function sendMessage(prefill = null) {
    const message = (prefill ?? input.value).trim();
    if (!message || isSending) return;

    const now = Date.now();
    if (now - lastSentAt < COOLDOWN_MS) return;
    lastSentAt = now;

    isSending = true;
    sendBtn.disabled = true;

    addMessage("you", message);
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
      addMessage("ai", reply || "I didn’t catch that — could you try again?");

      if (data?.disclaimer) addMessage("ai", `Disclaimer: ${data.disclaimer}`);

      if (data?.cta) {
        const existing = document.getElementById("lead-box");
        if (existing) existing.remove();

        const box = document.createElement("div");
        box.id = "lead-box";
        box.style.cssText =
          "margin-top:12px;padding:12px;border:1px solid #dbe7ff;background:#f3f7ff;border-radius:12px";

        box.innerHTML = `
          <div style="font-weight:600;margin-bottom:6px">${data.cta}</div>
          <input id="lead-name" placeholder="Your name" style="display:block;width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;margin:6px 0" />
          <input id="lead-email" placeholder="Your email" style="display:block;width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;margin:6px 0" />
          <button id="lead-submit" class="primary" style="width:100%" type="button">Request Contact</button>
          <div id="lead-msg" style="margin-top:8px;font-size:13px;color:#333"></div>
        `;
        container.appendChild(box);
        container.scrollTop = container.scrollHeight;
      }

      if (meta && typeof data?.score !== "undefined") {
        meta.textContent = `Inquiry Score: ${data.score}`;
      }
    } catch (err) {
      setTyping(false);
      addMessage("ai", "Something went wrong. Please try again.");
      console.error("Chat error:", err);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // ✅ Intake Report generator (downloads file directly)
  async function generateReport() {
    if (isSending) return;

    const now = Date.now();
    if (now - lastSentAt < COOLDOWN_MS) return;
    lastSentAt = now;

    isSending = true;
    if (reportBtn) reportBtn.disabled = true;

    addMessage("ai", "Generating intake report…");

    try {
      const res = await fetch("/intake_report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("Report error response:", errText);
        addMessage("ai", "Failed to generate report.");
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

      if (reportDownload) reportDownload.style.display = "none";
    } catch (err) {
      console.error("Report error:", err);
      addMessage("ai", "Something went wrong generating the report.");
    } finally {
      isSending = false;
      if (reportBtn) reportBtn.disabled = false;
    }
  }

  // ✅ Upload contract/document
  async function uploadDocument() {
    if (!docFile || !docFile.files || docFile.files.length === 0) {
      alert("Choose a file first (PDF/DOCX/TXT).");
      return;
    }

    const file = docFile.files[0];

    const form = new FormData();
    form.append("file", file);
    form.append("title", (docTitle?.value || "").trim());

    if (docUpload) docUpload.disabled = true;
    if (docStatus) docStatus.textContent = "Uploading…";
    setDocButtonsEnabled(false);

    addMessage("ai", "Uploading document…");

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
        addMessage("ai", msg);
        return;
      }

      currentDocumentId = data.document.id;

      if (docStatus) {
        docStatus.textContent = `Loaded: ${data.document.filename} (${data.document.chars} chars extracted)`;
      }

      addMessage(
        "ai",
        `Document loaded: ${data.document.filename}. Choose: Summary, Risks, Missing terms, or Ask intake questions.`
      );
      setDocButtonsEnabled(true);
    } catch (err) {
      console.error("Upload error:", err);
      if (docStatus) docStatus.textContent = "Upload failed.";
      addMessage("ai", "Upload failed.");
    } finally {
      if (docUpload) docUpload.disabled = false;
    }
  }

  // ✅ Review document
 async function reviewDocument(task) {
  if (!currentDocumentId) {
    alert("Upload a document first.");
    return;
  }

  addMessage("ai", `Reviewing document (${task})…`);

  try {
    const res = await fetch("/document_review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ document_id: currentDocumentId, task })
    });

    const data = await res.json();

    if (!res.ok || data.status !== "ok") {
      addMessage("ai", data?.error || "Review failed.");
      return;
    }

    // Render items with citations
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      addMessage("ai", "No results returned.");
      return;
    }

    items.forEach((it, idx) => {
      const title = (it.title || `Item ${idx + 1}`).toString();
      const point = (it.point || "").toString();
      const chunkId = it.chunk_id;
      const quote = (it.quote || "").toString();
      const conf = (it.confidence || "").toString();

      const msg =
        `${idx + 1}) ${title}\n` +
        `${point}\n` +
        `Source #${chunkId}${conf ? ` • confidence: ${conf}` : ""}\n` +
        `“${quote}”`;

      addMessage("ai", msg);
    });

  } catch (err) {
    console.error("Review error:", err);
    addMessage("ai", "Review failed.");
  }
}

  // Handlers
  sendBtn.addEventListener("click", () => sendMessage());
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  document.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const topic = btn.getAttribute("data-topic");
      sendMessage(
        `Topic: ${topic}\n` +
          `Please ask the first 3 intake questions you need to understand my situation.`
      );
    });
  });

  // Intake report UI
  if (reportBtn) reportBtn.addEventListener("click", generateReport);
  if (reportClose && reportPanel) {
    reportClose.addEventListener("click", () => {
      reportPanel.style.display = "none";
    });
  }

  // Document upload + review UI
  if (docUpload) docUpload.addEventListener("click", uploadDocument);

  if (docSummary) docSummary.addEventListener("click", () => reviewDocument("summary"));
  if (docRisks) docRisks.addEventListener("click", () => reviewDocument("risks"));
  if (docMissing) docMissing.addEventListener("click", () => reviewDocument("missing"));
  if (docQuestions) docQuestions.addEventListener("click", () => reviewDocument("questions"));

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
          data.status === "saved"
            ? "Thank you — we received your details."
            : "Something went wrong. Please try again.";
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