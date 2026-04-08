import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: isProd ? "info" : "debug",
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
        },
      },
});