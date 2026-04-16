use anchor_lang::prelude::*;

#[error_code]
pub enum ProjectXError {
    #[msg("Credential is inactive")]
    CredentialInactive,

    #[msg("Proximity attestation expired")]
    ProximityAttestationExpired,

    #[msg("Party A does not match credential owner")]
    PartyAMismatch,

    #[msg("Only the enrolling platform can revoke this credential")]
    UnauthorizedPlatform,

    #[msg("Party B does not match proximity attestation")]
    PartyBMismatch,

    #[msg("Invalid proximity attestation")]
    InvalidProximityAttestation,

    #[msg("Session does not match proximity attestation")]
    SessionMismatch,

    #[msg("Proximity attestation expiry must be in the future")]
    InvalidAttestationExpiry,
}
