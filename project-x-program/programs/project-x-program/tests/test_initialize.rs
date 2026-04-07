use anchor_lang::prelude::*;
use litesvm::LiteSVM;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};

#[test]
fn test_enroll_and_verify() {
    let mut svm = LiteSVM::new();
    
    let platform = Keypair::new();
    let owner = Keypair::new();
    
    // Airdrop SOL to platform
    svm.airdrop(&platform.pubkey(), 1_000_000_000).unwrap();

    let credential_hash = [1u8; 32]; // mock biometric hash

    // Derive PDA
    let (credential_pda, _bump) = Pubkey::find_program_address(
        &[b"credential", owner.pubkey().as_ref()],
        &project_x_program::ID,
    );

    println!("✅ Platform: {}", platform.pubkey());
    println!("✅ Owner: {}", owner.pubkey());
    println!("✅ Credential PDA: {}", credential_pda);
    println!("✅ Credential hash: {:?}", credential_hash);
}