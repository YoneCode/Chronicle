// Real end-to-end covenant lifecycle via the genlayer-js SDK (the dApp's own SDK).
// register -> fund -> authorize epoch, then read state back. Never logs the private key.
// usage: node scripts/interact.mjs <covenantId> <fundGEN> "<mandate>"
import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const PK = env.ACCOUNT_PRIVATE_KEY;
const ADDR = env.CONTRACT_ADDRESS;
const COV = process.argv[2] || "treasury-resilience";
const FUND_GEN = Number(process.argv[3] ?? "0");
const MANDATE = process.argv[4] || "Deploy this treasury to maximize ecosystem resilience during systemic stress.";
if (!PK || !ADDR) { console.error("Missing ACCOUNT_PRIVATE_KEY or CONTRACT_ADDRESS"); process.exit(1); }

const account = createAccount(PK.startsWith("0x") ? PK : `0x${PK}`);
const client = createClient({ chain: testnetBradbury, account });
const ATTO = 10n ** 18n;
const ms = (n) => new Promise((r) => setTimeout(r, n));

async function waitFor(hash, label) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await client.getTransaction({ hash });
      const s = r?.statusName ?? r?.status;
      if (s === "ACCEPTED" || s === "FINALIZED") { console.log(`    ${label}: ${s}`); return r; }
      if (s === "UNDETERMINED" || s === "CANCELED" || s === "LEADER_TIMEOUT") { console.log(`    ${label}: ${s}`); return r; }
    } catch {}
    await ms(5000);
  }
  console.log(`    ${label}: still pending after wait`);
  return null;
}
const read = (fn, args = []) => client.readContract({ address: ADDR, functionName: fn, args });
const J = (x) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v));

async function exists(id) { try { await read("get_covenant", [id]); return true; } catch { return false; } }

(async () => {
  console.log(`Vault ${ADDR}  covenant "${COV}"`);

  if (!(await exists(COV))) {
    console.log(`\n[1] register_covenant("${COV}") …`);
    const h = await client.writeContract({ address: ADDR, functionName: "register_covenant", args: [COV, MANDATE], value: 0n });
    console.log("    tx", h); await waitFor(h, "register");
  } else { console.log("\n[1] covenant already registered — skipping"); }

  if (FUND_GEN > 0) {
    const value = BigInt(Math.round(FUND_GEN * 1000)) * (ATTO / 1000n);
    console.log(`\n[2] fund_covenant("${COV}") value=${FUND_GEN} GEN …`);
    const h = await client.writeContract({ address: ADDR, functionName: "fund_covenant", args: [COV], value });
    console.log("    tx", h); await waitFor(h, "fund");
  }

  console.log(`\n[3] evaluate_epoch("${COV}") — validators interpret the mandate via LLM consensus …`);
  const h = await client.writeContract({ address: ADDR, functionName: "evaluate_epoch", args: [COV], value: 0n });
  console.log("    tx", h); await waitFor(h, "epoch");

  console.log("\n[4] state after lifecycle:");
  console.log("    covenant:", J(await read("get_covenant", [COV])));
  console.log("    checkpoints:", J(await read("get_checkpoints", [COV])));
})().catch((e) => { console.error("ERROR:", e?.shortMessage ?? e?.message ?? String(e)); process.exit(1); });
