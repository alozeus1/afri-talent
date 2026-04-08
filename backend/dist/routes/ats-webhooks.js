import { Router } from "express";
import logger from "../lib/logger.js";
import { processAtsWebhook } from "../lib/ats/service.js";
const router = Router();
router.post("/:provider/:connectionId", async (req, res) => {
    try {
        const rawBody = Buffer.isBuffer(req.body)
            ? req.body.toString("utf8")
            : typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body ?? {});
        const body = rawBody ? JSON.parse(rawBody) : {};
        const queryToken = typeof req.query.token === "string" ? req.query.token : null;
        const result = await processAtsWebhook({
            provider: req.params.provider,
            connectionId: req.params.connectionId,
            rawBody,
            body,
            headers: req.headers,
            queryToken,
            correlationId: req.requestId ?? null,
        });
        res.status(result.duplicate ? 200 : 202).json({
            received: true,
            ...result,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ATS webhook processing failed";
        logger.error({ error }, "ATS webhook failed");
        if (/verification failed/i.test(message)) {
            res.status(401).json({ error: message });
            return;
        }
        if (/invalid json/i.test(message) || /unexpected token/i.test(message)) {
            res.status(400).json({ error: "Invalid webhook payload" });
            return;
        }
        if (/not found/i.test(message) || /unsupported/i.test(message)) {
            res.status(404).json({ error: message });
            return;
        }
        res.status(500).json({ error: message });
    }
});
export default router;
//# sourceMappingURL=ats-webhooks.js.map