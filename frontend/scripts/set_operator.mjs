// One-off: set the user's wallet as operator via genlayer-js (string arg, no auto-detection).
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
const NEW_OPERATOR = "0x26882Bea46545505dB4E58f8cf21680193F336e6";

const account = createAccount(PK.startsWith("0x") ? PK : `0x${PK}`);
const client = createClient({ chain: testnetBradbury, account });

console.log(`vault ${ADDR}  signer ${account.address}`);
console.log(`set_operator(${NEW_OPERATOR}) …`);

const hash = await client.writeContract({
  address: ADDR,
  functionName: "set_operator",
  args: [NEW_OPERATOR],   // SDK encodes as string per ABI schema
  value: 0n,
});
console.log("tx", hash);

// poll
const ms = (n) => new Promise((r) => setTimeout(r, n));
for (let i = 0; i < 60; i++) {
  try {
    const r = await client.getTransaction({ hash });
    const s = r?.statusName ?? r?.status;
    if (s === "ACCEPTED" || s === "FINALIZED" || s === "UNDETERMINED" || s === "CANCELED" || s === "LEADER_TIMEOUT") {
      console.log("status", s, "result", r?.txExecutionResultName ?? r?.result);
      break;
    }
  } catch {}
  await ms(5000);
}

const admin = await client.readContract({ address: ADDR, functionName: "get_admin", args: [] });
console.log("operator now:", admin?.operator);
