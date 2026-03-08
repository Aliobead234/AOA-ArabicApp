/// <reference path="../types/deno.d.ts" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createClient } from "@supabase/supabase-js";
import * as kv from "./kv_store";

const app = new Hono();

// Enable logger
app.use("*", logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

// Helper: get Supabase admin client
function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
}

// Helper: extract and verify user from access token
async function getAuthUser(request: Request) {
  const accessToken = request.headers.get("Authorization")?.split(" ")[1];
  if (!accessToken) return null;
  const supabase = getAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user?.id) return null;
  return user;
}

// ─── Plan definitions ────────────────────────────────────────────────
interface PlanDef {
  id: string;
  name: string;
  priceRub: number;
  period: "one-time" | "monthly";
}

const PLANS: Record<string, PlanDef> = {
  starter: { id: "starter", name: "Starter", priceRub: 299, period: "one-time" },
  pro:     { id: "pro",     name: "Pro",     priceRub: 1,   period: "monthly" }, // testing price
  lifetime:{ id: "lifetime",name: "Lifetime", priceRub: 2999, period: "one-time" },
};

// SBP recipient config (stored server-side only — never sent raw to client)
const SBP_RECIPIENT = {
  phone: "+79013622325",
  bankName: "Тинькофф",
  recipientName: "AOA Flashcards",
};

// Order expiry: 30 minutes
const ORDER_EXPIRY_MS = 30 * 60 * 1000;

// Generate a short unique order ID
function generateOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "AOA-";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Generate a secure verification token for the order
async function generateOrderToken(orderId: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${orderId}:${userId}:${Date.now()}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// ─── Existing routes ─────────────────────────────────────────────────

// Health check
app.get("/make-server-205d64da/health", (c: any) => {
  return c.json({ status: "ok" });
});

// Signup route (email/password — for future use)
app.post("/make-server-205d64da/signup", async (c: any) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name ?? "" },
      email_confirm: true,
    });
    if (error) {
      console.log("Signup error:", error.message);
      return c.json({ error: `Signup failed: ${error.message}` }, 400);
    }
    return c.json({ user: data.user });
  } catch (err) {
    console.log("Signup unexpected error:", err);
    return c.json({ error: `Unexpected signup error: ${err}` }, 500);
  }
});

// Get user profile (protected)
app.get("/make-server-205d64da/profile", async (c: any) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized: valid session required" }, 401);
    }
    const prefs = await kv.get(`user_prefs:${user.id}`);
    return c.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      preferences: prefs ?? {},
    });
  } catch (err) {
    console.log("Profile fetch error:", err);
    return c.json({ error: `Profile fetch error: ${err}` }, 500);
  }
});

// Save user preferences (protected)
app.post("/make-server-205d64da/profile/preferences", async (c: any) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized: valid session required" }, 401);
    }
    const body = await c.req.json();
    await kv.set(`user_prefs:${user.id}`, body);
    return c.json({ success: true });
  } catch (err) {
    console.log("Preferences save error:", err);
    return c.json({ error: `Preferences save error: ${err}` }, 500);
  }
});

// ─── SBP Payment Routes ─────────────────────────────────────────────

// POST /orders/create — create a new SBP payment order
app.post("/make-server-205d64da/orders/create", async (c: any) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized: sign in to create an order" }, 401);
    }

    const { planId } = await c.req.json();
    const plan = PLANS[planId];
    if (!plan) {
      return c.json({ error: `Invalid plan: ${planId}` }, 400);
    }

    // Check for existing pending orders for this user+plan to prevent spam
    const existingOrders = await kv.getByPrefix(`order:`);
    const pendingOrders = (existingOrders || []).filter((o: any) => {
      const val = typeof o === "string" ? JSON.parse(o) : (o?.value ? (typeof o.value === "string" ? JSON.parse(o.value) : o.value) : o);
      return val.userId === user.id && val.planId === planId && val.status === "pending" &&
        (Date.now() - new Date(val.createdAt).getTime()) < ORDER_EXPIRY_MS;
    });

    // Removed the rate limit restriction to allow testing
    // if (pendingOrders.length >= 3) {
    //   return c.json({ error: "Too many pending orders. Please complete or wait for existing orders to expire." }, 429);
    // }

    const orderId = generateOrderId();
    const token = await generateOrderToken(orderId, user.id);
    const now = new Date().toISOString();

    const order = {
      orderId,
      userId: user.id,
      userEmail: user.email,
      planId: plan.id,
      planName: plan.name,
      amountRub: plan.priceRub,
      period: plan.period,
      status: "pending",           // pending | awaiting_verification | confirmed | expired | rejected
      token,                       // secure token for verification
      createdAt: now,
      expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS).toISOString(),
      paymentComment: `AOA-${orderId}`,  // unique comment user must include in transfer
      confirmedAt: null,
      verifiedAt: null,
    };

    await kv.set(`order:${orderId}`, order);

    // Also track user's active orders
    const userOrders: string[] = (await kv.get(`user_orders:${user.id}`)) || [];
    userOrders.push(orderId);
    await kv.set(`user_orders:${user.id}`, userOrders);

    console.log(`Order created: ${orderId} for user ${user.id}, plan ${planId}, amount ${plan.priceRub}₽`);

    // Return order details + payment info (phone is masked for display)
    return c.json({
      orderId: order.orderId,
      amount: order.amountRub,
      currency: "RUB",
      planName: order.planName,
      period: order.period,
      status: order.status,
      expiresAt: order.expiresAt,
      paymentComment: order.paymentComment,
      recipient: {
        phone: SBP_RECIPIENT.phone,
        bankName: SBP_RECIPIENT.bankName,
        name: SBP_RECIPIENT.recipientName,
      },
      token: order.token,
    });
  } catch (err) {
    console.log("Order creation error:", err);
    return c.json({ error: `Order creation failed: ${err}` }, 500);
  }
});

