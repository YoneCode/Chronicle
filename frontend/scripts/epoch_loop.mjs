// Retry evaluate_epoch until a checkpoint seals on Bradbury (LLM validators are flaky).
// Stops on first success or after MAX_TRIES.
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
const MAX_TRIES = Number(process.argv[3] ?? "10");
const GAP_MS = Number(process.argv[4] ?? "30000");

const account = createAccount(PK.startsWith("0x") ? PK : `0x${PK}`);
const client = createClient({ chain: testnetBradbury, account });
const ms = (n) => new Promise((r) => setTimeout(r, n));

async function read(fn, args = []) {
  return client.readContract({ address: ADDR, functionName: fn, args });
}

console.log(`epoch loop · vault ${ADDR} · covenant "${COV}" · ${MAX_TRIES} attempts max`);

for (let i = 1; i <= MAX_TRIES; i++) {
  console.log(`\n--- attempt ${i}/${MAX_TRIES} ---`);
  let hash = null;
  try {
    hash = await client.writeContract({
      address: ADDR, functionName: "evaluate_epoch", args: [COV], value: 0n,
    });
    console.log("    tx", hash);
  } catch (e) {
    console.log("    submit error:", e?.shortMessage ?? e?.message ?? String(e));
    await ms(GAP_MS); continue;
  }

  let final = null;
  for (let j = 0; j < 90; j++) {
    try {
      const r = await client.getTransaction({ hash });
      const s = r?.statusName ?? r?.status;
      if (["ACCEPTED","FINALIZED","UNDETERMINED","CANCELED","LEADER_TIMEOUT"].includes(s)) {
        final = r; break;
      }
    } catch {}
    await ms(5000);
  }
  const status = final?.statusName ?? final?.status ?? "unknown";
  const exec = final?.txExecutionResultName ?? "?";
  console.log(`    status ${status} · ${exec}`);

  // Verify on-chain whether a checkpoint was sealed
  try {
    const cps = await read("get_checkpoints", [COV]);
    if (Array.isArray(cps) && cps.length > 0) {
      console.log(`\n✓ EPOCH SEALED · checkpoints: ${cps.length}`);
      console.log("    latest:", JSON.stringify(cps[cps.length - 1], (_, v) => typeof v === "bigint" ? v.toString() : v));
      const cov = await read("get_covenant", [COV]);
      console.log("    covenant epoch:", cov?.epoch, "released:", cov?.capital_released);
      process.exit(0);
    }
  } catch {}

  if (i < MAX_TRIES) { console.log(`    no checkpoint yet · waiting ${GAP_MS/1000}s`); await ms(GAP_MS); }
}

console.log(`\n× exhausted ${MAX_TRIES} attempts without sealing an epoch.`);
process.exit(1);
