use anchor_lang::prelude::*;

#[account]
pub struct Credential {
    pub owner: Pubkey,           // user's wallet
    pub platform: Pubkey,        // platform that enrolled them
    pub credential_hash: [u8; 32], // hash of biometric proof — raw biometric never stored
    pub enrolled_at: i64,        // unix timestamp
    pub is_active: bool,
    pub bump: u8,
}

impl Credential {
    pub const LEN: usize = 8    // discriminator
        + 32                    // owner
        + 32                    // platform
        + 32                    // credential_hash
        + 8                     // enrolled_at
        + 1                     // is_active
        + 1;                    // bump
}