const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");

function formatQuestion(question) {
  return {
    ...question,
    date: question.date.toISOString().split("T")[0],
    keywords: question.keywords.map((k) => k.name),
  };
}

// GET /api/questions/, /api/questions?keyword=geography
router.get("/", async (req, res) => {
  //res.json({ message: "Questions route works" });
  const { keyword } = req.query;

  const where = keyword ? { keywords: { some: { name: keyword } } } : {};

  const questions = await prisma.question.findMany({
    where,
    include: { keywords: true },
    orderBy: { id: "asc" },
  });

  res.json(questions.map(formatQuestion));
});

// GET /api/questions/:questionId
router.get("/:questionId", async (req, res) => {
  const questionId = Number(req.params.questionId);
  const questionS = await prisma.question.findUnique({
    where: { id: questionId },
    include: { keywords: true },
  });

  if (!questionS) {
    return res.status(404).json({ msg: "Question not found." });
  }
  res.json(questionS);
});

// POST /api/questions
router.post("/", async (req, res) => {
  const { question, answer, keyword } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ msg: "question and answer are required" });
  }

  const keywordsArray = Array.isArray(keywords) ? keyword : [];

  const newQuestion = await prisma.question.create({
    data: {
      question,
      answer,
      keywords: {
        connecctOrCreate: keywordsArray.map((kw) => ({
          where: { name: kw },
          create: { name: kw },
        })),
      },
    },
    include: { keywords: true },
  });
  res.status(201).json(formatQuestion(newQuestion));
});

// PUT /api/questions/:questionId
router.put("/:questionId", async (req, res) => {
  const questionId = Number(req.params.questionId);
  const { question, answer, keyword } = req.body;
  const existingQuestion = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!existingQuestion) {
    return res.status(404).json({ msg: "Question not found." });
  }

  if (!question || !answer) {
    return res.status(400).json({ msg: "question and answer are required" });
  }
  const keywordsArray = Array.isArray(keywords) ? keyword : [];
  const updatedQuestion = await prisma.question.update({
    where: { id: questionId },
    data: {
      question,
      answer,
      keywords: {
        set: [],
        connectOrCreate: keywordsArray.map((kw) => ({
          where: { name: kw },
          create: { name: kw },
        })),
      },
      include: { keywords: true },
    },
  });
  res.json(formatQuestion(updatedQuestion));
});

// DELETE /api/questions/:questionId

router.delete("/:questionId", async (req, res) => {
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

module.exports = router;
