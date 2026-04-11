import { Server } from "socket.io";

export let io: Server | null = null;

export function setIo(ioInstance: Server) {
  io = ioInstance;
}

export function getIo(): Server {
  if (!io) {
    throw new Error("socket.io instance not initialized");
  }

  return io;
}
