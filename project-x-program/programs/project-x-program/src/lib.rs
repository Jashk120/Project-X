use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod state;

use error::ProjectXError;
use state::Credential;

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
    /// CHECK: storing pubkey only
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub platform: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Verify<'info> {
    #[account(
        seeds = [b"credential", owner.key().as_ref()],
        bump = credential.bump,
    )]
    pub credential: Account<'info, Credential>,
    /// CHECK: checking pubkey matches
    pub owner: UncheckedAccount<'info>,
    pub verifier: Signer<'info>,
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

    pub fn verify(ctx: Context<Verify>, proximity_verified: bool) -> Result<()> {
        let credential = &ctx.accounts.credential;
        require!(credential.is_active, ProjectXError::CredentialInactive);
        require!(proximity_verified, ProjectXError::ProximityCheckFailed);
        require!(credential.owner == ctx.accounts.owner.key(), ProjectXError::OwnerMismatch);
        msg!("✅ Identity verified for {}", credential.owner);
        Ok(())
    }

    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        let credential = &mut ctx.accounts.credential;
        credential.is_active = false;
        msg!("🚫 Credential revoked for {}", credential.owner);
        Ok(())
    }
}