import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { env } from "./env";
import { ProjectXProgram } from "../types/project_x_program";
import idl from "../idl/project_x_program.json";

export const PROGRAM_ID = new PublicKey(
  "8uGQrehARt9knb4Fs7j15tTVifLwvM56Lre53kYNurTy"
);

export const connection = new Connection(env.SOLANA_RPC, "confirmed");

export const platformKeypair = Keypair.fromSecretKey(
  bs58.decode(env.PLATFORM_KEYPAIR)
);

const wallet = new Wallet(platformKeypair);

const provider = new AnchorProvider(connection, wallet, {
  commitment: "confirmed",
});
export const program = new Program<ProjectXProgram>(idl as any, provider);