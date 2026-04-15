import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env";
import * as service from "./session.service";

function assertPlatformApiKey(req: FastifyRequest) {
  const value = req.headers["x-project-x-platform-key"];
  const apiKey = Array.isArray(value) ? value[0] : value;

  if (apiKey !== env.PLATFORM_API_KEY) {
    throw new Error("invalid platform api key");
  }
}

export async function createHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    assertPlatformApiKey(req);
    const { tripId, driverPubkey } = req.body as {
      tripId: string;
      driverPubkey: string;
    };

    const result = await service.createSession({ tripId, driverPubkey });
    return reply.code(200).send(result);
  } catch (err: any) {
    const code = err.message === "invalid platform api key" ? 401 : 400;
    return reply.code(code).send({ error: err.message });
  }
}

export async function joinHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { sessionId, riderPubkey } = req.body as {
      sessionId: string;
      riderPubkey: string;
    };

    const result = await service.joinSessionAsRider(sessionId, riderPubkey);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}

export async function getHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { sessionId } = req.params as { sessionId: string };
    const result = await service.getSession(sessionId);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
}

export async function closeHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    assertPlatformApiKey(req);
    const { sessionId } = req.body as { sessionId: string };
    const result = await service.closeSession(sessionId);
    return reply.code(200).send(result);
  } catch (err: any) {
    const code = err.message === "invalid platform api key" ? 401 : 400;
    return reply.code(code).send({ error: err.message });
  }
}
