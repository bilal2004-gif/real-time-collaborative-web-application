import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import * as Y from 'yjs';

const port = Number(process.env.PORT) || 3001;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
  maxHttpBufferSize: 1e6,
});
const rooms = new Map();
const starterCode = `// Welcome to your shared workspace
// Invite someone to start building together.

function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("world"));
`;

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    const doc = new Y.Doc();
    doc.getText('code').insert(0, starterCode);
    room = { doc, strokes: [], members: new Map() };
    rooms.set(roomId, room);
  }
  return room;
}

function isValidStroke(stroke) {
  return (
    stroke &&
    typeof stroke.id === 'string' &&
    stroke.id.length <= 80 &&
    /^#[0-9a-f]{6}$/i.test(stroke.color) &&
    Number.isFinite(stroke.width) &&
    stroke.width >= 1 &&
    stroke.width <= 24 &&
    Array.isArray(stroke.points) &&
    stroke.points.length >= 2 &&
    stroke.points.length <= 3000 &&
    stroke.points.every(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= 1000 &&
        point.y >= 0 &&
        point.y <= 650,
    )
  );
}

function emitPresence(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('presence', [...room.members.values()]);
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, name, clientId } = {}) => {
    if (typeof roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(roomId)) {
      socket.emit('sync-error', 'This room link is invalid.');
      return;
    }

    const safeName =
      typeof name === 'string' && name.trim()
        ? name.trim().slice(0, 32)
        : 'Guest';
    const room = getRoom(roomId);
    socket.data.roomId = roomId;
    socket.data.clientId = Number.isSafeInteger(clientId) ? clientId : null;
    socket.data.name = safeName;
    socket.join(roomId);
    room.members.set(socket.id, {
      id: socket.id,
      name: safeName,
      color: `hsl(${Math.abs(Number(clientId) || 150) % 360} 68% 52%)`,
    });

    socket.emit('room-state', {
      update: Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString('base64'),
      strokes: room.strokes,
    });
    emitPresence(roomId);
  });

  socket.on('set-name', (name) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || typeof name !== 'string' || !name.trim()) return;
    const safeName = name.trim().slice(0, 32);
    socket.data.name = safeName;
    room.members.set(socket.id, {
      ...room.members.get(socket.id),
      name: safeName,
    });
    emitPresence(roomId);
  });

  socket.on('y-update', (encodedUpdate) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || typeof encodedUpdate !== 'string' || encodedUpdate.length > 1_000_000) {
      return;
    }
    try {
      const update = Buffer.from(encodedUpdate, 'base64');
      Y.applyUpdate(room.doc, update, socket.id);
      socket.to(roomId).emit('y-update', encodedUpdate);
    } catch (error) {
      console.error('Rejected an invalid collaborative document update:', error);
      socket.emit('sync-error', 'A document update could not be synchronized.');
    }
  });

  socket.on('awareness-update', (update) => {
    if (typeof update === 'string' && update.length <= 100_000 && socket.data.roomId) {
      socket.to(socket.data.roomId).emit('awareness-update', update);
    }
  });

  socket.on('board-stroke', (stroke) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || !isValidStroke(stroke)) return;
    room.strokes.push(stroke);
    if (room.strokes.length > 3000) room.strokes.shift();
    socket.to(roomId).emit('board-stroke', stroke);
  });

  socket.on('board-undo', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    const stroke = room?.strokes.pop();
    if (stroke) io.to(roomId).emit('board-undo', stroke.id);
  });

  socket.on('board-clear', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    room.strokes = [];
    io.to(roomId).emit('board-clear');
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    room.members.delete(socket.id);
    if (socket.data.clientId !== null && socket.data.clientId !== undefined) {
      socket.to(roomId).emit('awareness-remove', socket.data.clientId);
    }
    emitPresence(roomId);
  });
});

const distPath = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'));
  });
}

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Collaboration server listening on http://localhost:${port}`);
});
