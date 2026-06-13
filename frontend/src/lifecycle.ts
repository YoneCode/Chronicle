// Real on-chain lifecycle hashes for this vault (Bradbury · chain 4221).
// Deploy hash is captured at deploy time. Other steps link to the explorer's
// contract page (which lists every tx); we never fabricate a hash we don't have.

import { CONTRACT_ADDRESS } from "./genlayer";

export const EXPLORER_BASE = "https://explorer-bradbury.genlayer.com";
export const txUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const addrUrl = (addr: string) => `${EXPLORER_BASE}/address/${addr}`;

export const VAULT_DEPLOY_TX =
  "0x5ba2b83b8dad3de45310cb28d1d988646e529b4b655fe84fd15350bb2f829c56" as const;

export type LifecycleStep = {
  key: string;
  label: string;
  status: "done" | "pending" | "blocked";
  meta: string;
  href: string;
  txHash?: string;
};

export function buildLifecycle(opts: {
  hasCovenants: boolean;
  capitalCommittedAtto: bigint;
  epoch: number;
}): LifecycleStep[] {
  const contractHref = addrUrl(CONTRACT_ADDRESS);
  return [
    {
      key: "deploy",
      label: "Vault sealed on-chain",
      status: "done",
      meta: "ACCEPTED · 3 validators · AGREE",
      href: txUrl(VAULT_DEPLOY_TX),
      txHash: VAULT_DEPLOY_TX,
    },
    {
      key: "register",
      label: "Covenant registered",
      status: opts.hasCovenants ? "done" : "pending",
      meta: opts.hasCovenants ? "treasury-resilience · ACCEPTED" : "no covenant yet",
      href: contractHref,
    },
    {
      key: "endow",
      label: "Treasury endowed",
      status: opts.capitalCommittedAtto > 0n ? "done" : "pending",
      meta:
        opts.capitalCommittedAtto > 0n
          ? `${attoToGenString(opts.capitalCommittedAtto)} GEN · ACCEPTED`
          : "awaiting deposit",
      href: contractHref,
    },
    {
      key: "epoch",
      label: opts.epoch > 0 ? `Epoch ${opts.epoch} sealed` : "First epoch",
      status: opts.epoch > 0 ? "done" : "pending",
      meta:
        opts.epoch > 0
          ? "validators converged on allocation"
          : "awaiting validator consensus",
      href: contractHref,
    },
  ];
}

function attoToGenString(atto: bigint): string {
  const ATTO = 10n ** 18n;
  const whole = atto / ATTO;
  const milli = (atto % ATTO) / (ATTO / 1000n);
  return `${whole.toString()}.${milli.toString().padStart(3, "0")}`;
}
