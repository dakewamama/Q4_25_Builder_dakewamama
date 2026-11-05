# Week 1: SPL tokens and Metaplex Core

Implementation for Ebele Asiadiachi's Turbin3 Week 1 assignment. All commands target **Solana devnet**. This code has not yet been executed against a funded wallet; no transaction or submission is claimed as complete.

## Comparison and scope

| Requirement | ShrinathNR instructor starter | Detoxin01 submission | This implementation |
|---|---|---|---|
| Mint an SPL token | Script scaffold | Browser app | `spl` command |
| Transfer SPL tokens | Transaction instructions commented out | Browser app | `spl` command, followed by balance checks |
| Mint MPL Core NFT | `create` call left unfinished | Browser app | `nft` command, followed by account readback |
| Update NFT name and metadata URI | No update script | Browser app | `update` command, with authority check and readback |
| Public transaction evidence | Console output where implemented | README with links | `evidence/*.json` from actual execution |
| README and social explanation | Starter setup README | Submission README; social link requested | This README; personal social explanation still required |

References inspected: [instructor starter](https://github.com/ShrinathNR/turbine-spl-nft-26) and [student submission](https://github.com/Detoxin01/SPL-and-NFT). They cover the same subject using different stacks. No fork relationship was established. This implementation uses web3.js/SPL Token and Umi/MPL Core, independently implementing the assignment flow. Optional NFT transfer/burn challenges are not implemented.

## Setup

Use Node 22 or later. From this directory:

```bash
npm ci
npm run check
```

Use a dedicated devnet wallet. Set `WALLET_PATH` to its existing Solana JSON keypair, outside the repository. The default is `~/.config/solana/id.json`. Never commit the keypair or put it in the README. Fund that wallet with devnet SOL from the Solana faucet before running transaction commands.

## 1. Mint and transfer

Replace `RECIPIENT_WALLET` with a different wallet's public address:

```bash
npm start -- spl RECIPIENT_WALLET 100 10
```

Creates a fresh mint with 9 decimals, creates sender/recipient ATAs, mints 100 tokens and transfers 10. Reads supply and balances back and checks that the result is 100 supply, 90 sender, 10 recipient. JSON evidence stores raw integer units, so 10 tokens appears as `10000000000`.

Every `spl` invocation creates a **new** mint. If a run fails midway, inspect the saved `spl-start`/`spl-mint` evidence before retrying. Do not assume an error rolled earlier transactions back.

## 2. Prepare NFT metadata

Upload your own image and two public JSON documents to a publicly accessible HTTPS host. The first JSON can follow:

```json
{
  "name": "Dake Builders NFT",
  "description": "My first Turbin3 Metaplex Core asset on Solana devnet.",
  "image": "https://YOUR_PUBLIC_HOST/my-image.png",
  "attributes": [{"trait_type": "Cohort", "value": "Q4"}]
}
```

Create a second JSON with a changed name/description, saved under a different URL. Replace every placeholder before using it. The scripts validate HTTPS URLs but do not upload files or validate the remote JSON/image. Open those URLs yourself to verify public access.

## 3. Create the Core asset

```bash
npm start -- nft "Dake Builders NFT" "https://YOUR_PUBLIC_HOST/metadata.json"
```

Save the public asset address from the generated evidence. The payer is owner and direct update authority.

## 4. Update it as update authority

Use the same wallet and the asset address from step 3:

```bash
npm start -- update ASSET_ADDRESS "Dake Builders NFT Updated" "https://YOUR_PUBLIC_HOST/metadata-updated.json"
```

This changes the on-chain name and URI. It checks direct update authority first and verifies both updated fields afterward. It intentionally does not support collection-derived authority.

## 5. Verify and submit

```bash
npm start -- verify-spl MINT_ADDRESS RECIPIENT_WALLET
npm start -- verify-nft ASSET_ADDRESS
```

Only publish public evidence JSON after reviewing it. It contains addresses/signatures, never secret keys. Add your actual mint and asset addresses, transaction links, and final balances below. The commands emit transaction URLs with `cluster=devnet`.

| Evidence | Actual result |
|---|---|
| SPL mint address | Pending execution |
| SPL mint transaction | Pending execution |
| SPL transfer transaction | Pending execution |
| NFT address and create transaction | Pending execution |
| NFT update transaction | Pending execution |
| Social explanation URL | Pending publication |

Attach your repository and social explanation URL in Google Classroom. Explain mint accounts versus token accounts, why ATAs are needed, how the mint authority differs from the NFT update authority, and why replacing the URI changes the referenced metadata. Use your own actual results and describe what you learned. Do not mark the assignment complete until these links and transactions exist.

## Validation and limits

`npm run check` checks JavaScript syntax; `npm start -- help` checks package imports without a wallet or network request. On-chain assertions run only when you execute the commands on devnet. Dependency installation or static checks do not establish transaction success. Transactions are separate operations and a later failure does not undo earlier successful steps.
