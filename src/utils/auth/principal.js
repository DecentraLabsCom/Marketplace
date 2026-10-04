export const PrincipalType = Object.freeze({
  HUMAN: 'human',
  WORKLOAD: 'workload',
})

export const AuthMethod = Object.freeze({
  SAML2: 'saml2',
  ENTRA_ID: 'entra-id',
  CILOGON: 'cilogon',
  VC: 'vc',
  WALLET: 'wallet',
})

export function buildFederatedSub(protocol, provider, authority, externalSubject) {
  const values = [protocol, provider, authority, externalSubject]
  if (values.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('Federated subject components are required')
  }
  return values.map((value) => value.trim()).join(':')
}

export function assertCanonicalPrincipal(principal) {
  if (!principal || typeof principal !== 'object') {
    throw new Error('principal must be an object')
  }
  if (!Object.values(PrincipalType).includes(principal.principalType)) {
    throw new Error('principalType is invalid')
  }
  if (typeof principal.sub !== 'string' || !principal.sub.trim()) {
    throw new Error('principal.sub is required')
  }
  if (typeof principal.externalIssuer !== 'string' || !principal.externalIssuer.trim()) {
    throw new Error('principal.externalIssuer is required')
  }
  if (typeof principal.externalSubject !== 'string' || !principal.externalSubject.trim()) {
    throw new Error('principal.externalSubject is required')
  }
  if (!Object.values(AuthMethod).includes(principal.authMethod)) {
    throw new Error('principal.authMethod is invalid')
  }
  return principal
}

export default {
  PrincipalType,
  AuthMethod,
  buildFederatedSub,
  assertCanonicalPrincipal,
}
