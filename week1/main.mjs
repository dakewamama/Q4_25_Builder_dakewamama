import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintToChecked, transferChecked, getAccount, getMint } from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { mplCore, create, update, fetchAsset } from '@metaplex-foundation/mpl-core';

const command = process.argv[2];
const args = process.argv.slice(3);
const help = `Week 1 — Solana DEVNET only
  npm start -- spl <recipient-wallet> [mint-amount=100] [transfer-amount=10]
  npm start -- nft <name> <public-https-metadata-uri>
  npm start -- update <asset-address> <new-name> <new-metadata-uri>
  npm start -- verify-spl <mint-address> <recipient-wallet>
  npm start -- verify-nft <asset-address>
Set WALLET_PATH to your devnet keypair; default ~/.config/solana/id.json.
Use a dedicated devnet wallet. Public evidence is saved in evidence/.`;

function amount(text, decimals = 9) {
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Invalid decimal amount');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`Maximum ${decimals} decimal places`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units <= 0n || units > 18446744073709551615n) throw new Error('Amount must be positive and fit u64');
  return units;
}

function metadataUri(text) {
  const uri = new URL(text);
  if (uri.protocol !== 'https:') throw new Error('Metadata must use public HTTPS');
  return uri.href;
}

function name(text) {
  if (!text?.trim()) throw new Error('NFT name is required');
  return text.trim();
}

