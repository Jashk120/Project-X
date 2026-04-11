import Fastify from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { logger } from "./logger";
import { solanaRoutes } from "./modules/solana/solana.routes";
import { webauthnRoutes } from "./modules/webauthn/webauthn.routes";
import { sessionRoutes } from "./modules/session/session.routes";
import cors from "@fastify/cors";

function isSocketIoRequest(url: string | undefined) {
  if (!url) return false;
  return url === "/socket.io" || url.startsWith("/socket.io/") || url.startsWith("/socket.io?");
}

export const buildApp = (server: Server) => {
  const app = Fastify({
    loggerInstance: logger,
    serverFactory: (handler) => {
      server.on("request", (req: IncomingMessage, res: ServerResponse) => {
        if (isSocketIoRequest(req.url) || res.writableEnded) {
          return;
        }

        (handler as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
      });

      return server;
    },
  });

  app.register(cors, {
    origin: true, // allow all origins in dev
  });

  app.register(solanaRoutes, { prefix: "/api/v1" });
  app.register(webauthnRoutes, { prefix: "/api/v1" });
  app.register(sessionRoutes, { prefix: "/api/v1" });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
};
