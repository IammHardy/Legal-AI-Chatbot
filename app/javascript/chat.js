document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("chat-container");
  const input = document.getElementById("user-message");

  // Track last user message for lead form
  let lastUserMessageForLead = null;

  async function sendMessage() {
    const message = input.value.trim();
    if (!message) return;

    // Show user's message
    container.innerHTML += `<p><b>You:</b> ${message}</p>`;
    input.value = "";

    // Send to Rails backend
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    // Show AI reply
    container.innerHTML += `<p><b>Legal AI:</b> ${data.reply}</p>`;

    // Show disclaimer only once
    if (data.disclaimer) {
      container.innerHTML += `
        <p style="color:#aa0000;font-size:0.85em">
          <b>Disclaimer:</b> ${data.disclaimer}
        </p>
      `;
    }

    // Show lead form only if CTA exists
    if (data.cta) {
      lastUserMessageForLead = message; // Save last user message

      container.innerHTML += `
        <div id="lead-container" style="background:#eef;padding:10px;margin-top:10px">
          <p><b>${data.cta}</b></p>

          <input id="lead-name" placeholder="Your name" style="width:48%;margin-right:4%;padding:5px" />
          <input id="lead-email" placeholder="Your email" style="width:48%;padding:5px" />
          <button id="lead-submit" style="margin-top:5px;padding:5px 10px">Request Consultation</button>
          <p id="lead-msg" style="color:green;font-size:0.85em;margin-top:5px;"></p>
        </div>
      `;
    }

    // Show inquiry score
    container.innerHTML += `<p style="font-size:0.75em;color:#666">Inquiry Score: ${data.score}</p>`;

    container.scrollTop = container.scrollHeight;
  }

  // Send message button
  document.getElementById("send-btn").onclick = sendMessage;

  // Handle lead form submission
  document.addEventListener("click", async (e) => {
    if (e.target.id !== "lead-submit") return;

    const name = document.getElementById("lead-name").value.trim();
    const email = document.getElementById("lead-email").value.trim();

    if (!name || !email) {
      alert("Please enter both your name and email.");
      return;
    }

    const res = await fetch("/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        last_message: lastUserMessageForLead
      })
    });

    const data = await res.json();
    const msgElem = document.getElementById("lead-msg");

    if (data.status === "saved") {
      msgElem.innerText = "Thank you! Someone will contact you shortly.";
      document.getElementById("lead-submit").disabled = true;
    } else {
      msgElem.innerText = "Something went wrong. Please try again.";
    }
  });

  // Save chat button
  document.getElementById("save-btn").onclick = async () => {
    const res = await fetch("/summary", { method: "POST" });
    const data = await res.json();
    alert(data.status === "saved" ? "Chat saved!" : "Failed to save chat");
  };
});
