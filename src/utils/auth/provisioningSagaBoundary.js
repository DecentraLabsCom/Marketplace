import {
  advanceProvisioningSaga,
  markProvisioningReconciliationRequired,
} from './provisioningReplayStore';
import { emitProvisioningOperationalAlert } from './provisioningOperationalAlert';

export class ProvisioningReconciliationRequiredError extends Error {
  constructor(message = 'Provisioning state requires operational reconciliation') {
    super(message);
    this.name = 'ProvisioningReconciliationRequiredError';
    this.code = 'PROVISIONING_RECONCILIATION_REQUIRED';
    this.status = 503;
  }
}

export async function recordProvisioningResult(jti, result, { operation = 'institution-provisioning' } = {}) {
  try {
    return await advanceProvisioningSaga(jti, result);
  } catch (auditError) {
    let markerPersisted = false;
    try {
      await markProvisioningReconciliationRequired(jti, {
        errorCode: 'PROVISIONING_AUDIT_WRITE_FAILED',
        failedStage: result?.stage || null,
      });
      markerPersisted = true;
    } catch {
      // The alert below remains the durable hand-off when Redis is unavailable.
    }

    try {
      await emitProvisioningOperationalAlert({
        jti,
        operation,
        stage: result?.stage,
        txHashes: result?.txHashes,
        error: auditError,
        markerPersisted,
      });
    } catch {
      // Alert delivery must not hide the safe public failure response.
    }

    throw new ProvisioningReconciliationRequiredError();
  }
}
