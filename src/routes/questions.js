const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const isOwner = require("../middleware/isOwner");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "..", "public", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const newName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, newName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed."));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Apply authentication to ALL routes in this router
router.use(authenticate);

function formatQuestion(question, userId) {
  const attempted =
    Array.isArray(question.attempts) && question.attempts.length > 0;

  return {
    ...question,
    keywords: question.keywords.map((k) => k.name),
    userName: question.user?.name || null,
    attemptCount: question._count?.attempts ?? 0,
    //attempted: question.attempts ? question.attempts.length > 0 : false,

    solved: attempted,

    user: undefined,
    attempts: undefined,
    _count: undefined,
  };
}

// GET /api/questions/, /api/questions?keyword=httppage=1&limit=5
router.get("/", async (req, res) => {
  //res.json({ message: "Questions route works" });
  const { keywords } = req.query;

  const where = keywords
    ? { keywords: { some: { name: { in: keywords } } } }
    : {};

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 5));
  const skip = (page - 1) * limit;

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: {
        keywords: true,
        user: true,
        attempts: { where: { userId: req.user.userId }, take: 1 },
        _count: { select: { attempts: true } },
      },
      orderBy: { id: "asc" },
      skip,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);
  res.json({
    //data: questions.map(formatQuestion),
    data: questions.map((q) => formatQuestion(q, req.user.userId)),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/questions/:questionId
router.get("/:questionId", async (req, res) => {
  const questionId = Number(req.params.questionId);
  const questionS = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      keywords: true,
      user: true,
      attempts: { where: { userId: req.user.userId }, take: 1 },
      _count: { select: { attempts: true } },
    },
  });

  if (!questionS) {
    return res.status(404).json({ msg: "Question not found." });
  }
  //res.json(formatQuestion(questionS));
  res.json(formatQuestion(questionS, req.user.userId));
});

// POST /api/questions
router.post("/", upload.single("image"), async (req, res) => {
  const { question, answer, keywords } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ msg: "question and answer are required" });
  }

  const keywordsArray = Array.isArray(keywords) ? keywords : [];
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const newQuestion = await prisma.question.create({
    data: {
      question,
      answer,
      imageUrl,
      userId: req.user.userId,
      keywords: {
        connectOrCreate: keywordsArray.map((kw) => ({
          where: { name: kw },
          create: { name: kw },
        })),
      },
    },
    include: { keywords: true },
  });
  res.status(201).json(formatQuestion(newQuestion));
});

// PUT /api/questions/:questionId — isOwner checks existence + ownership
router.put(
  "/:questionId",
  isOwner,
  upload.single("image"),
  async (req, res) => {
    const questionId = Number(req.params.questionId);
    const { question, answer, keywords } = req.body;
    const existingQuestion = await prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!existingQuestion) {
      return res.status(404).json({ msg: "Question not found." });
    }

    if (!question || !answer) {
      return res.status(400).json({ msg: "question and answer are required" });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const keywordsArray = Array.isArray(keywords) ? keywords : [];
    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: {
        question,
        answer,
        imageUrl,
        keywords: {
          set: [],
          connectOrCreate: keywordsArray.map((kw) => ({
            where: { name: kw },
            create: { name: kw },
          })),
        },
      },
      include: { keywords: true },
    });
    res.json(formatQuestion(updatedQuestion));
  },
);

// DELETE /api/questions/:questionId isOwner checks existence + ownership
router.delete("/:questionId", isOwner, async (req, res) => {
  const questionId = Number(req.params.questionId);
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { keywords: true },
  });

  if (!question) {
    return res.status(404).json({ msg: "Question not found." });
  }
  await prisma.question.delete({ where: { id: questionId } });

  res.json({
    msg: "Question deleted succesfully.",
    question: formatQuestion(question),
  });
});

// POST /api/questions/:questionId/attempt
router.post("/:questionId/attempt", async (req, res) => {
  const questionId = Number(req.params.questionId);

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  const userAnswer = req.body.answer?.trim().toLowerCase();
  const correctAnswer = question.answer.trim().toLowerCase();

  const isCorrect = userAnswer === correctAnswer;

  if (isCorrect) {
    const badge = await prisma.badge.findUnique({
      where: { name: "Correct Answer" },
    });

    // ensure badge exists
    const existingBadge =
      badge ??
      (await prisma.badge.create({
        data: { name: "Correct Answer" },
      }));

    await prisma.userBadge.upsert({
      where: {
        userId_badgeId: {
          userId: req.user.userId,
          badgeId: existingBadge.id,
        },
      },
      update: {
        count: { increment: 1 },
      },
      create: {
        userId: req.user.userId,
        badgeId: existingBadge.id,
        count: 1,
      },
    });
  }

  // ONLY use attempt for tracking, not grading
  await prisma.attempt.upsert({
    where: {
      userId_questionId: {
        userId: req.user.userId,
        questionId,
      },
    },
    update: {},
    create: {
      userId: req.user.userId,
      questionId,
    },
  });

  const attemptCount = await prisma.attempt.count({
    where: { questionId },
  });

  return res.status(201).json({
    correct: isCorrect,
    correctAnswer: question.answer,
    attemptCount,
    questionId,
    badgeEarned: isCorrect ? "Correct Answer" : null,
  });
});

// DELETE /api/questions/:questionId/attempt
router.delete("/:questionId/attempt", async (req, res) => {
  const questionId = Number(req.params.questionId);

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  await prisma.attempt.deleteMany({
    where: { userId: req.user.userId, questionId },
  });

  const attemptCount = await prisma.attempt.count({ where: { questionId } });

  res.json({ questionId, attempted: false, attemptCount });
});

module.exports = router;
