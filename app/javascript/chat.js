document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("chat-container");
  const input = document.getElementById("user-message");
  const sendBtn = document.getElementById("send-btn");
  const saveBtn = document.getElementById("save-btn");

  async function sendMessage() {
    const message = input.value.trim();
    if (!message) return;

    container.innerHTML += `<p><b>You:</b> ${message}</p>`;
    input.value = "";

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin", // ✅ keeps Rails session per user
        body: JSON.stringify({ message })
      });

      const data = await res.json();

      container.innerHTML += `<p><b>Legal AI:</b> ${data.reply}</p>`;

      if (data.disclaimer) {
        container.innerHTML += `<p style="color:#aa0000;font-size:0.85em"><b>Disclaimer:</b> ${data.disclaimer}</p>`;
      }

      if (data.cta) {
        const existing = document.getElementById("lead-box");
        if (existing) existing.remove();

        container.innerHTML += `
          <div id="lead-box" style="background:#eef;padding:10px;margin-top:10px">
            <p><b>${data.cta}</b></p>
            <input id="lead-name" placeholder="Your name" style="display:block;margin-bottom:5px" />
            <input id="lead-email" placeholder="Your email" style="display:block;margin-bottom:5px" />
            <button id="lead-submit">Request Consultation</button>
            <p id="lead-msg" style="margin-top:5px;font-size:0.9em"></p>
          </div>
        `;
      }

      container.innerHTML += `<p style="font-size:0.75em;color:#666">Inquiry Score: ${data.score}</p>`;
      container.scrollTop = container.scrollHeight;

    } catch (err) {
      console.error("Chat error:", err);
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

  // Lead submission
  document.addEventListener("click", async (e) => {
    if (e.target.id !== "lead-submit") return;

    const name = document.getElementById("lead-name").value.trim();
    const email = document.getElementById("lead-email").value.trim();

    if (!name || !email) { alert("Please enter your name and email."); return; }

    try {
      const res = await fetch("/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, email })
      });

      const data = await res.json();
      const msg = document.getElementById("lead-msg");
      msg.innerText = data.status === "saved"
        ? "Thank you! Someone will contact you shortly."
        : "Something went wrong. Please try again.";
      e.target.disabled = true;
    } catch (err) {
      console.error("Lead submission error:", err);
      alert("Error submitting your details. Check console.");
    }
  });

  // Save chat
  saveBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/summary", {
        method: "POST",
        credentials: "same-origin"
      });
      alert(res.ok ? "Chat saved!" : "Failed to save chat. Check console.");
    } catch (err) {
      console.error("Save chat error:", err);
      alert("Error saving chat. Check console.");
    }
  });
});
