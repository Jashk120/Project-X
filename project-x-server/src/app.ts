import Fastify from "fastify";
import { logger } from "./logger";
import { solanaRoutes } from "./modules/solana/solana.routes";
import cors from "@fastify/cors";

export const buildApp = () => {
const app = Fastify({ loggerInstance: logger });

  app.register(cors, {
    origin: true, // allow all origins in dev
  });

  app.register(solanaRoutes, { prefix: "/api/v1" });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
};