const express = require('express');
const router = express.Router();

const questions = require("../data/questions");

// GET /api/questions/, /api/questions?keyword=geography
router.get("/", (req, res) => {
    const {keyword} = req.query;
    if(!keyword) {
        return res.json(questions);
    }
    const filteredQuestions = questions.filter(q=>q.keyword.includes(keyword));
   res.json(filteredQuestions);
})

// GET /api/questions/:questionId
router.get("/:questionId", (req, res) => {
    const questionId = Number(req.params.questionId)
    const questionS = questions.find(q=>q.id === questionId);
    if (!questionS) {
        return res.status(404).json({msg: "Question not found."});
    }
    res.json(questionS);
});
// POST /api/questions
router.post("/", (req, res) => {
    const {question, answer, keyword} = req.body;
    if (!question || !answer) {
        return res.status(400).json({msg: "question and answer are required"});
    }
    const existingIds = questions.map(q=> q.id) // [1,2,3,4]
    const maxId = Math.max(...existingIds)
    
    const newQuestion = {
        id: questions.length ? maxId + 1 : 1,
        question, answer, 
        keyword: Array.isArray(keyword) ? keyword : []
    }
    questions.push(newQuestion);
    res.status(201).json(newQuestion);
})

// PUT /api/questions/:questionId
router.put("/:questionId", (req, res) => {
    const questionId = Number(req.params.questionId)
    const existingQuestion = questions.find(q=>q.id === questionId);
    if (!existingQuestion) {
        return res.status(404).json({msg: "Question not found."});
    }

    const {question, answer, keyword} = req.body;
    if (!question || !answer) {
        return res.status(400).json({msg: "question and answer are required"});
    }
    existingQuestion.question = question;
    existingQuestion.answer = answer;
    existingQuestion.keyword = Array.isArray(keyword) ? keyword : [];

    res.json(existingQuestion);

})

// DELETE /api/questions/:questionId

router.delete("/:questionId", (req, res) => {
    const questionId = Number(req.params.questionId);
    const questionIndex = questions.findIndex(q=> q.id === questionId);

    if(questionIndex === -1) {
        return res.status(404).json({msg: "Question not found."})
    }
    const deletedQuestion = questions.splice(questionIndex, 1);
    res.json({
        msg: "Question deleted succesfully.",
        question: deletedQuestion
    });

});


module.exports = router;