import { createServer } from "http";
import { Server } from "socket.io";

const server = createServer();
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("joinSession", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log(`Socket.IO server running on port ${process.env.PORT || 3001}`);
});
