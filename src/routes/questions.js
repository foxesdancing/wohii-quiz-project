const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const authenticate = require("../middleware/auth");
const isOwner = require("../middleware/isOwner");
const multer = require("multer");
const path = require("path");
const { ValidationError, NotFoundError } = require("../lib/errors");
const { z } = require("zod");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const QuestionInput = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  keywords: z.union([z.string(), z.array(z.string())]).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(), // Added validation schema for difficulty
});

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
      cb(new ValidationError("Only image files are allowed"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Apply authentication to ALL routes in this router
router.use(authenticate);

router.use((err, req, res, next) => {
  if (
    err instanceof multer.MulterError ||
    err?.message === "Only image files are allowed"
  ) {
    return res.status(400).json({ msg: err.message });
  }
  next(err);
});

function formatQuestion(question, userId) {
  const attempted =
    Array.isArray(question.attempts) && question.attempts.length > 0;

  return {
    ...question,
    keywords: Array.isArray(question.keywords)
      ? question.keywords.map((k) => k.name)
      : [],
    userName: question.user?.name || null,
    attemptCount: question._count?.attempts ?? 0,
    solved: attempted,
    user: undefined,
    attempts: undefined,
    _count: undefined,
  };
}

// GET /api/questions/, /api/questions?keyword=httppage=1&limit=5
router.get("/", async (req, res, next) => {
  try {
    const { keywords, difficulty } = req.query;

    // Build unified dynamic database query filters
    const where = {
      ...(keywords && {
        keywords: {
          some: {
            name: { in: Array.isArray(keywords) ? keywords : [keywords] },
          },
        },
      }),
      ...(difficulty && { difficulty: difficulty.toUpperCase() }),
    };

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

    return res.json({
      data: questions.map((q) => formatQuestion(q, req.user.userId)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/questions/quiz
router.get("/quiz", async (req, res, next) => {
  try {
    const { difficulty } = req.query;
    const whereClause = difficulty
      ? { difficulty: difficulty.toUpperCase() }
      : {};

    // Get all valid matching IDs first
    const allIds = await prisma.question.findMany({
      where: whereClause,
      select: { id: true },
    });

    if (allIds.length === 0) {
      return res.json([]);
    }

    // Shuffle IDs randomly and pick a maximum of 10 items
    const shuffledIds = allIds
      .sort(() => 0.5 - Math.random())
      .slice(0, 10)
      .map((q) => q.id);

    // Hydrate selected records with all relations needed for formatting
    const quizQuestions = await prisma.question.findMany({
      where: { id: { in: shuffledIds } },
      include: {
        keywords: true,
        user: true,
        attempts: { where: { userId: req.user.userId }, take: 1 },
        _count: { select: { attempts: true } },
      },
    });

    return res.json(
      quizQuestions.map((q) => formatQuestion(q, req.user.userId)),
    );
  } catch (error) {
    next(error);
  }
});

// POST /api/questions/ai-generate
router.post("/ai-generate", async (req, res, next) => {
  const { topic, difficulty } = req.body;
  const targetDifficulty = (difficulty || "MEDIUM").toUpperCase();

  if (!topic) {
    return res.status(400).json({ error: "Topic string field is required" });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = `
      Create an educational quiz question based on the topic: "${topic}". 
      The target difficulty tier must be exactly: "${targetDifficulty}".
      Return a clean, valid JSON object matching this exact structural interface:
      {
        "question": "The text of the question?",
        "answer": "The specific short text correction value answer"
      }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const aiData = JSON.parse(responseText);

    const newQuestion = await prisma.question.create({
      data: {
        question: aiData.question,
        answer: aiData.answer,
        difficulty: targetDifficulty,
        userId: req.user.userId,
      },
      include: {
        keywords: true,
        user: true,
        attempts: { where: { userId: req.user.userId }, take: 1 },
        _count: { select: { attempts: true } },
      },
    });

    return res.status(201).json({
      message: "AI Question created successfully!",
      data: formatQuestion(newQuestion, req.user.userId),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/questions/:questionId
router.get("/:questionId", async (req, res, next) => {
  try {
    const questionId = Number(req.params.questionId);
    if (isNaN(questionId)) return next();

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
      throw new NotFoundError("Question not found");
    }
    return res.json(formatQuestion(questionS, req.user.userId));
  } catch (error) {
    next(error);
  }
});
// POST /api/questions
router.post("/", upload.single("image"), async (req, res, next) => {
  try {
    const { question, answer, keywords, difficulty } = QuestionInput.parse(
      req.body,
    );

    if (!question || !answer) {
      throw new ValidationError("Question and answer are required");
    }

    const keywordsArray = Array.isArray(keywords) ? keywords : [];
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newQuestion = await prisma.question.create({
      data: {
        question,
        answer,
        imageUrl,
        difficulty: difficulty || "MEDIUM",
        userId: req.user.userId,
        keywords: {
          connectOrCreate: keywordsArray.map((kw) => ({
            where: { name: kw },
            create: { name: kw },
          })),
        },
      },
      include: {
        keywords: true,
        user: true,
        attempts: { where: { userId: req.user.userId }, take: 1 },
        _count: { select: { attempts: true } },
      },
    });
    return res.status(201).json(formatQuestion(newQuestion, req.user.userId));
  } catch (error) {
    next(error);
  }
});

// PUT /api/questions/:questionId — isOwner checks existence + ownership
router.put(
  "/:questionId",
  isOwner,
  upload.single("image"),
  async (req, res, next) => {
    try {
      const questionId = Number(req.params.questionId);
      const { question, answer, keywords, difficulty } = QuestionInput.parse(
        req.body,
      );

      const existingQuestion = await prisma.question.findUnique({
        where: { id: questionId },
      });
      if (!existingQuestion) {
        throw new NotFoundError("Question not found");
      }

      if (!question || !answer) {
        throw new ValidationError("Question and answer are required");
      }

      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
      const keywordsArray = Array.isArray(keywords) ? keywords : [];

      const updatedQuestion = await prisma.question.update({
        where: { id: questionId },
        data: {
          question,
          answer,
          imageUrl,
          difficulty: difficulty || existingQuestion.difficulty,
          keywords: {
            set: [],
            connectOrCreate: keywordsArray.map((kw) => ({
              where: { name: kw },
              create: { name: kw },
            })),
          },
        },
        include: {
          keywords: true,
          user: true,
          attempts: { where: { userId: req.user.userId }, take: 1 },
          _count: { select: { attempts: true } },
        },
      });
      return res.json(formatQuestion(updatedQuestion, req.user.userId));
    } catch (error) {
      next(error);
    }
  },
);
// DELETE /api/questions/:questionId isOwner checks existence + ownership
router.delete("/:questionId", isOwner, async (req, res, next) => {
  try {
    const questionId = Number(req.params.questionId);
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        keywords: true,
        user: true,
        attempts: { where: { userId: req.user.userId }, take: 1 },
        _count: { select: { attempts: true } },
      },
    });

    if (!question) {
      throw new NotFoundError("Question not found");
    }
    await prisma.question.delete({ where: { id: questionId } });

    return res.json({
      msg: "Question deleted successfully.",
      question: formatQuestion(question, req.user.userId),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/questions/:questionId/attempt
router.post("/:questionId/attempt", async (req, res, next) => {
  try {
    const questionId = Number(req.params.questionId);

    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundError("Question not found");
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
        (await prisma.badge.create({ data: { name: "Correct Answer" } }));

      // ONLY use attempt for tracking, not grading
      await prisma.userBadge.upsert({
        where: {
          userId_badgeId: {
            userId: req.user.userId,
            badgeId: existingBadge.id,
          },
        },
        update: { count: { increment: 1 } },
        create: {
          userId: req.user.userId,
          badgeId: existingBadge.id,
          count: 1,
        },
      });
    }

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

    const attemptCount = await prisma.attempt.count({ where: { questionId } });

    return res.status(201).json({
      correct: isCorrect,
      correctAnswer: question.answer,
      attemptCount,
      questionId,
      badgeEarned: isCorrect ? "Correct Answer" : null,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/questions/:questionId/attempt
router.delete("/:questionId/attempt", async (req, res, next) => {
  try {
    const questionId = Number(req.params.questionId);

    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundError("Question not found");
    }

    await prisma.attempt.deleteMany({
      where: { userId: req.user.userId, questionId },
    });

    const attemptCount = await prisma.attempt.count({ where: { questionId } });
    return res.json({ questionId, attempted: false, attemptCount });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
