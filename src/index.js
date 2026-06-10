const app = require("./app");
const PORT = process.env.PORT || 3000;
const prisma = require("./lib/prisma");
const logger = require("./lib/logger");

// Start the server
app.listen(PORT, () => {
  const logger = require("./lib/logger");
  logger.info({ port: PORT }, "server listening");
});

// Graceful shutdown
async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
