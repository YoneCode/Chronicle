// Cloudflare Pages Function — JSON-RPC proxy for GenLayer Bradbury.
//
// Why this exists: the GenLayer node strictly requires an INTEGER JSON-RPC `id`
// and rejects string ids with "cannot unmarshal string into Request.id of type
// int". Embedded wallets (Privy) talk to the chain RPC with their own JSON-RPC
// client that uses string/uuid ids — for preflight calls (chainId, nonce, gas)
// AND the broadcast — and none of that can be intercepted inside the app.
//
// Fix: point the wallet's chain RPC at this proxy. It rewrites every request id
// to an integer before forwarding to the node, then restores the caller's
// original id on the response so the wallet can still match request↔response.

const UPSTREAM = "https://rpc-bradbury.genlayer.com";

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json" }),
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const isBatch = Array.isArray(body);
  const items = isBatch ? body : [body];

  // Assign deterministic integer ids; remember the originals to restore later.
  const originalIds = [];
  const normalized = items.map((item, i) => {
    originalIds[i] = item && typeof item === "object" && "id" in item ? item.id : undefined;
    return { ...item, id: i + 1 };
  });

  let upstream;
  try {
    upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isBatch ? normalized : normalized[0]),
    });
  } catch {
    return json({ jsonrpc: "2.0", id: originalIds[0] ?? null, error: { code: -32603, message: "Upstream RPC unreachable" } }, 502);
  }

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON upstream payload — pass through verbatim.
    return new Response(text, {
      status: upstream.status,
      headers: corsHeaders({ "Content-Type": upstream.headers.get("content-type") || "text/plain" }),
    });
  }

  // Restore caller ids by the integer id we assigned (index + 1). Order-independent.
  const restore = (resp) => {
    if (resp && typeof resp === "object" && typeof resp.id === "number" && resp.id >= 1 && resp.id <= originalIds.length) {
      resp.id = originalIds[resp.id - 1];
    }
    return resp;
  };
  const restored = Array.isArray(data) ? data.map(restore) : restore(data);

  return json(restored, upstream.status);
}
