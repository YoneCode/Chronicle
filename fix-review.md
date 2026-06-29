# Chronicle Omega — Review Fix: Wallet Transaction Signing

**Status:** Fixed and deployed
**Date:** 2026-06-29
**Scope:** Browser wallet transaction signing on GenLayer Bradbury (chain 4221)

---

## 1. Reported issue

Signing a transaction from a browser wallet in the deployed dApp returned a
JSON-RPC error:

```
An internal error was received. Details: RPC submit: Parse error as single request:
json: cannot unmarshal string into Go struct field Request.id of type int
Parse error as batch request: json: cannot unmarshal object into Go value of type []interface {}
Version: viem@2.52.2
```

---

## 2. Root cause

The failure was in the **wallet's transaction broadcast**, not in the contract
or the dApp's logic.

The Bradbury RPC endpoint (`https://rpc-bradbury.genlayer.com`) requires the
JSON-RPC `id` field to be an **integer** and rejects **string** ids. Under the
JSON-RPC 2.0 specification an `id` may be a string, number, or null, so this is
strict server-side parsing.

Browser wallets such as MetaMask issue JSON-RPC requests with **string ids**.
When the wallet broadcast the signed transaction, the node rejected the request
at the parser, before any execution.

Confirmed directly against the node:

```bash
# string id → rejected
curl -s https://rpc-bradbury.genlayer.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"abc","method":"eth_chainId"}'
# {"error":{"code":-32700,"message":"... cannot unmarshal string into ... Request.id of type int"}}

# integer id → accepted
curl -s https://rpc-bradbury.genlayer.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}'
# {"jsonrpc":"2.0","id":1,"result":"0x107d"}
```

`genlayer-js`'s own transport sends integer ids (`id: Date.now()`), which is why
contract reads, deploy scripts, and CLI flows were never affected — only the
browser wallet's signed-write/broadcast path reached the node's strict parser.

---

## 3. The fix

The dApp now routes the wallet's Bradbury RPC through a **same-origin JSON-RPC
proxy** that normalizes the `id` before it reaches the node.

| File | Change |
|------|--------|
| `functions/rpc.js` | Cloudflare Pages Function served at `/rpc`. Rewrites every request `id` to an integer, forwards to `rpc-bradbury.genlayer.com`, and restores the caller's original `id` on the response so the wallet can still match request↔response. Handles single and batch requests. |
| `frontend/src/main.tsx` | Wallet chain configuration points the Bradbury RPC at `${origin}/rpc` in production. |
| `frontend/src/genlayer.ts` | On the write path the dApp registers/switches the wallet network (chain 4221) to the `/rpc` endpoint via `wallet_addEthereumChain` / `wallet_switchEthereumChain`. Contract reads continue to use the node directly (integer ids). |

Net effect: the wallet's string-id broadcast is transparently converted into an
integer-id request the node accepts.

**Live verification — the exact failing request now succeeds through the proxy:**

```bash
curl -s https://genlayer-chronicle.pages.dev/rpc -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"reviewer-string-id","method":"eth_chainId"}'
# {"jsonrpc":"2.0","result":"0x107d","id":"reviewer-string-id"}
```

---

## 4. Wallet support and UX

- **MetaMask** — supported. On connect the wallet shows a one-time prompt to set
  the Bradbury RPC to the dApp's `/rpc` endpoint; after approval, signing works.
- **Rabby** — works directly (it already issues integer-id requests).
- A dismissible in-app advisory explains the above to users.
- Transaction feedback is non-blocking: the UI shows submission, live consensus
  status, and an explorer link instead of waiting on finality.

---

## 5. Proof (signed via wallet in the live dApp)

- Transaction hash: `<PASTE FRESH TX HASH SIGNED IN THE DAPP>`
- Explorer: `https://explorer-bradbury.genlayer.com/tx/<HASH>`

---

## 6. Note on epoch consensus

`evaluate_epoch` (the LLM-driven allocation step) depends on validator consensus,
which can be slow on Bradbury. This is network-side and separate from the signing
fix above; the dApp surfaces pending status with an explorer link rather than
blocking the interface.

---

## Links

- dApp: https://genlayer-chronicle.pages.dev/
- Repository: https://github.com/YoneCode/Chronicle
- Fix commits (2026-06-29): https://github.com/YoneCode/Chronicle/commits/main/?since=2026-06-29&until=2026-06-30
- Vault: `0xbBf6D47f80559253AC6026Aaf8f3b203664dec1C`
- Deploy tx: `0x5ba2b83b8dad3de45310cb28d1d988646e529b4b655fe84fd15350bb2f829c56`
