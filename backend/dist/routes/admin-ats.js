import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, authorize } from "../middleware/auth.js";
import { getAdminAtsDashboard } from "../lib/ats/service.js";
import logger from "../lib/logger.js";
const router = Router();
router.use(authenticate, authorize(Role.ADMIN));
function getBaseUrl(req) {
    return `${req.protocol}://${req.get("host")}`;
}
router.get("/dashboard", async (req, res) => {
    try {
        const dashboard = await getAdminAtsDashboard(getBaseUrl(req));
        res.json(dashboard);
    }
    catch (error) {
        logger.error({ error }, "Admin ATS dashboard failed");
        res.status(500).json({ error: "Failed to load ATS operations dashboard" });
    }
});
export default router;
//# sourceMappingURL=admin-ats.js.map