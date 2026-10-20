/* Digi Mithra Social Pilot — website chat widget. Usage:
   <script src="https://YOUR-APP/widget.js" data-key="WORKSPACE_CHAT_KEY" async></script> */
(function () {
  var script = document.currentScript || document.querySelector("script[data-key][src*='widget.js']");
  if (!script) return;
  var key = script.getAttribute("data-key");
  if (!key || !/^[0-9a-f-]{36}$/i.test(key) || window.__spChatLoaded) return;
  window.__spChatLoaded = true;
  var origin = new URL(script.src).origin;

  var style = document.createElement("style");
  style.textContent =
    "#sp-chat-btn{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;border:0;background:#8bdc2b;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;z-index:2147483646;display:flex;align-items:center;justify-content:center}" +
    "#sp-chat-btn:focus-visible{outline:3px solid #0b0f0a;outline-offset:3px}" +
    "#sp-chat-frame{position:fixed;right:20px;bottom:90px;width:380px;height:560px;max-height:calc(100vh - 110px);border:0;border-radius:18px;" +
    "box-shadow:0 16px 48px rgba(0,0,0,.28);z-index:2147483647;background:#fff;display:none}" +
    "@media (max-width:480px){#sp-chat-frame{right:0;bottom:0;width:100vw;height:100dvh;max-height:none;border-radius:0}}";
  document.head.appendChild(style);

  var chatIcon =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0b0f0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0b0f0a" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  var btn = document.createElement("button");
  btn.id = "sp-chat-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Open chat");
  btn.innerHTML = chatIcon;

  var frame = document.createElement("iframe");
  frame.id = "sp-chat-frame";
  frame.title = "Chat";
  frame.setAttribute("loading", "lazy");

  var open = false;
  btn.addEventListener("click", function () {
    open = !open;
    if (open && !frame.src) frame.src = origin + "/chat/" + encodeURIComponent(key) + "?embed=1";
    frame.style.display = open ? "block" : "none";
    btn.innerHTML = open ? closeIcon : chatIcon;
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    if (window.innerWidth <= 480) btn.style.display = open ? "none" : "flex";
  });
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data === "sp-chat-close" && open) btn.click();
  });

  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
