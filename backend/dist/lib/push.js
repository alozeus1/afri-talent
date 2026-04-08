import webpush from "web-push";
const vapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT;
const vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
let configured = false;
if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    configured = true;
}
export function isWebPushConfigured() {
    return configured;
}
export function getWebPushPublicKey() {
    return vapidPublicKey || null;
}
export async function sendWebPushNotification(subscription, payload) {
    if (!configured)
        return;
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency: "normal",
    });
}
//# sourceMappingURL=push.js.map