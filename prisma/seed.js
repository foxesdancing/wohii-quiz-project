const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

const seedQuestions = [
  {
    question: "what does HTTP stand for?",
    answer:
      "HTTP is the foundation of communication on the web. It defines how clients and servers exchange data.",
    keywords: ["http", "web"],
  },
  {
    question: "What is the purpose of the HTTP GET method?",
    answer:
      "The HTTP GET method is used to retrieve data from a specified resource.",
    keywords: ["http", "get", "request"],
  },
  {
    question: "What does WWW stand for in the context of the internet?",
    answer: "WWW stands for World Wide Web.",
    keywords: ["www", "web"],
  },
  {
    question: "What do 400 series HTTP status codes indicate?",
    answer:
      "400 series HTTP status codes indicate client errors, meaning the request was malformed or could not be understood by the server.",
    keywords: ["http", "status", "client-error"],
  },
];

async function main() {
  await prisma.question.deleteMany();
  await prisma.keyword.deleteMany();
  await prisma.user.deleteMany();

  //Create default user
  const hashedPassword = await bcrypt.hash("1234", 10);
  const user = await prisma.user.create({
    data: {
      email: "admin@example.com",
      password: hashedPassword,
      name: "Admin User",
    },
  });

  console.log("Created user:", user.email);

  await prisma.badge.createMany({
    data: [{ name: "Correct Answer" }],
    skipDuplicates: true,
  });

  for (const question of seedQuestions) {
    await prisma.question.create({
      data: {
        question: question.question,
        answer: question.answer,
        userId: user.id,
        keywords: {
          connectOrCreate: question.keywords.map((kw) => ({
            where: { name: kw },
            create: { name: kw },
          })),
        },
      },
    });
  }

  console.log("Seed data inserted successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
