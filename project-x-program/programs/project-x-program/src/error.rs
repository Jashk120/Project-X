use anchor_lang::prelude::*;

#[error_code]
pub enum ProjectXError {
    #[msg("Credential is inactive")]
    CredentialInactive,

    #[msg("Proximity attestation expired")]
    ProximityAttestationExpired,

    #[msg("Owner does not match credential")]
    OwnerMismatch,

    #[msg("Only the enrolling platform can revoke this credential")]
    UnauthorizedPlatform,

    #[msg("Rider does not match proximity attestation")]
    RiderMismatch,

    #[msg("Invalid proximity attestation")]
    InvalidProximityAttestation,

    #[msg("Session does not match proximity attestation")]
    SessionMismatch,

    #[msg("Proximity attestation expiry must be in the future")]
    InvalidAttestationExpiry,
}
