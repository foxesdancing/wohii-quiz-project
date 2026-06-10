const bcrypt = require("bcrypt");
const {
  resetDb,
  registerAndLogin,
  createQuestion,
  request,
  app,
  prisma,
} = require("./helpers");

beforeEach(resetDb);

it("returns 403 when editing someone else's question", async () => {
  const aliceToken = await registerAndLogin("alice@test.io", "Alice");
  const question = await createQuestion(aliceToken, {
    question: "Alice's question",
    answer: "alice's answer",
  });
  console.log(question);

  const bobToken = await registerAndLogin("bob@test.io", "Bob");
  const res = await request(app)
    .put(`/api/questions/${question.id}`)
    .set("Authorization", `Bearer ${bobToken}`)
    .send({ question: "hijacked", answer: "2026hijack" });

  expect(res.status).toBe(403);

  const after = await prisma.question.findUnique({
    where: { id: question.id },
  });
  expect(after.question).toBe("Alice's question"); // unchanged
});
