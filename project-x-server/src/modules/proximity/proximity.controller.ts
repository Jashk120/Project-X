import { FastifyReply, FastifyRequest } from "fastify";
import * as service from "./proximity.service";

export async function attestHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { sessionId, driver, rider } = req.body as {
      sessionId: string;
      driver: {
        pubkey: string;
        coords: {
          lat: number;
          lng: number;
          accuracy?: number;
        };
        timestamp: string;
      };
      rider: {
        pubkey: string;
        coords: {
          lat: number;
          lng: number;
          accuracy?: number;
        };
        timestamp: string;
      };
    };

    const result = await service.attestProximity({ sessionId, driver, rider });
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
    const { attestationId } = req.params as { attestationId: string };
    const result = await service.getProximityAttestation(attestationId);
    return reply.code(200).send(result);
  } catch (err: any) {
    return reply.code(404).send({ error: err.message });
  }
}
