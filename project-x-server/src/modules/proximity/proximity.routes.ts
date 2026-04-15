import { FastifyInstance } from "fastify";
import * as controller from "./proximity.controller";

const coordinateSchema = {
  type: "object",
  required: ["lat", "lng"],
  properties: {
    lat: { type: "number" },
    lng: { type: "number" },
    accuracy: { type: "number" },
  },
} as const;

const partySchema = {
  type: "object",
  required: ["pubkey", "coords", "timestamp"],
  properties: {
    pubkey: { type: "string" },
    coords: coordinateSchema,
    timestamp: { type: "string" },
  },
} as const;

export async function proximityRoutes(app: FastifyInstance) {
  app.post(
    "/proximity/attest",
    {
      schema: {
        body: {
          type: "object",
          required: ["sessionId", "driver", "rider"],
          properties: {
            sessionId: { type: "string" },
            driver: partySchema,
            rider: partySchema,
          },
        },
      },
    },
    controller.attestHandler,
  );

  app.get(
    "/proximity/:attestationId",
    {
      schema: {
        params: {
          type: "object",
          required: ["attestationId"],
          properties: {
            attestationId: { type: "string" },
          },
        },
      },
    },
    controller.getHandler,
  );
}
