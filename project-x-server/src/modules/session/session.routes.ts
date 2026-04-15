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
          required: ["tripId", "driverPubkey"],
          properties: {
            tripId: { type: "string" },
            driverPubkey: { type: "string" },
          },
        },
      },
    },
    controller.createHandler,
  );

  app.post(
    "/session/join",
    {
      schema: {
        body: {
          type: "object",
          required: ["sessionId", "riderPubkey"],
          properties: {
            sessionId: { type: "string" },
            riderPubkey: { type: "string" },
          },
        },
      },
    },
    controller.joinHandler,
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
