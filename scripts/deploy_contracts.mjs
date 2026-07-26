#!/usr/bin/env node
/**
 * deploy_contracts.mjs
 * Orchestrates Base Mainnet / Sepolia testnet deployment for PIM Vault smart contracts.
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(__dirname, '../lib/contracts');

const network = process.argv[2] || 'base-sepolia';

console.log(`[PIM Vault] Initiating Smart Contract Deployment to network: ${network}`);
console.log(`Working directory: ${CONTRACTS_DIR}`);

try {
  const cmd = `npx hardhat run scripts/deploy.ts --network ${network}`;
  console.log(`Executing: ${cmd}`);
  const output = execSync(cmd, { cwd: CONTRACTS_DIR, encoding: 'utf8' });
  console.log('\n--- DEPLOYMENT SUCCESS ---');
  console.log(output);
} catch (err) {
  console.error('[PIM Vault] Deployment error or simulation notice:');
  console.error(err.message || err);
}
