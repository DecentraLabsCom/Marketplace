import { Wallet } from 'ethers';
import {
  buildProvisioningPairingTypedData,
  recoverProvisioningPairingWalletAddress,
} from '../provisioningPairingTypedData';

const wallet = new Wallet('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const claims = {
  institutionId: 'example.edu',
  walletAddress: wallet.address,
  canonicalBackendOrigin: 'https://gateway.example.edu',
  registrationType: 'provider',
  chainId: 11_155_111,
  registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
  challenge: `0x${'11'.repeat(32)}`,
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_000_600,
};

describe('institution provisioning pairing proof', () => {
  test('recovers the institutional wallet from the exact pairing claims', async () => {
    const typedData = buildProvisioningPairingTypedData(claims);
    const signature = await wallet.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
    );

    expect(recoverProvisioningPairingWalletAddress(claims, signature)).toBe(wallet.address);
  });

  test('does not validate a proof after the backend origin is changed', async () => {
    const typedData = buildProvisioningPairingTypedData(claims);
    const signature = await wallet.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
    );

    expect(recoverProvisioningPairingWalletAddress({
      ...claims,
      canonicalBackendOrigin: 'https://attacker.example',
    }, signature)).not.toBe(wallet.address);
  });
});
