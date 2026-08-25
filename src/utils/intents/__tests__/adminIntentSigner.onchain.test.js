const mockContract = {
  registerActionIntent: jest.fn(),
  registerReservationIntent: jest.fn(),
  cancelIntent: jest.fn(),
  expireIntent: jest.fn(),
  getIntent: jest.fn(),
  nextIntentNonce: jest.fn(),
  DEFAULT_ADMIN_ROLE: jest.fn(),
  hasRole: jest.fn(),
  runner: null,
}

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn(() => mockContract),
    },
  }
})

jest.mock('@/contracts/diamond', () => ({
  contractABI: [],
  contractAddresses: {
    sepolia: '0x1111111111111111111111111111111111111111',
  },
}))

jest.mock('@/app/api/contract/utils/getProvider', () => ({
  __esModule: true,
  default: jest.fn(),
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
  },
  isDebugEnabled: jest.fn(() => false),
}))

import { ethers } from 'ethers'
import getProvider from '@/app/api/contract/utils/getProvider'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { isDebugEnabled } from '@/utils/dev/logger'
import {
  INTENT_META_TYPES,
  hashActionPayload,
} from '@/utils/intents/signInstitutionalActionIntent'
import {
  cancelIntentOnChain,
  expireIntentOnChain,
  getAdminAddress,
  getIntentOnChain,
  registerIntentOnChain,
  signIntentMeta,
} from '../adminIntentSigner'

const SIGNER_PRIVATE_KEY = `0x${'11'.repeat(32)}`
const SIGNER_ADDRESS = new ethers.Wallet(SIGNER_PRIVATE_KEY).address
const EXECUTOR_ADDRESS = '0x2222222222222222222222222222222222222222'
const DIAMOND_ADDRESS = '0x1111111111111111111111111111111111111111'
const REQUEST_ID = `0x${'ab'.repeat(32)}`
const RESERVATION_KEY = `0x${'cd'.repeat(32)}`
const ASSERTION_HASH = `0x${'ef'.repeat(32)}`
const DOMAIN = {
  name: 'DecentraLabsIntent',
  version: '1',
  chainId: 11155111,
  verifyingContract: DIAMOND_ADDRESS,
}

const actionPayload = {
  executor: EXECUTOR_ADDRESS,
  schacHomeOrganization: 'uni.example',
  pucHash: ethers.ZeroHash,
  assertionHash: ASSERTION_HASH,
  labId: 7,
  reservationKey: RESERVATION_KEY,
  uri: 'ipfs://lab',
  price: 9,
  maxBatch: 3,
  accessURI: 'https://gateway.example/lab',
  accessKey: 'lab-7',
  tokenURI: 'ipfs://metadata',
  resourceType: 1,
}

const reservationPayload = {
  executor: EXECUTOR_ADDRESS,
  schacHomeOrganization: 'uni.example',
  pucHash: ethers.ZeroHash,
  assertionHash: ASSERTION_HASH,
  labId: 7,
  start: 1_700_000_100,
  end: 1_700_000_220,
  price: 240,
  reservationKey: RESERVATION_KEY,
}

const createMeta = (overrides = {}) => ({
  requestId: REQUEST_ID,
  signer: SIGNER_ADDRESS,
  executor: EXECUTOR_ADDRESS,
  action: 1,
  payloadHash: hashActionPayload(actionPayload),
  nonce: 5n,
  requestedAt: 100n,
  expiresAt: 200n,
  ...overrides,
})

const signMeta = (meta) => new ethers.Wallet(SIGNER_PRIVATE_KEY).signTypedData(
  DOMAIN,
  INTENT_META_TYPES,
  meta,
)