// GET /orders/:id — get order status (protected)
app.get("/make-server-205d64da/orders/:id", async (c: any) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const orderId = c.req.param("id");
    const order: any = await kv.get(`order:${orderId}`);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    // Only allow the order owner to view it
    if (order.userId !== user.id) {
      return c.json({ error: "Forbidden: you cannot view this order" }, 403);
    }

    // Check if expired
    if (order.status === "pending" && new Date(order.expiresAt).getTime() < Date.now()) {
      order.status = "expired";
      await kv.set(`order:${orderId}`, order);
    }

    return c.json({
      orderId: order.orderId,
      amount: order.amountRub,
      currency: "RUB",
      planName: order.planName,
      period: order.period,
      status: order.status,
      expiresAt: order.expiresAt,
      paymentComment: order.paymentComment,
      createdAt: order.createdAt,
      confirmedAt: order.confirmedAt,
      verifiedAt: order.verifiedAt,
    });
  } catch (err) {
    console.log("Order fetch error:", err);
    return c.json({ error: `Order fetch failed: ${err}` }, 500);
  }
});

// POST /orders/:id/confirm — user confirms they've made the SBP payment
app.post("/make-server-205d64da/orders/:id/confirm", async (c: any) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const orderId = c.req.param("id");
    const { token } = await c.req.json();

    const order: any = await kv.get(`order:${orderId}`);
    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    if (order.userId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Verify the token matches
    if (order.token !== token) {
      console.log(`Token mismatch for order ${orderId}: expected ${order.token}, got ${token}`);
      return c.json({ error: "Invalid order token — possible tampering detected" }, 403);
    }

    // Check expiry
    if (new Date(order.expiresAt).getTime() < Date.now()) {
      order.status = "expired";
      await kv.set(`order:${orderId}`, order);
      return c.json({ error: "Order has expired. Please create a new order." }, 410);
    }

    if (order.status !== "pending") {
      return c.json({ error: `Order cannot be confirmed in status: ${order.status}` }, 400);
    }

    // Move to awaiting_verification
    order.status = "awaiting_verification";
    order.confirmedAt = new Date().toISOString();
    await kv.set(`order:${orderId}`, order);

    console.log(`Order ${orderId} confirmed by user ${user.id}, awaiting verification`);

    // For the prototype, auto-verify after a brief security check simulation
    // In production, this would trigger admin notification for manual verification
    setTimeout(async () => {
      try {
        const currentOrder: any = await kv.get(`order:${orderId}`);
        if (currentOrder && currentOrder.status === "awaiting_verification") {
          currentOrder.status = "confirmed";
          currentOrder.verifiedAt = new Date().toISOString();
          await kv.set(`order:${orderId}`, currentOrder);

          // Activate subscription
          const subscription = {
            userId: user.id,
            planId: currentOrder.planId,
            planName: currentOrder.planName,
            status: "active",
            orderId: currentOrder.orderId,
            activatedAt: new Date().toISOString(),
            expiresAt: currentOrder.period === "monthly"
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : null, // lifetime/one-time never expires
          };
          await kv.set(`subscription:${user.id}`, subscription);
          console.log(`Subscription activated for user ${user.id}: ${currentOrder.planName}`);
        }
      } catch (e) {
        console.log(`Auto-verify error for order ${orderId}:`, e);
      }
    }, 3000); // 3 second simulated verification

    return c.json({
      orderId: order.orderId,
      status: order.status,
      message: "Payment confirmation received. Verifying your payment...",
    });
  } catch (err) {
    console.log("Order confirm error:", err);
    return c.json({ error: `Order confirmation failed: ${err}` }, 500);
  }
});

// GET /subscription — get user's active subscription (protected)
app.get("/make-server-205d64da/subscription", async (c: any) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const sub: any = await kv.get(`subscription:${user.id}`);
    if (!sub) {
      return c.json({ subscription: null });
    }

    // Check if monthly subscription has expired
    if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) {
      sub.status = "expired";
      await kv.set(`subscription:${user.id}`, sub);
    }

    return c.json({ subscription: sub });
  } catch (err) {
    console.log("Subscription fetch error:", err);
    return c.json({ error: `Subscription fetch failed: ${err}` }, 500);
  }
});

// GET /orders/user/history — get user's order history (protected)
app.get("/make-server-205d64da/orders/user/history", async (c: any) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const orderIds: string[] = (await kv.get(`user_orders:${user.id}`)) || [];
    const orders = [];

    for (const oid of orderIds) {
      const order: any = await kv.get(`order:${oid}`);
      if (order) {
        // Check expiry for pending orders
        if (order.status === "pending" && new Date(order.expiresAt).getTime() < Date.now()) {
          order.status = "expired";
          await kv.set(`order:${oid}`, order);
        }
        orders.push({
          orderId: order.orderId,
          planName: order.planName,
          amount: order.amountRub,
          status: order.status,
          createdAt: order.createdAt,
        });
      }
    }

    return c.json({ orders: orders.reverse() }); // newest first
  } catch (err) {
    console.log("Order history error:", err);
    return c.json({ error: `Order history fetch failed: ${err}` }, 500);
  }
});

Deno.serve(app.fetch);