import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  SOLANA_RPC: z.string().default("https://api.devnet.solana.com"),
  PLATFORM_KEYPAIR: z.string(), // base58 encoded private key
});

export const env = envSchema.parse(process.env);