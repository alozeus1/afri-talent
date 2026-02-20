import app from "./app.js";
import prisma from "./lib/prisma.js";
import logger from "./lib/logger.js";

const PORT = process.env.PORT || 4000;

// Start the server
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, "Server started");
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed");
    process.exit(0);
  });
});
