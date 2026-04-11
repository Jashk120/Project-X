import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  SOLANA_RPC: z.string().default("https://api.devnet.solana.com"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PLATFORM_KEYPAIR: z.string(), // base58 encoded private key
  PLATFORM_API_KEY: z.string().min(1, "PLATFORM_API_KEY is required"),
  WEBAUTHN_RP_NAME: z.string().default("Project X"),
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_ORIGINS: z.string().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
