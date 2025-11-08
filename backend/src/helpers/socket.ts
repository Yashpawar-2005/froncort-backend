import { Server } from 'socket.io';

let io: Server;

export const setIO = (socketServer: Server) => {
    io = socketServer;
};

export const getIO = (): Server => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};