describe('adminIntentSigner on-chain adapter', () => {
  const originalPrivateKey = process.env.WALLET_PRIVATE_KEY
  const originalWalletAddress = process.env.WALLET_ADDRESS

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.WALLET_PRIVATE_KEY = SIGNER_PRIVATE_KEY
    delete process.env.WALLET_ADDRESS

    mockContract.runner = {
      getBlock: jest.fn().mockResolvedValue({ timestamp: 150 }),
    }
    mockContract.nextIntentNonce.mockResolvedValue(5n)
    mockContract.getIntent.mockResolvedValue({ state: 0n })
    mockContract.DEFAULT_ADMIN_ROLE.mockResolvedValue('0xadmin-role')
    mockContract.hasRole.mockResolvedValue(true)
    mockContract.registerActionIntent.mockResolvedValue({
      hash: '0xaction-tx',
      wait: jest.fn().mockResolvedValue({ status: 1, blockNumber: 101 }),
    })
    mockContract.registerReservationIntent.mockResolvedValue({
      hash: '0xreservation-tx',
      wait: jest.fn().mockResolvedValue({ status: 1, blockNumber: 102 }),
    })
    mockContract.cancelIntent.mockResolvedValue({
      hash: '0xcancel-tx',
      wait: jest.fn().mockResolvedValue({ blockNumber: 103 }),
    })
    mockContract.expireIntent.mockResolvedValue({
      hash: '0xexpire-tx',
      wait: jest.fn().mockResolvedValue({ blockNumber: 104 }),
    })
    getProvider.mockResolvedValue(null)
    getContractInstance.mockResolvedValue(mockContract)
    isDebugEnabled.mockReturnValue(false)
  })

  afterAll(() => {
    if (originalPrivateKey === undefined) delete process.env.WALLET_PRIVATE_KEY
    else process.env.WALLET_PRIVATE_KEY = originalPrivateKey
    if (originalWalletAddress === undefined) delete process.env.WALLET_ADDRESS
    else process.env.WALLET_ADDRESS = originalWalletAddress
  })

  test('signs IntentMeta with the configured EIP-712 domain and normalizes integer fields', async () => {
    const meta = createMeta({ nonce: '5', requestedAt: '100', expiresAt: '200' })

    const signature = await signIntentMeta(meta, {
      domain: DOMAIN,
      types: INTENT_META_TYPES,
    })

    expect(ethers.verifyTypedData(DOMAIN, INTENT_META_TYPES, meta, signature)).toBe(SIGNER_ADDRESS)
  })

  test('resolves the explicit admin address without requiring a wallet provider', async () => {
    process.env.WALLET_ADDRESS = SIGNER_ADDRESS

    await expect(getAdminAddress()).resolves.toBe(SIGNER_ADDRESS)
    expect(getProvider).not.toHaveBeenCalled()
  })

  test('derives the admin address from the configured signing wallet when no explicit address exists', async () => {
    await expect(getAdminAddress()).resolves.toBe(SIGNER_ADDRESS)
    expect(getProvider).toHaveBeenCalledTimes(1)
  })

  test('registers an action intent with ABI-compatible normalized payload and deferred receipt', async () => {
    const meta = createMeta({ action: 4 })

    const result = await registerIntentOnChain(
      'action',
      meta,
      actionPayload,
      '0xadmin-signature',
      { waitForReceipt: false },
    )

    expect(mockContract.registerActionIntent).toHaveBeenCalledWith(
      [
        REQUEST_ID,
        SIGNER_ADDRESS,
        EXECUTOR_ADDRESS,
        4,
        meta.payloadHash,
        5n,
        100n,
        200n,
        0,
      ],
      [
        EXECUTOR_ADDRESS,
        'uni.example',
        ethers.ZeroHash,
        ASSERTION_HASH,
        7n,
        RESERVATION_KEY,
        'ipfs://lab',
        9n,
        3n,
        'https://gateway.example/lab',
        'lab-7',
        'ipfs://metadata',
        1n,
      ],
      '0xadmin-signature',
    )
    expect(result).toEqual({
      txHash: '0xaction-tx',
      blockNumber: null,
      wait: expect.any(Function),
    })
  })

  test('registers a reservation intent and waits for its receipt by default', async () => {
    const meta = createMeta({
      action: 8,
      payloadHash: `0x${'12'.repeat(32)}`,
    })

    const result = await registerIntentOnChain(
      'reservation',
      meta,
      reservationPayload,
      '0xreservation-signature',
    )

    expect(mockContract.registerReservationIntent).toHaveBeenCalledWith(
      [
        REQUEST_ID,
        SIGNER_ADDRESS,
        EXECUTOR_ADDRESS,
        8,
        meta.payloadHash,
        5n,
        100n,
        200n,
        0,
      ],
      [
        EXECUTOR_ADDRESS,
        'uni.example',
        ethers.ZeroHash,
        ASSERTION_HASH,
        7n,
        1_700_000_100n,
        1_700_000_220n,
        240n,
        RESERVATION_KEY,
      ],
      '0xreservation-signature',
    )
    expect(result).toEqual({ txHash: '0xreservation-tx', blockNumber: 102 })
  })

  test('fails before registration when debug preflight detects nonce and payload mismatches', async () => {
    isDebugEnabled.mockReturnValue(true)
    const meta = createMeta({
      nonce: 4n,
      payloadHash: `0x${'34'.repeat(32)}`,
    })
    const signature = await signMeta(meta)

    await expect(registerIntentOnChain(
      'action',
      meta,
      actionPayload,
      signature,
    )).rejects.toMatchObject({
      message: expect.stringContaining('Intent preflight failed'),
      preflight: expect.objectContaining({
        ok: false,
        errors: expect.arrayContaining([
          expect.stringContaining('nonce mismatch'),
          'payloadHash mismatch',
        ]),
      }),
    })
    expect(mockContract.registerActionIntent).not.toHaveBeenCalled()
  })

  test('passes debug preflight when signature, chain state and time window match', async () => {
    isDebugEnabled.mockReturnValue(true)
    const meta = createMeta()
    const signature = await signMeta(meta)

    await expect(registerIntentOnChain(
      'action',
      meta,
      actionPayload,
      signature,
      { waitForReceipt: false },
    )).resolves.toMatchObject({ txHash: '0xaction-tx', blockNumber: null })

    expect(getContractInstance).toHaveBeenCalledWith('diamond', true)
    expect(mockContract.nextIntentNonce).toHaveBeenCalledWith(SIGNER_ADDRESS)
    expect(mockContract.hasRole).toHaveBeenCalledWith('0xadmin-role', SIGNER_ADDRESS)
    expect(mockContract.registerActionIntent).toHaveBeenCalledTimes(1)
  })

  test('reports role and time-window failures during debug preflight', async () => {
    isDebugEnabled.mockReturnValue(true)
    mockContract.hasRole.mockResolvedValue(false)
    const meta = createMeta({ requestedAt: 200n, expiresAt: 140n })
    const signature = await signMeta(meta)

    await expect(registerIntentOnChain(
      'action',
      meta,
      actionPayload,
      signature,
    )).rejects.toMatchObject({
      preflight: expect.objectContaining({
        errors: expect.arrayContaining([
          expect.stringContaining('missing DEFAULT_ADMIN_ROLE'),
          expect.stringContaining('requestedAt'),
          expect.stringContaining('expiresAt'),
        ]),
      }),
    })
    expect(mockContract.registerActionIntent).not.toHaveBeenCalled()
  })

  test('reports an EIP-712 signer mismatch during debug preflight', async () => {
    isDebugEnabled.mockReturnValue(true)
    const otherSigner = new ethers.Wallet(`0x${'22'.repeat(32)}`)
    const meta = createMeta()
    const signature = await otherSigner.signTypedData(DOMAIN, INTENT_META_TYPES, meta)

    await expect(registerIntentOnChain(
      'action',
      meta,
      actionPayload,
      signature,
    )).rejects.toMatchObject({
      preflight: expect.objectContaining({
        errors: expect.arrayContaining([expect.stringContaining('signature mismatch')]),
      }),
    })
    expect(mockContract.registerActionIntent).not.toHaveBeenCalled()
  })

  test('returns the on-chain state and state name for a request', async () => {
    mockContract.getIntent.mockResolvedValue({ state: 2n, nonce: 5n })

    await expect(getIntentOnChain(REQUEST_ID)).resolves.toEqual({
      intent: { state: 2n, nonce: 5n },
      state: 2,
      stateName: 'executed',
    })
  })

  test('cancels only a pending intent owned by the configured signer', async () => {
    mockContract.getIntent.mockResolvedValue({ state: 1n, signer: SIGNER_ADDRESS })

    await expect(cancelIntentOnChain(REQUEST_ID)).resolves.toEqual({
      status: 'cancelled',
      txHash: '0xcancel-tx',
      blockNumber: 103,
    })
    expect(mockContract.cancelIntent).toHaveBeenCalledWith(REQUEST_ID)
  })

  test('can cancel a pending intent without waiting for its receipt', async () => {
    mockContract.getIntent.mockResolvedValue({ state: 1n, signer: SIGNER_ADDRESS })

    await expect(cancelIntentOnChain(REQUEST_ID, { waitForReceipt: false })).resolves.toEqual({
      status: 'cancelled',
      txHash: '0xcancel-tx',
      blockNumber: null,
    })
  })

  test('rejects cancellation when the registered signer is not the configured wallet', async () => {
    mockContract.getIntent.mockResolvedValue({
      state: 1n,
      signer: EXECUTOR_ADDRESS,
    })

    await expect(cancelIntentOnChain(REQUEST_ID)).rejects.toThrow(
      'Only the registered intent signer can cancel this intent',
    )
    expect(mockContract.cancelIntent).not.toHaveBeenCalled()
  })

  test('waits for a submitted registration before cancelling its now-pending intent', async () => {
    const provider = {
      waitForTransaction: jest.fn().mockResolvedValue({ status: 1 }),
    }
    getProvider.mockResolvedValue(provider)
    mockContract.getIntent
      .mockResolvedValueOnce({ state: 0n })
      .mockResolvedValue({ state: 1n, signer: SIGNER_ADDRESS })

    await expect(cancelIntentOnChain(REQUEST_ID, {
      submittedTxHash: '0xregistration-tx',
      waitForReceipt: false,
    })).resolves.toEqual({
      status: 'cancelled',
      txHash: '0xcancel-tx',
      blockNumber: null,
    })
    expect(provider.waitForTransaction).toHaveBeenCalledWith(
      '0xregistration-tx',
      1,
      15_000,
    )
  })

  test('does not submit cancellation for a terminal intent', async () => {
    mockContract.getIntent.mockResolvedValue({ state: 2n, signer: SIGNER_ADDRESS })

    await expect(cancelIntentOnChain(REQUEST_ID)).resolves.toEqual({
      state: 2,
      stateName: 'executed',
    })
    expect(mockContract.cancelIntent).not.toHaveBeenCalled()
  })

  test('materializes expiry and supports an idempotent already-expired race', async () => {
    mockContract.getIntent
      .mockResolvedValueOnce({ state: 1n })
      .mockResolvedValueOnce({ state: 4n })
    mockContract.expireIntent.mockRejectedValueOnce(new Error('already expired'))

    await expect(expireIntentOnChain(REQUEST_ID)).resolves.toEqual({
      state: 4,
      stateName: 'expired',
    })
    expect(mockContract.expireIntent).toHaveBeenCalledWith(REQUEST_ID)
  })

  test('materializes a pending expiry without waiting for its receipt', async () => {
    mockContract.getIntent.mockResolvedValue({ state: 1n })

    await expect(expireIntentOnChain(REQUEST_ID, { waitForReceipt: false })).resolves.toEqual({
      status: 'expired',
      txHash: '0xexpire-tx',
      blockNumber: null,
    })
  })

  test('rejects unsupported intent kinds before sending a transaction', async () => {
    await expect(registerIntentOnChain(
      'unsupported',
      createMeta(),
      actionPayload,
      '0xsignature',
    )).rejects.toThrow('Unsupported intent kind')
    expect(mockContract.registerActionIntent).not.toHaveBeenCalled()
    expect(mockContract.registerReservationIntent).not.toHaveBeenCalled()
  })
})
