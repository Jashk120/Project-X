import "dotenv/config";
import { createServer } from "node:http";
import { buildApp } from "./app";
import { env } from "./config/env";
import { logger } from "./logger";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socket/socket.handler";
import { setIo } from "./socket/socket.instance";

const start = async () => {
  try {
    const httpServer = createServer();

    // attach socket.io to the same http server
    const io = new Server(httpServer, {
      path: "/socket.io",
      addTrailingSlash: false,
      cors: {
        origin: "*", // tighten this in production
        methods: ["GET", "POST"]
      },
    });

    setIo(io);
    registerSocketHandlers(io);
    logger.info("socket.io attached");
    const app = buildApp(httpServer);
    await app.listen({ port: Number(env.PORT), host: "0.0.0.0" });

    process.on("SIGINT", async () => {
      logger.info("shutting down...");
      await app.close();
      process.exit(0);
    });
  } catch (err) {
    logger.error(err, "startup failed");
    process.exit(1);
  }
};

start();
