document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("chat-container");
  const input = document.getElementById("user-message");

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

    if (data.disclaimer) {
      container.innerHTML += `
        <p style="color:#aa0000;font-size:0.85em">
          <b>Disclaimer:</b> ${data.disclaimer}
        </p>`;
    }

    if (data.cta) {
      container.innerHTML += `
        <div style="background:#eef;padding:10px;margin-top:10px">
          <p><b>${data.cta}</b></p>

          <input id="lead-name" placeholder="Your name" />
          <input id="lead-email" placeholder="Your email" />
          <button id="lead-submit">Request Consultation</button>
          <p id="lead-msg"></p>
        </div>
      `;
    }

    container.innerHTML += `
      <p style="font-size:0.75em;color:#666">
        Inquiry Score: ${data.score}
      </p>
    `;

    container.scrollTop = container.scrollHeight;
  }

  document.getElementById("send-btn").onclick = sendMessage;

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
        : "Something went wrong. Try again.";
  });

  document.getElementById("save-btn").onclick = async () => {
    await fetch("/summary", { method: "POST" });
    alert("Chat saved!");
  };
});
