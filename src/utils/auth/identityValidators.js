import { buildValidatedIdentity } from './identityEvidence'

export class IdentityEvidenceValidator {
  async validate(_evidence) {
    throw new Error('validate() must be implemented by subclasses')
  }
}

export class SamlEvidenceValidator extends IdentityEvidenceValidator {
  async validate(evidence) {
    if (!evidence || evidence.type !== 'saml') {
      throw new Error('Unsupported SAML evidence')
    }

    return buildValidatedIdentity({
      type: evidence.type,
      format: evidence.format || 'saml2-base64',
      claims: evidence.claims || {},
      metadata: evidence.metadata || {},
      rawEvidence: evidence.rawEvidence || null,
    })
  }
}

export class VcEvidenceValidator extends IdentityEvidenceValidator {
  async validate(evidence) {
    if (!evidence || evidence.type === 'saml') {
      throw new Error('Unsupported VC evidence')
    }

    return buildValidatedIdentity({
      type: evidence.type,
      format: evidence.format || 'openid4vp',
      claims: evidence.claims || {},
      metadata: evidence.metadata || {},
      rawEvidence: evidence.rawEvidence || null,
    })
  }
}

export default {
  IdentityEvidenceValidator,
  SamlEvidenceValidator,
  VcEvidenceValidator,
}
