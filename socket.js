import { POOL } from "./config/database.js";

export const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("login", async ({ userId }) => {
      try {
        if (!userId) return;

        const [rows] = await POOL.query(
          "SELECT id, role FROM users WHERE id = ?",
          [userId]
        );
        console.log(rows)

        if (!rows.length) return;

        const user = rows[0];

        // save socket id
        await POOL.query(
          "UPDATE users SET socket_id = ? WHERE id = ?",
          [socket.id, userId]
        );
        
        // join role-based room
        socket.join(`${user.role.toLowerCase()}_${userId}`);
        console.log(`${user.role.toLowerCase()}_${userId}`)

        // console.log(`${user.role} ${userId} joined room`);
      } catch (error) {
        console.log("Socket login error:", error);
      }
    });

    socket.on("disconnect", async () => {
      await POOL.query(
        "UPDATE users SET socket_id = NULL WHERE socket_id = ?",
        [socket.id]
      );
      console.log("Socket disconnected:", socket.id);
    });
  });
};
