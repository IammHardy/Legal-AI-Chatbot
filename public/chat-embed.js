(function() {
  // Create chat container
  const chatWidget = document.createElement("div");
  chatWidget.id = "chat-widget-embed";
  chatWidget.style.cssText = "width: 100%; max-width: 400px; font-family: sans-serif; border:1px solid #ccc; padding:10px; background:#f9f9f9; position:fixed; bottom:20px; right:20px; z-index:9999;";
  chatWidget.innerHTML = `
    <h4>Legal AI Chat</h4>
    <div id="chat-container-embed" style="min-height:250px; max-height:400px; overflow-y:auto; padding:5px; border:1px solid #ddd; background:#fff;"></div>
    <input type="text" id="user-message-embed" placeholder="Type a message..." style="width:70%; padding:6px;">
    <button id="send-btn-embed" style="padding:6px 10px;">Send</button>
  `;
  document.body.appendChild(chatWidget);

  const container = document.getElementById("chat-container-embed");

  async function sendMessage() {
    const input = document.getElementById("user-message-embed");
    const message = input.value.trim();
    if (!message) return;

    container.innerHTML += `<p><b>You:</b> ${message}</p>`;

    try {
      const res = await fetch("https://YOUR-RAILS-DOMAIN/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message})
      });
      const data = await res.json();

      let replyHtml = "";
      if (data.type === "faq") {
        replyHtml = `<p style="background:#eef; padding:5px;"><b>FAQ:</b> ${data.reply}</p>`;
      } else if (data.type === "ai") {
        replyHtml = `<p style="background:#fff; padding:5px; border-left:3px solid #0077cc;"><b>Legal AI:</b> ${data.reply}</p>`;
      } else {
        replyHtml = `<p style="background:#ffe; padding:5px; border-left:3px solid #aa0000;"><b>Demo AI:</b> ${data.reply}</p>`;
      }

      container.innerHTML += replyHtml;

      // Lead capture CTA
      if (data.lead_capture) {
        container.innerHTML += `<p style="background:#eef; padding:5px;"><b>Request Consultation:</b> <a href="/contact" target="_blank">Click here</a></p>`;
      }

      input.value = "";
      container.scrollTop = container.scrollHeight;
    } catch (err) {
      container.innerHTML += `<p style="color:red;"><b>Error:</b> Unable to send message.</p>`;
      console.error(err);
    }
  }

  document.getElementById("send-btn-embed").onclick = sendMessage;
})();
