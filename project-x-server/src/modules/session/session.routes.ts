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
          required: ["driverPubkey"],
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

  app.post(
    "/session/join-by-token",
    {
      schema: {
        body: {
          type: "object",
          required: ["joinToken", "riderPubkey"],
          properties: {
            joinToken: { type: "string" },
            riderPubkey: { type: "string" },
          },
        },
      },
    },
    controller.joinByTokenHandler,
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

  app.post(
    "/session/presence/issue",
    {
      schema: {
        body: {
          type: "object",
          required: ["sessionId", "requesterPubkey"],
          properties: {
            sessionId: { type: "string" },
            requesterPubkey: { type: "string" },
          },
        },
      },
    },
    controller.issuePresenceHandler,
  );

  app.post(
    "/session/presence/confirm",
    {
      schema: {
        body: {
          type: "object",
          required: ["sessionId", "responderPubkey", "challenge", "signature"],
          properties: {
            sessionId: { type: "string" },
            responderPubkey: { type: "string" },
            challenge: { type: "string" },
            signature: { type: "string" },
          },
        },
      },
    },
    controller.confirmPresenceHandler,
  );

  app.get(
    "/session/:sessionId/presence",
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
    controller.getPresenceHandler,
  );
}
