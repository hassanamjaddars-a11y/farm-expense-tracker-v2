const router = require("express").Router();
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const CallLog = require("../models/CallLog");
const Voicemail = require("../models/Voicemail");

const getMemberUserId = (member) => {
  return String(member?.user?._id || member?.user || "");
};

const userIsConversationMember = (conversation, userId) => {
  return conversation.members.some((member) => getMemberUserId(member) === String(userId));
};

const loadConversationForUser = async (conversationId, userId) => {
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return null;
  }

  const conversation = await Conversation.findById(conversationId);

  if (!conversation || !userIsConversationMember(conversation, userId)) {
    return null;
  }

  return conversation;
};

// Get call history
router.get("/history", auth, async (req, res) => {
  try {
    const items = await CallLog.find({
      participants: req.user._id,
    })
      .populate("caller", "name email profilePhoto")
      .populate("participants", "name email profilePhoto")
      .populate("conversation", "type title")
      .sort({ createdAt: -1 })
      .limit(80);

    res.json({ items });
  } catch (err) {
    console.error("GET CALL HISTORY error:", err);
    res.status(500).json({ error: "Failed to load call history" });
  }
});

// Start/log a call
router.post("/start", auth, async (req, res) => {
  try {
    const {
      conversationId = null,
      participantIds = [],
      callType = "audio",
    } = req.body;

    let conversation = null;
    let participants = [String(req.user._id)];

    if (conversationId) {
      conversation = await loadConversationForUser(conversationId, req.user._id);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      participants = conversation.members.map((member) => getMemberUserId(member));
    } else {
      const cleanParticipantIds = Array.isArray(participantIds)
        ? participantIds.map((id) => String(id)).filter((id) => mongoose.Types.ObjectId.isValid(id))
        : [];

      participants = [...new Set([String(req.user._id), ...cleanParticipantIds])];

      if (participants.length < 2) {
        return res.status(400).json({ error: "At least one participant is required" });
      }

      const validUsers = await User.find({
        _id: { $in: participants },
        isActive: true,
      }).select("_id");

      participants = validUsers.map((user) => String(user._id));
    }

    const callLog = await CallLog.create({
      conversation: conversation ? conversation._id : null,
      caller: req.user._id,
      participants,
      callType: callType === "video" ? "video" : "audio",
      status: "started",
      startedAt: new Date(),
    });

    await callLog.populate("caller", "name email profilePhoto");
    await callLog.populate("participants", "name email profilePhoto");

    const io = req.app.get("io");

    if (io) {
      participants.forEach((participantId) => {
        io.to(`user:${participantId}`).emit("call:started", callLog);
      });
    }

    res.json({ call: callLog });
  } catch (err) {
    console.error("START CALL error:", err);
    res.status(500).json({ error: "Failed to start call" });
  }
});

// End/update a call
router.patch("/:callId/end", auth, async (req, res) => {
  try {
    const { callId } = req.params;
    const { status = "completed", durationSeconds = 0 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({ error: "Invalid call id" });
    }

    const callLog = await CallLog.findById(callId);

    if (!callLog) {
      return res.status(404).json({ error: "Call not found" });
    }

    const isParticipant = callLog.participants.some(
      (id) => String(id) === String(req.user._id)
    );

    if (!isParticipant) {
      return res.status(403).json({ error: "You are not a participant in this call" });
    }

    const allowedStatuses = ["completed", "missed", "rejected", "cancelled"];

    callLog.status = allowedStatuses.includes(status) ? status : "completed";
    callLog.endedAt = new Date();
    callLog.durationSeconds = Math.max(0, Number(durationSeconds || 0));

    await callLog.save();

    await callLog.populate("caller", "name email profilePhoto");
    await callLog.populate("participants", "name email profilePhoto");

    const io = req.app.get("io");

    if (io) {
      callLog.participants.forEach((participantId) => {
        io.to(`user:${participantId}`).emit("call:ended", callLog);
      });
    }

    res.json({ call: callLog });
  } catch (err) {
    console.error("END CALL error:", err);
    res.status(500).json({ error: "Failed to end call" });
  }
});

// Create voicemail
router.post("/voicemails", auth, async (req, res) => {
  try {
    const {
      conversationId = null,
      toUserId,
      audioUrl = "",
      audioDataUrl = "",
      durationSeconds = 0,
      text = "",
    } = req.body;

    if (!toUserId || !mongoose.Types.ObjectId.isValid(toUserId)) {
      return res.status(400).json({ error: "Valid toUserId is required" });
    }

    if (String(toUserId) === String(req.user._id)) {
      return res.status(400).json({ error: "You cannot send voicemail to yourself" });
    }

    const recipient = await User.findById(toUserId).select("_id");
    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    let conversation = null;

    if (conversationId) {
      conversation = await loadConversationForUser(conversationId, req.user._id);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const recipientIsMember = conversation.members.some(
        (member) => getMemberUserId(member) === String(toUserId)
      );

      if (!recipientIsMember) {
        return res.status(400).json({ error: "Recipient is not in this conversation" });
      }
    }

    const voicemail = await Voicemail.create({
      conversation: conversation ? conversation._id : null,
      from: req.user._id,
      to: toUserId,
      audioUrl: String(audioUrl || ""),
      audioDataUrl: String(audioDataUrl || ""),
      durationSeconds: Math.max(0, Number(durationSeconds || 0)),
      text: String(text || "").trim(),
    });

    await voicemail.populate("from", "name email profilePhoto");
    await voicemail.populate("to", "name email profilePhoto");
    await voicemail.populate("conversation", "type title");

    const io = req.app.get("io");

    if (io) {
      io.to(`user:${toUserId}`).emit("voicemail:new", voicemail);
      io.to(`user:${String(req.user._id)}`).emit("voicemail:created", voicemail);
    }

    res.json({ voicemail });
  } catch (err) {
    console.error("CREATE VOICEMAIL error:", err);
    res.status(500).json({ error: "Failed to create voicemail" });
  }
});

// Get voicemails
router.get("/voicemails", auth, async (req, res) => {
  try {
    const { conversationId = "" } = req.query;

    const filter = {
      $or: [{ to: req.user._id }, { from: req.user._id }],
    };

    if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
      filter.conversation = conversationId;
    }

    const items = await Voicemail.find(filter)
      .populate("from", "name email profilePhoto")
      .populate("to", "name email profilePhoto")
      .populate("conversation", "type title")
      .sort({ createdAt: -1 })
      .limit(80);

    res.json({ items });
  } catch (err) {
    console.error("GET VOICEMAILS error:", err);
    res.status(500).json({ error: "Failed to load voicemails" });
  }
});

// Mark voicemail as read
router.patch("/voicemails/:voicemailId/read", auth, async (req, res) => {
  try {
    const { voicemailId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(voicemailId)) {
      return res.status(400).json({ error: "Invalid voicemail id" });
    }

    const voicemail = await Voicemail.findOne({
      _id: voicemailId,
      to: req.user._id,
    });

    if (!voicemail) {
      return res.status(404).json({ error: "Voicemail not found" });
    }

    voicemail.isRead = true;
    voicemail.readAt = new Date();
    await voicemail.save();

    res.json({ ok: true });
  } catch (err) {
    console.error("READ VOICEMAIL error:", err);
    res.status(500).json({ error: "Failed to mark voicemail as read" });
  }
});

module.exports = router;