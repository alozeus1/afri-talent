// Generate unique request ID and attach to request/response
export function requestIdMiddleware(req, res, next) {
    // Use existing request ID from header or generate new one
    const requestId = req.headers["x-request-id"] || generateRequestId();
    // Attach to request object
    req.requestId = requestId;
    // Add to response headers for client correlation
    res.setHeader("x-request-id", requestId);
    next();
}
function generateRequestId() {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}
//# sourceMappingURL=requestId.js.map