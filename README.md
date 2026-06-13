<div align="center">

<img src="frontend/public/logo.svg" alt="Chronicle Omega" width="84" height="84" />

# Chronicle Omega

#### Capital governed by an evolving mandate, not by frozen code.

[![Network](https://img.shields.io/badge/Network-GenLayer%20Bradbury-0a0d14?style=flat-square)](https://explorer-bradbury.genlayer.com)
[![Chain&nbsp;ID](https://img.shields.io/badge/Chain%20ID-4221-0052ff?style=flat-square)](https://docs.genlayer.com/developers/networks)
[![Status](https://img.shields.io/badge/Status-Live%20on%20Testnet-00d395?style=flat-square)](https://explorer-bradbury.genlayer.com/address/0xbBf6D47f80559253AC6026Aaf8f3b203664dec1C)
[![Contract](https://img.shields.io/badge/Vault-0xbBf6%E2%80%A6ec1C-555?style=flat-square&logo=ethereum&logoColor=white)](https://explorer-bradbury.genlayer.com/address/0xbBf6D47f80559253AC6026Aaf8f3b203664dec1C)
[![License](https://img.shields.io/badge/License-MIT-666?style=flat-square)](#license)

[![Python](https://img.shields.io/badge/Contract-Python%203.12-3776ab?style=flat-square&logo=python&logoColor=white)](contracts/chronicle_omega.py)
[![GenVM](https://img.shields.io/badge/GenVM-pinned%20runner-0a0d14?style=flat-square)](https://docs.genlayer.com/developers/intelligent-contracts/introduction)
[![Frontend](https://img.shields.io/badge/Frontend-Vite%20%2B%20React%2018%20%2B%20TS-646cff?style=flat-square&logo=vite&logoColor=white)](frontend/)
[![SDK](https://img.shields.io/badge/SDK-genlayer--js%201.2-0052ff?style=flat-square)](https://www.npmjs.com/package/genlayer-js)
[![Wallet](https://img.shields.io/badge/Wallet-Privy-7c3aed?style=flat-square)](https://www.privy.io)
[![Tests](https://img.shields.io/badge/Direct%20Tests-10%2F10%20passing-00d395?style=flat-square)](tests/direct/)

</div>

---

Chronicle Omega is a **semantic covenant vault** built on [GenLayer](https://genlayer.com). Capital is committed under a long-horizon, natural-language mandate. Each epoch, GenLayer validators independently re-interpret the mandate against fresh context using an LLM and converge on an allocation ratio (basis points). The released portion and an auditable checkpoint are recorded on-chain.

This is not a generic deterministic vault dressed up with AI. The release rule **cannot be expressed in Solidity** — it depends on validators reaching consensus on the *meaning* of a sentence, every epoch, against current world state. That requirement is exactly what GenLayer's Optimistic Democracy is built for.


## Live on-chain

| | |
|---|---|
| **Vault** | [`0xbBf6D47f80559253AC6026Aaf8f3b203664dec1C`](https://explorer-bradbury.genlayer.com/address/0xbBf6D47f80559253AC6026Aaf8f3b203664dec1C) |
| **Network** | GenLayer Bradbury · chain id `4221` |
| **RPC** | `https://rpc-bradbury.genlayer.com` |
| **Explorer** | [`explorer-bradbury.genlayer.com`](https://explorer-bradbury.genlayer.com) |
| **Deploy tx** | [`0x5ba2…f829c56`](https://explorer-bradbury.genlayer.com/tx/0x5ba2b83b8dad3de45310cb28d1d988646e529b4b655fe84fd15350bb2f829c56) — `ACCEPTED · AGREE · 3 validators · FINISHED_WITH_RETURN` |
| **Covenants** | 3 active mandates ([live](https://explorer-bradbury.genlayer.com/address/0xbBf6D47f80559253AC6026Aaf8f3b203664dec1C)) |
| **Capital under mandate** | 6 GEN |
| **Tolerance band** | ±15% |

Every figure on the [landing page](frontend/src/Landing.tsx) and [console dashboard](frontend/src/App.tsx) is read live via `gen_call` — there is no mocked or seeded data anywhere in the UI.

## Why this needs GenLayer

Chronicle Omega's release function is `f(mandate, world_state, prior_trust) → allocation_bps`. Three concrete reasons that function cannot live on a deterministic chain:

1. **Semantic interpretation.** "Maximize ecosystem resilience during systemic stress" is not a predicate. Validators have to agree on the *meaning* of the mandate against the current world, which means LLM consensus.
2. **Bounded non-determinism.** Two LLMs will never produce byte-equal outputs. The contract uses `gl.vm.run_nondet_unsafe` with a custom validator that compares allocation basis points within a configurable tolerance band — exactly what GenLayer's Equivalence Principle is for.
3. **Auditability without oracles.** Every epoch writes a `Checkpoint` (allocation, summary, convergence flag) on-chain. No external oracle relays the decision; the chain *is* the adjudication.


## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React 18 + TS)                                    │
│  ─────────────────────────────────────────────────────────────────  │
│  Landing  → live on-chain stream, capital strata, sigil draw-on,    │
│             View Transitions API morph into the console             │
│  Console  → flagship covenant card, ledger, governance, attestations│
│  Wallet   → Privy embedded + external; live GEN balance via RPC     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  genlayer-js  (read + write)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GenLayer Bradbury (chain 4221)                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  ChronicleOmega vault  ← @gl.public.write / @gl.public.write.payable│
│  Optimistic Democracy  ← leader + validators + tolerance band       │
│  GenVM                 ← run_nondet_unsafe(leader_fn, validator_fn) │
└─────────────────────────────────────────────────────────────────────┘
```

## Repository

```
contracts/chronicle_omega.py    # the intelligent contract (pinned runner, no floats)
deploy/deploy.sh                # CLI deploy to Bradbury
deploy/abi.json                 # extracted ABI schema
tests/direct/                   # in-memory pytest suite (10/10 passing)
tests/integration/              # gltest smoke against the live network
gltest.config.yaml              # paths config for gltest
requirements.txt                # genvm-linter, genlayer-test, genlayer-py
frontend/                       # Vite + React + TS app
  src/
    App.tsx, Landing.tsx        # console + landing pages
    main.tsx                    # hash-routed entry, Privy provider
    genlayer.ts                 # genlayer-js client (throttled gen_call)
    WalletPill.tsx              # connect / balance / network / dropdown
    charts.tsx                  # bespoke SVG: sigil, strata, sparkline
    ConsensusField.tsx          # canvas ambience, real on-chain props
    useCountUp.ts               # ease-out-quart, latency-aware
    useWalletAuth.ts            # Privy-optional wallet hook
    lifecycle.ts                # known on-chain tx hashes for the flagship card
    format.ts                   # GEN / bps / address formatters
    styles.css                  # design system
  scripts/
    interact.mjs                # register + fund + epoch via genlayer-js
    set_operator.mjs            # admin-only operator update
    epoch_loop.mjs              # retry epoch until consensus seals
.env.example                    # never commit .env
.gitignore                      # protects secrets and tooling artefacts
```

## Tech stack

- **Smart contract** — Python 3.12, `py-genlayer` runner pinned to `1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`, `gl.vm.run_nondet_unsafe` for consensus, `gl.eq_principle` patterns, no floats in storage (basis points + atto-scale only).
- **Tooling** — `genvm-linter` (lint + ABI), `genlayer-test` (`pytest tests/direct/` for fast iteration; `gltest` for live integration), `genlayer` CLI for deploys.
- **Frontend** — Vite 5, React 18, TypeScript, [`genlayer-js`](https://www.npmjs.com/package/genlayer-js) `^1.2.0` (Bradbury chain export, `readContract` / `writeContract` / `getTransaction`), [`@privy-io/react-auth`](https://www.privy.io) for wallet auth, View Transitions API for the page-morph, `animation-timeline: view()` for scroll-driven reveals, custom 2D-canvas consensus field — no chart libraries, no UI kit.
- **Build** — `npm run build` produces `frontend/dist/` ready for static hosting.


## Run the contract suite

Requires Python 3.12 and the GenLayer CLI (`npm i -g genlayer`).

```bash
# Lint the contract
.venv/bin/genvm-lint check contracts/chronicle_omega.py

# Direct-mode tests (fast, in-memory, no server)
.venv/bin/python -m pytest tests/direct/ -q
```

## Run the frontend

```bash
cd frontend
cp .env.example .env          # set VITE_PRIVY_APP_ID + VITE_CONTRACT_ADDRESS
npm ci
npm run dev                   # vite dev server
npm run build                 # outputs frontend/dist
```

## Deploy

The vault on Bradbury was deployed with the `genlayer` CLI. The flow lives in [`deploy/deploy.sh`](deploy/deploy.sh):

```bash
genlayer network set testnet-bradbury
genlayer account import --name chronicle --private-key 0x... --password "..."
genlayer account use chronicle
genlayer deploy --contract contracts/chronicle_omega.py --args "$CONTEXT_URL" "$TOLERANCE_BPS"
```

After deploy, write `CONTRACT_ADDRESS` into `.env` and `VITE_CONTRACT_ADDRESS` into `frontend/.env`.

## Cloudflare Pages

Project is wired for Cloudflare Pages out of the box.

| Setting | Value |
|---|---|
| Build command | `cd frontend && npm ci && npm run build` |
| Build output directory | `frontend/dist` |
| Root directory | `/` |
| Node version | `20` |
| Environment variables | `VITE_PRIVY_APP_ID`, `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID=4221` |

A SPA fallback ([`frontend/public/_redirects`](frontend/public/_redirects)) sends all routes to `index.html` so hash routing works after refresh.

## Security

- `.env` and `.env.*` are git-ignored; only `.env.example` ships.
- The contract sanitizes all external/LLM input (control chars stripped, prompt-injection phrases removed, payload bounded, non-200 rejected).
- Storage uses `u256` atto-scale for money and basis points for ratios — no floats anywhere.
- Errors are classified with `[EXPECTED] [EXTERNAL] [TRANSIENT] [LLM_ERROR]` prefixes so consensus handles failures correctly.

## Author

Built by **[YoneCode](https://github.com/YoneCode)** &nbsp;·&nbsp; [`@YoneCode`](https://x.com/YoneCode) on X.

## License

MIT.
