require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const User = require("./models/User");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked for origin: ${origin}`));
};

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: "25mb" }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

app.set("io", io);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB connection error:", err));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ROUTES
app.use("/api/auth", require("./routes/authRoutes"));

app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/workers", require("./routes/workerRoutes"));

app.use("/api/expense-categories", require("./routes/expenseCategoryRoutes"));
app.use("/api/worker-categories", require("./routes/workerCategoryRoutes"));

app.use("/api/cash-book", require("./routes/cashBookRoutes"));
app.use("/api/sales", require("./routes/salesRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));

app.use("/api/reports", require("./routes/reportsRoutes"));

// CHAT / USERS / CALLS
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/calls", require("./routes/callRoutes"));

const getMemberUserId = (member) => {
  return String(member?.user?._id || member?.user || "");
};

const userIsConversationMember = (conversation, userId) => {
  return conversation.members.some((member) => getMemberUserId(member) === String(userId));
};

io.use(async (socket, next) => {
  try {
    const authToken = socket.handshake.auth?.token;
    const headerToken = socket.handshake.headers?.authorization?.startsWith("Bearer ")
      ? socket.handshake.headers.authorization.split(" ")[1]
      : null;

    const token = authToken || headerToken;

    if (!token) {
      return next(new Error("Socket unauthorized"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_jwt_secret");
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return next(new Error("Socket user not found"));
    }

    socket.user = user;
    next();
  } catch (error) {
    console.error("Socket auth error:", error);
    next(new Error("Socket invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = String(socket.user._id);

  socket.join(`user:${userId}`);

  socket.on("conversation:join", async (conversationId, ack) => {
    try {
      const conversation = await Conversation.findById(conversationId);

      if (!conversation || !userIsConversationMember(conversation, userId)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Conversation not found" });
        }
        return;
      }

      socket.join(`conversation:${conversationId}`);

      if (typeof ack === "function") {
        ack({ ok: true });
      }
    } catch (error) {
      console.error("conversation:join error:", error);
      if (typeof ack === "function") {
        ack({ ok: false, error: "Failed to join conversation" });
      }
    }
  });

  socket.on("conversation:leave", (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on("typing", async (payload = {}) => {
    try {
      const { conversationId, isTyping = true } = payload;

      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !userIsConversationMember(conversation, userId)) return;

      socket.to(`conversation:${conversationId}`).emit("typing", {
        conversationId,
        user: {
          id: socket.user._id,
          name: socket.user.name,
          email: socket.user.email,
        },
        isTyping: Boolean(isTyping),
      });
    } catch (error) {
      console.error("typing socket error:", error);
    }
  });

  socket.on("message:send", async (payload = {}, ack) => {
    try {
      const {
        conversationId,
        text = "",
        messageType = "text",
        attachments = [],
        clientId = "",
      } = payload;

      const cleanText = String(text || "").trim();

      if (!conversationId) {
        if (typeof ack === "function") ack({ ok: false, error: "Conversation is required" });
        return;
      }

      if (!cleanText && (!Array.isArray(attachments) || attachments.length === 0)) {
        if (typeof ack === "function") ack({ ok: false, error: "Message is empty" });
        return;
      }

      const conversation = await Conversation.findById(conversationId);

      if (!conversation || !userIsConversationMember(conversation, userId)) {
        if (typeof ack === "function") ack({ ok: false, error: "Conversation not found" });
        return;
      }

      const message = await Message.create({
        conversation: conversation._id,
        sender: socket.user._id,
        text: cleanText,
        messageType,
        attachments: Array.isArray(attachments) ? attachments : [],
        clientId: String(clientId || ""),
        readBy: [
          {
            user: socket.user._id,
            readAt: new Date(),
          },
        ],
      });

      conversation.lastMessage = message._id;
      conversation.lastMessageText = cleanText || messageType;
      conversation.lastMessageAt = new Date();
      await conversation.save();

      await message.populate("sender", "name email profilePhoto");

      const populatedConversation = await Conversation.findById(conversation._id)
        .populate("members.user", "name email profilePhoto")
        .populate("lastMessage");

      io.to(`conversation:${conversationId}`).emit("message:new", message);

      populatedConversation.members.forEach((member) => {
        const memberUserId = getMemberUserId(member);
        if (memberUserId) {
          io.to(`user:${memberUserId}`).emit("conversation:updated", populatedConversation);
        }
      });

      if (typeof ack === "function") {
        ack({ ok: true, message });
      }
    } catch (error) {
      console.error("message:send socket error:", error);
      if (typeof ack === "function") {
        ack({ ok: false, error: "Failed to send message" });
      }
    }
  });

  socket.on("disconnect", () => {
    socket.leave(`user:${userId}`);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));