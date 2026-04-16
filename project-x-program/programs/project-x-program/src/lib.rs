use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod state;

use error::ProjectXError;
use state::{Credential, ProximityAttestation};

declare_id!("8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy");

#[derive(Accounts)]
pub struct Enroll<'info> {
    #[account(
        init,
        payer = platform,
        space = Credential::LEN,
        seeds = [b"credential", owner.key().as_ref()],
        bump
    )]
    pub credential: Account<'info, Credential>,
    pub owner: Signer<'info>,
    #[account(mut)]
    pub platform: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(session_id_hash: [u8; 32], attestation_nonce: u64)]
pub struct Verify<'info> {
    #[account(
        mut,
        close = verifier,
        seeds = [
            b"proximity",
            party_a.key().as_ref(),
            party_b.key().as_ref(),
            &attestation_nonce.to_le_bytes(),
        ],
        bump = proximity_attestation.bump,
    )]
    pub proximity_attestation: Account<'info, ProximityAttestation>,
    #[account(
        seeds = [b"credential", party_a.key().as_ref()],
        bump = credential.bump,
    )]
    pub credential: Account<'info, Credential>,
    pub party_a: Signer<'info>,
    pub party_b: Signer<'info>,
    #[account(mut)]
    pub verifier: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(session_id_hash: [u8; 32], attestation_nonce: u64)]
pub struct AttestProximity<'info> {
    #[account(
        init,
        payer = platform,
        space = ProximityAttestation::LEN,
        seeds = [
            b"proximity",
            party_a.key().as_ref(),
            party_b.key().as_ref(),
            &attestation_nonce.to_le_bytes(),
        ],
        bump
    )]
    pub proximity_attestation: Account<'info, ProximityAttestation>,
    /// CHECK: storing pubkey only
    pub party_a: UncheckedAccount<'info>,
    /// CHECK: storing pubkey only
    pub party_b: UncheckedAccount<'info>,
    #[account(mut)]
    pub platform: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Revoke<'info> {
    #[account(
        mut,
        seeds = [b"credential", owner.key().as_ref()],
        bump = credential.bump,
    )]
    pub credential: Account<'info, Credential>,
    /// CHECK: checking pubkey only
    pub owner: UncheckedAccount<'info>,
    #[account(constraint = platform.key() == credential.platform @ ProjectXError::UnauthorizedPlatform)]
    pub platform: Signer<'info>,
}
#[derive(Accounts)]
pub struct Close<'info> {
    #[account(
        mut,
        seeds = [b"credential", owner.key().as_ref()],
        bump = credential.bump,
        close = platform  // lamports go back to platform
    )]
    pub credential: Account<'info, Credential>,
    /// CHECK: checking pubkey only
    pub owner: UncheckedAccount<'info>,
    #[account(constraint = platform.key() == credential.platform @ ProjectXError::UnauthorizedPlatform)]
    pub platform: Signer<'info>,
}
#[program]
pub mod project_x_program {
    use super::*;

    pub fn enroll(ctx: Context<Enroll>, credential_hash: [u8; 32]) -> Result<()> {
        let credential = &mut ctx.accounts.credential;
        credential.owner = ctx.accounts.owner.key();
        credential.platform = ctx.accounts.platform.key();
        credential.credential_hash = credential_hash;
        credential.enrolled_at = Clock::get()?.unix_timestamp;
        credential.is_active = true;
        credential.bump = ctx.bumps.credential;
        Ok(())
    }

    pub fn attest_proximity(
        ctx: Context<AttestProximity>,
        session_id_hash: [u8; 32],
        attestation_nonce: u64,
        expires_at: i64,
    ) -> Result<()> {
        let issued_at = Clock::get()?.unix_timestamp;
        require!(expires_at > issued_at, ProjectXError::InvalidAttestationExpiry);

        let proximity_attestation = &mut ctx.accounts.proximity_attestation;
        proximity_attestation.party_a = ctx.accounts.party_a.key();
        proximity_attestation.party_b = ctx.accounts.party_b.key();
        proximity_attestation.platform = ctx.accounts.platform.key();
        proximity_attestation.session_id_hash = session_id_hash;
        proximity_attestation.issued_at = issued_at;
        proximity_attestation.expires_at = expires_at;
        proximity_attestation.attestation_nonce = attestation_nonce;
        proximity_attestation.bump = ctx.bumps.proximity_attestation;
        Ok(())
    }

    pub fn verify(
        ctx: Context<Verify>,
        session_id_hash: [u8; 32],
        attestation_nonce: u64,
    ) -> Result<()> {
        let credential = &ctx.accounts.credential;
        let proximity_attestation = &ctx.accounts.proximity_attestation;
        let now = Clock::get()?.unix_timestamp;

        require!(credential.is_active, ProjectXError::CredentialInactive);
        require!(credential.owner == ctx.accounts.party_a.key(), ProjectXError::PartyAMismatch);
        require!(proximity_attestation.party_a == ctx.accounts.party_a.key(), ProjectXError::InvalidProximityAttestation);
        require!(proximity_attestation.party_b == ctx.accounts.party_b.key(), ProjectXError::PartyBMismatch);
        require!(proximity_attestation.platform == ctx.accounts.verifier.key(), ProjectXError::UnauthorizedPlatform);
        require!(proximity_attestation.platform == credential.platform, ProjectXError::UnauthorizedPlatform);
        require!(proximity_attestation.session_id_hash == session_id_hash, ProjectXError::SessionMismatch);
        require!(proximity_attestation.attestation_nonce == attestation_nonce, ProjectXError::InvalidProximityAttestation);
        require!(proximity_attestation.expires_at >= now, ProjectXError::ProximityAttestationExpired);
        msg!("✅ Identity verified for {}", credential.owner);
        Ok(())
    }

    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        let credential = &mut ctx.accounts.credential;
        credential.is_active = false;
        msg!("🚫 Credential revoked for {}", credential.owner);
        Ok(())
    }
    pub fn close(_ctx: Context<Close>) -> Result<()> {
    Ok(())
    }
}
