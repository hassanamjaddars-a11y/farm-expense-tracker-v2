const router = require("express").Router();
const UserSetting = require("../models/UserSetting");
const auth = require("../middleware/auth");

const cleanNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cleanString = (value) => String(value || "").trim();

async function getOrCreateUserSetting(userId) {
  let setting = await UserSetting.findOne({ user: userId });

  if (!setting) {
    setting = await UserSetting.create({
      user: userId,
      murhWeightKg: 40,
      defaultOwnerSharePercentage: 70,
      defaultWorkerSharePercentage: 30,
      currencyLabel: "Rs",
    });
  }

  return setting;
}

router.get("/", auth, async (req, res) => {
  try {
    const setting = await getOrCreateUserSetting(req.user._id);
    res.json(setting);
  } catch (err) {
    console.error("GET settings error:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/", auth, async (req, res) => {
  try {
    const setting = await getOrCreateUserSetting(req.user._id);

    const murhWeightKg =
      req.body.murhWeightKg === undefined
        ? setting.murhWeightKg
        : cleanNumber(req.body.murhWeightKg);

    const defaultOwnerSharePercentage =
      req.body.defaultOwnerSharePercentage === undefined
        ? setting.defaultOwnerSharePercentage
        : cleanNumber(req.body.defaultOwnerSharePercentage);

    const defaultWorkerSharePercentage =
      req.body.defaultWorkerSharePercentage === undefined
        ? 100 - defaultOwnerSharePercentage
        : cleanNumber(req.body.defaultWorkerSharePercentage);

    const currencyLabel =
      req.body.currencyLabel === undefined
        ? setting.currencyLabel
        : cleanString(req.body.currencyLabel) || "Rs";

    if (murhWeightKg <= 0) {
      return res.status(400).json({ error: "Murh weight must be greater than zero" });
    }

    if (
      defaultOwnerSharePercentage < 0 ||
      defaultOwnerSharePercentage > 100 ||
      defaultWorkerSharePercentage < 0 ||
      defaultWorkerSharePercentage > 100
    ) {
      return res.status(400).json({
        error: "Share percentages must be between 0 and 100",
      });
    }

    if (
      Math.abs(
        Number(defaultOwnerSharePercentage) + Number(defaultWorkerSharePercentage) - 100
      ) > 0.5
    ) {
      return res.status(400).json({
        error: "Owner and worker share percentages must total 100",
      });
    }

    setting.murhWeightKg = murhWeightKg;
    setting.defaultOwnerSharePercentage = defaultOwnerSharePercentage;
    setting.defaultWorkerSharePercentage = defaultWorkerSharePercentage;
    setting.currencyLabel = currencyLabel;

    await setting.save();

    res.json(setting);
  } catch (err) {
    console.error("PUT settings error:", err);
    res.status(500).json({ error: err?.message || "Failed to update settings" });
  }
});

module.exports = router;