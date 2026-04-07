use anchor_lang::prelude::*;

#[error_code]
pub enum ProjectXError {
    #[msg("Credential is inactive")]
    CredentialInactive,

    #[msg("Proximity check failed — parties must be within 50m")]
    ProximityCheckFailed,

    #[msg("Owner does not match credential")]
    OwnerMismatch,

    #[msg("Only the enrolling platform can revoke this credential")]
    UnauthorizedPlatform,
}