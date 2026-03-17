import app from "./app.js";
import prisma from "./lib/prisma.js";
import logger from "./lib/logger.js";
import { captureException, flushSentry } from "./lib/sentry.js";
const PORT = process.env.PORT || 4000;
// Start the server
const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, "Server started");
});
async function closeServer(signal) {
    logger.info({ signal }, `${signal} received, shutting down gracefully`);
    server.close(async () => {
        await prisma.$disconnect();
        await flushSentry();
        logger.info("Server closed");
        process.exit(0);
    });
}
async function handleFatalError(error, origin) {
    logger.error({ err: error, origin }, `Captured ${origin}`);
    captureException(error, { origin });
    await flushSentry();
    process.exit(1);
}
process.on("SIGTERM", () => {
    void closeServer("SIGTERM");
});
process.on("SIGINT", () => {
    void closeServer("SIGINT");
});
process.on("uncaughtException", (error) => {
    void handleFatalError(error, "uncaughtException");
});
process.on("unhandledRejection", (reason) => {
    void handleFatalError(reason, "unhandledRejection");
});
//# sourceMappingURL=server.js.map