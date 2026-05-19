const router = require("express").Router();
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const getMemberUserId = (member) => {
  return String(member?.user?._id || member?.user || "");
};

const userIsConversationMember = (conversation, userId) => {
  return conversation.members.some((member) => getMemberUserId(member) === String(userId));
};

const makeDirectKey = (userIdA, userIdB) => {
  return [String(userIdA), String(userIdB)].sort().join(":");
};

const populateConversation = (query) => {
  return query
    .populate("members.user", "name email profilePhoto companyName appRole")
    .populate("lastMessage");
};

const emitConversationUpdate = async (req, conversationId) => {
  const io = req.app.get("io");
  if (!io) return;

  const conversation = await populateConversation(
    Conversation.findById(conversationId)
  );

  if (!conversation) return;

  conversation.members.forEach((member) => {
    const memberUserId = getMemberUserId(member);
    if (memberUserId) {
      io.to(`user:${memberUserId}`).emit("conversation:updated", conversation);
    }
  });
};

// Get all conversations for current user
router.get("/conversations", auth, async (req, res) => {
  try {
    const conversations = await populateConversation(
      Conversation.find({
        "members.user": req.user._id,
        isArchived: false,
      }).sort({ lastMessageAt: -1, updatedAt: -1 })
    );

    res.json({ items: conversations });
  } catch (err) {
    console.error("GET CONVERSATIONS error:", err);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

// Create or get direct conversation
router.post("/conversations/direct", auth, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Valid userId is required" });
    }

    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ error: "You cannot chat with yourself" });
    }

    const otherUser = await User.findById(userId).select("_id name email");
    if (!otherUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const directKey = makeDirectKey(req.user._id, userId);

    let conversation = await Conversation.findOne({
      type: "direct",
      directKey,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        type: "direct",
        createdBy: req.user._id,
        directKey,
        members: [
          {
            user: req.user._id,
            role: "owner",
            joinedAt: new Date(),
          },
          {
            user: otherUser._id,
            role: "member",
            joinedAt: new Date(),
          },
        ],
      });
    }

    const populated = await populateConversation(
      Conversation.findById(conversation._id)
    );

    await emitConversationUpdate(req, conversation._id);

    res.json({ conversation: populated });
  } catch (err) {
    console.error("CREATE DIRECT CONVERSATION error:", err);
    res.status(500).json({ error: "Failed to create direct conversation" });
  }
});

// Create group conversation
router.post("/conversations/group", auth, async (req, res) => {
  try {
    const { title, memberIds = [] } = req.body;

    const cleanTitle = String(title || "").trim();

    if (!cleanTitle) {
      return res.status(400).json({ error: "Group title is required" });
    }

    const uniqueMemberIds = [
      ...new Set([String(req.user._id), ...memberIds.map((id) => String(id))]),
    ].filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (uniqueMemberIds.length < 2) {
      return res.status(400).json({ error: "Select at least one other group member" });
    }

    const validUsers = await User.find({
      _id: { $in: uniqueMemberIds },
      isActive: true,
    }).select("_id");

    const validIds = validUsers.map((user) => String(user._id));

    if (!validIds.includes(String(req.user._id))) {
      validIds.push(String(req.user._id));
    }

    const conversation = await Conversation.create({
      type: "group",
      title: cleanTitle,
      createdBy: req.user._id,
      members: validIds.map((id) => ({
        user: id,
        role: String(id) === String(req.user._id) ? "owner" : "member",
        joinedAt: new Date(),
      })),
    });

    const populated = await populateConversation(
      Conversation.findById(conversation._id)
    );

    await emitConversationUpdate(req, conversation._id);

    res.json({ conversation: populated });
  } catch (err) {
    console.error("CREATE GROUP CONVERSATION error:", err);
    res.status(500).json({ error: "Failed to create group conversation" });
  }
});

// Get one conversation
router.get("/conversations/:conversationId", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const conversation = await populateConversation(
      Conversation.findById(conversationId)
    );

    if (!conversation || !userIsConversationMember(conversation, req.user._id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ conversation });
  } catch (err) {
    console.error("GET CONVERSATION error:", err);
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

// Get messages from a conversation
router.get("/conversations/:conversationId/messages", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation || !userIsConversationMember(conversation, req.user._id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const filter = {
      conversation: conversationId,
      deletedAt: null,
    };

    if (before && !Number.isNaN(before.getTime())) {
      filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .populate("sender", "name email profilePhoto")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      items: messages.reverse(),
    });
  } catch (err) {
    console.error("GET MESSAGES error:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// Send message by REST API
router.post("/conversations/:conversationId/messages", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const {
      text = "",
      messageType = "text",
      attachments = [],
      clientId = "",
    } = req.body;

    const cleanText = String(text || "").trim();

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    if (!cleanText && (!Array.isArray(attachments) || attachments.length === 0)) {
      return res.status(400).json({ error: "Message is empty" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation || !userIsConversationMember(conversation, req.user._id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      text: cleanText,
      messageType,
      attachments: Array.isArray(attachments) ? attachments : [],
      clientId: String(clientId || ""),
      readBy: [
        {
          user: req.user._id,
          readAt: new Date(),
        },
      ],
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageText = cleanText || messageType;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    await message.populate("sender", "name email profilePhoto");

    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${conversationId}`).emit("message:new", message);
      await emitConversationUpdate(req, conversationId);
    }

    res.json({ message });
  } catch (err) {
    console.error("SEND MESSAGE error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Mark conversation as read
router.patch("/conversations/:conversationId/read", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation || !userIsConversationMember(conversation, req.user._id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const now = new Date();

    await Conversation.updateOne(
      {
        _id: conversationId,
        "members.user": req.user._id,
      },
      {
        $set: {
          "members.$.lastReadAt": now,
        },
      }
    );

    await Message.updateMany(
      {
        conversation: conversationId,
        "readBy.user": { $ne: req.user._id },
      },
      {
        $push: {
          readBy: {
            user: req.user._id,
            readAt: now,
          },
        },
      }
    );

    await emitConversationUpdate(req, conversationId);

    res.json({ ok: true });
  } catch (err) {
    console.error("MARK READ error:", err);
    res.status(500).json({ error: "Failed to mark conversation as read" });
  }
});

module.exports = router;