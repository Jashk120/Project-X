import { FastifyInstance } from "fastify";
import * as controller from "./session.controller";

export async function sessionRoutes(app: FastifyInstance) {
  app.post(
    "/session/create",
    {
      schema: {
        headers: {
          type: "object",
          required: ["x-project-x-platform-key"],
          properties: {
            "x-project-x-platform-key": { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["tripId", "driverPubkey", "riderPubkey"],
          properties: {
            tripId: { type: "string" },
            driverPubkey: { type: "string" },
            riderPubkey: { type: "string" },
          },
        },
      },
    },
    controller.createHandler,
  );

  app.get(
    "/session/:sessionId",
    {
      schema: {
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string" },
          },
        },
      },
    },
    controller.getHandler,
  );

  app.post(
    "/session/close",
    {
      schema: {
        headers: {
          type: "object",
          required: ["x-project-x-platform-key"],
          properties: {
            "x-project-x-platform-key": { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string" },
          },
        },
      },
    },
    controller.closeHandler,
  );
}
