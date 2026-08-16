(() => {
  const API = "https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-discord";
  const params = new URLSearchParams(location.search);
  const session = params.get("session");
  const discord = params.get("discord");
  const button = document.getElementById("linkBtn");
  const status = document.getElementById("status");
  const walletState = document.getElementById("walletState");
  const verifyState = document.getElementById("verifyState");
  document.getElementById("discordState").textContent = discord || "Start from /totz link";

  const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
  const setStatus = (message, type = "") => {
    status.textContent = message;
    status.className = type;
  };
  const post = async (route, body) => {
    const response = await fetch(`${API}?route=${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  if (!session) {
    button.disabled = true;
    setStatus("Run /totz link in the private TOTZ Discord server first.", "error");
    return;
  }

  button.addEventListener("click", async () => {
    if (!window.ethereum) {
      setStatus("Open this page in an EVM wallet browser such as MetaMask or Robinhood Wallet.", "error");
      return;
    }
    button.disabled = true;
    try {
      setStatus("Connecting wallet…");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts?.[0]) throw new Error("No wallet selected");
      const wallet = accounts[0].toLowerCase();
      walletState.textContent = short(wallet);

      const challenge = await post("challenge", { session, wallet });
      if (!challenge.message.startsWith("TOTZ Discord Link\n")) throw new Error("Unsafe message");
      setStatus("Sign the one-time message. This is not a transaction.");
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [challenge.message, wallet],
      });
      await post("complete", { session, wallet, signature });
      verifyState.textContent = "Linked ✓";
      setStatus("Discord and wallet linked successfully.", "ok");
      button.textContent = "LINKED";
    } catch (error) {
      setStatus(error.message || "Linking failed", "error");
      button.disabled = false;
    }
  });
})();
