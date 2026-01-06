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

    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    container.innerHTML += `<p><b>Legal AI:</b> ${data.reply}</p>`;

    // Disclaimer (shown once per session)
    if (data.disclaimer) {
      container.innerHTML += `
        <p style="color:#aa0000;font-size:0.85em">
          <b>Disclaimer:</b> ${data.disclaimer}
        </p>
      `;
    }

    // Lead handoff UI
    if (data.cta) {
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

    // Demo score display
    container.innerHTML += `
      <p style="font-size:0.75em;color:#666">
        Inquiry Score: ${data.score}
      </p>
    `;

    container.scrollTop = container.scrollHeight;
  }

  sendBtn.addEventListener("click", sendMessage);

  // ✅ Lead submission (event delegation)
  document.addEventListener("click", async (e) => {
    if (e.target.id !== "lead-submit") return;

    const name = document.getElementById("lead-name").value.trim();
    const email = document.getElementById("lead-email").value.trim();

    if (!name || !email) {
      alert("Please enter your name and email.");
      return;
    }

    const res = await fetch("/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email })
    });

    const data = await res.json();

    document.getElementById("lead-msg").innerText =
      data.status === "saved"
        ? "Thank you! Someone will contact you shortly."
        : "Something went wrong. Please try again.";
  });

  // ✅ Save chat
  saveBtn.addEventListener("click", async () => {
    const res = await fetch("/summary", { method: "POST" });

    if (res.ok) {
      alert("Chat saved!");
    } else {
      alert("Failed to save chat. Check console.");
    }
  });
});
