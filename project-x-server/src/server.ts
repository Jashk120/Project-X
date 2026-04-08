import "dotenv/config";
import { buildApp } from "./app";
import { env } from "./config/env";
import { logger } from "./logger";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socket/socket.handler";

const start = async () => {
  try {
    const app = buildApp();

    await app.listen({ port: Number(env.PORT), host: "0.0.0.0" });

    // attach socket.io to the same http server
    const io = new Server(app.server, {
      cors: {
        origin: "*", // tighten this in production
        methods: ["GET", "POST"]
      }
    })

    registerSocketHandlers(io)
    logger.info("socket.io attached")

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