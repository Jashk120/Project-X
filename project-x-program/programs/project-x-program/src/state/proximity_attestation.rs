use anchor_lang::prelude::*;

#[account]
pub struct ProximityAttestation {
    pub party_a: Pubkey,
    pub party_b: Pubkey,
    pub platform: Pubkey,
    pub session_id_hash: [u8; 32],
    pub issued_at: i64,
    pub expires_at: i64,
    pub attestation_nonce: u64,
    pub bump: u8,
}

impl ProximityAttestation {
    pub const LEN: usize = 8
        + 32
        + 32
        + 32
        + 32
        + 8
        + 8
        + 8
        + 1;
}
