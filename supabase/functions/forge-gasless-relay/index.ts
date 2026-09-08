import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Robinhood Testnet ERC-4337 gas-limit guard.
// Alchemy under-estimates verification/execution gas for the custom FORGE smart account.
// These limits were validated against mined sponsored UserOperations on Robinhood Testnet.
// Keep this override scoped strictly to the Testnet Alchemy endpoint; Mainnet remains untouched.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("robinhood-testnet.g.alchemy.com") && init?.body && typeof init.body === "string") {
      const body = JSON.parse(init.body);
      if (body?.method === "alchemy_requestGasAndPaymasterAndData" && body?.params?.[0]) {
        const request = body.params[0];
        request.overrides = {
          ...(request.overrides || {}),
          callGasLimit: "0x493e0", // 300,000
          verificationGasLimit: "0x11170", // 70,000
        };
        init = { ...init, body: JSON.stringify(body) };
      }
    }
  } catch (_) {
    // Fall through to the relay core; all release gates remain fail-closed.
  }
  return originalFetch(input as any, init);
};

await import("./relay-core.ts");