async function evidence(step, details) {
  await mkdir('evidence', { recursive: true });
  const record = { network: 'devnet', observedAt: new Date().toISOString(), ...details };
  const file = `evidence/${step}-${Date.now()}.json`;
  await writeFile(file, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
  console.log(`Evidence saved: ${file}`);
}

async function main() {
  if (!command || command === '--help' || command === 'help') return console.log(help);
  if (!['spl', 'nft', 'update', 'verify-spl', 'verify-nft'].includes(command)) throw new Error(help);
  const expected = { spl: 1, nft: 2, update: 3, 'verify-spl': 2, 'verify-nft': 1 };
  if (args.length < expected[command]) throw new Error(help);
  // Validate arguments before any transaction can be sent.
  if (command === 'nft') { name(args[0]); metadataUri(args[1]); }
  if (command === 'update') { publicKey(args[0]); name(args[1]); metadataUri(args[2]); }
  const rpc = new Connection('https://api.devnet.solana.com', 'confirmed');
  const umi = createUmi('https://api.devnet.solana.com').use(mplCore());
  if (command === 'verify-nft') {
    const asset = await fetchAsset(umi, publicKey(args[0]));
    return evidence('nft-verify', { asset: asset.publicKey, name: asset.name, uri: asset.uri, owner: asset.owner, updateAuthority: asset.updateAuthority });
  }
  if (command === 'verify-spl') {
    const mint = new PublicKey(args[0]);
    const recipient = new PublicKey(args[1]);
    const { getAssociatedTokenAddress } = await import('@solana/spl-token');
    const ata = await getAssociatedTokenAddress(mint, recipient);
    const [mintInfo, tokenInfo] = await Promise.all([getMint(rpc, mint), getAccount(rpc, ata)]);
    return evidence('spl-verify', { mint: mint.toBase58(), decimals: mintInfo.decimals, supply: mintInfo.supply.toString(), recipient: recipient.toBase58(), recipientAta: ata.toBase58(), recipientBalance: tokenInfo.amount.toString() });
  }
  const walletPath = resolve(process.env.WALLET_PATH || `${homedir()}/.config/solana/id.json`);
  const bytes = JSON.parse(await readFile(walletPath, 'utf8'));
  if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every(x => Number.isInteger(x) && x >= 0 && x <= 255)) throw new Error('Wallet must be a Solana 64-byte JSON keypair');
  const payer = Keypair.fromSecretKey(Uint8Array.from(bytes));
  const signer = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(payer.secretKey));
  umi.use(signerIdentity(signer));
  console.log(`Network: devnet | Payer: ${payer.publicKey.toBase58()}`);
  if (command === 'spl') {
    const recipient = new PublicKey(args[0]);
    if (recipient.equals(payer.publicKey)) throw new Error('Recipient must be a different wallet');
    const supply = amount(args[1] || '100');
    const transferAmount = amount(args[2] || '10');
    if (transferAmount > supply) throw new Error('Transfer cannot exceed supply');
    const mintKeypair = Keypair.generate();
    // Preserve the public address before the first transaction, so partial runs remain traceable.
    await evidence('spl-start', { mint: mintKeypair.publicKey.toBase58(), payer: payer.publicKey.toBase58(), recipient: recipient.toBase58() });
    const mint = await createMint(rpc, payer, payer.publicKey, null, 9, mintKeypair);
    const source = await getOrCreateAssociatedTokenAccount(rpc, payer, mint, payer.publicKey);
    const destination = await getOrCreateAssociatedTokenAccount(rpc, payer, mint, recipient);
    const mintSignature = await mintToChecked(rpc, payer, mint, source.address, payer, supply, 9);
    await evidence('spl-mint', { mint: mint.toBase58(), signature: mintSignature, explorer: `https://explorer.solana.com/tx/${mintSignature}?cluster=devnet` });
    const transferSignature = await transferChecked(rpc, payer, source.address, mint, destination.address, payer, transferAmount, 9);
    const [mintInfo, sourceInfo, destinationInfo] = await Promise.all([getMint(rpc, mint), getAccount(rpc, source.address), getAccount(rpc, destination.address)]);
    if (mintInfo.supply !== supply || sourceInfo.amount !== supply - transferAmount || destinationInfo.amount !== transferAmount) throw new Error('Post-transaction balance verification failed');
    return evidence('spl-transfer', { mint: mint.toBase58(), payer: payer.publicKey.toBase58(), recipient: recipient.toBase58(), decimals: 9, supply: mintInfo.supply.toString(), sourceBalance: sourceInfo.amount.toString(), recipientBalance: destinationInfo.amount.toString(), signature: transferSignature, explorer: `https://explorer.solana.com/tx/${transferSignature}?cluster=devnet` });
  }
  if (command === 'nft') {
    const asset = generateSigner(umi);
    const assetName = name(args[0]);
    const uri = metadataUri(args[1]);
    await evidence('nft-start', { asset: asset.publicKey, owner: signer.publicKey, name: assetName, uri });
    const tx = await create(umi, { asset, name: assetName, uri }).sendAndConfirm(umi);
    const after = await fetchAsset(umi, asset.publicKey);
    if (after.name !== assetName || after.uri !== uri || after.owner !== signer.publicKey) throw new Error('NFT creation verification failed');
    const signature = base58.deserialize(tx.signature)[0];
    return evidence('nft-create', { asset: asset.publicKey, name: after.name, uri: after.uri, owner: after.owner, updateAuthority: after.updateAuthority, signature, explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` });
  }
  const assetAddress = publicKey(args[0]);
  const before = await fetchAsset(umi, assetAddress);
  if (before.updateAuthority.type !== 'Address' || before.updateAuthority.address !== signer.publicKey) throw new Error('This wallet is not the direct update authority');
  const updatedName = name(args[1]);
  const uri = metadataUri(args[2]);
  const tx = await update(umi, { asset: assetAddress, name: updatedName, uri }).sendAndConfirm(umi);
  const after = await fetchAsset(umi, assetAddress);
  if (after.name !== updatedName || after.uri !== uri) throw new Error('NFT update verification failed');
  const signature = base58.deserialize(tx.signature)[0];
  await evidence('nft-update', { asset: assetAddress, before: { name: before.name, uri: before.uri }, after: { name: after.name, uri: after.uri }, updateAuthority: after.updateAuthority, signature, explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` });
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
