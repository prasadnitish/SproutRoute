import { z } from "zod";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin, supabaseForUser } from "../utils/supabaseClient.js";
import {
  importFields,
  placeFields,
  prepareImport,
} from "../services/socialSave.js";

const columns =
  "placeId,name,destination,category,source,evidence,family,tip,locked";
async function result(query) {
  const { data, error } = await query;
  if (error) throw new Error("Library unavailable");
  return data;
}
function privateRoute(handler) {
  return async (req, res) => {
    try {
      res.json(await handler(req));
    } catch (error) {
      const invalid = error instanceof z.ZodError;
      res.status(invalid ? 422 : 503).json({
        code: invalid ? "INVALID_SOCIAL_SAVE" : "LIBRARY_UNAVAILABLE",
        category: invalid ? "validation" : "server",
        retryable: !invalid,
        requestId: req.reqId ?? randomUUID(),
        message: invalid
          ? "Check the link and field lengths."
          : "Social Save is unavailable. Try again.",
      });
    }
  };
}

export function mountSocialSave(
  app,
  {
    limiter,
    aiLimiter,
    meter,
    authenticate = requireAuth,
    database = supabaseForUser,
    extract = prepareImport,
    deleteUser = (id) => getSupabaseAdmin().auth.admin.deleteUser(id),
  },
) {
  const root = "/api/v1/social-save";
  const table = (req, name) => database(req.headers.authorization).from(name);
  const places = (req) => table(req, "social_places");
  const inbox = (req) => table(req, "social_inbox");
  async function list(req, destination, after) {
    let query = places(req)
      .select(columns)
      .eq("user_id", req.user.id)
      .order("placeId")
      .limit(100);
    if (after) query = query.gt("placeId", z.string().max(200).parse(after));
    if (destination) query = query.eq("destination", destination);
    return result(query);
  }
  app.get(root + "/config", limiter, (_req, res) => {
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_ANON_KEY;
    let publicKey = key?.startsWith("sb_publishable_");
    if (!publicKey && key) {
      try {
        publicKey =
          JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role ===
          "anon";
      } catch {
        /* fail closed */
      }
    }
    if (!url || !publicKey)
      return res
        .status(503)
        .json({ message: "Account sign-in is unavailable." });
    res.json({ url, key });
  });
  app.use(
    root,
    limiter,
    (_req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      next();
    },
    authenticate,
    (req, res, next) => {
      if (req.user.isAnonymous)
        return res.status(403).json({ message: "Sign in with an account." });
      next();
    },
  );
  app.post(
    root + "/extract",
    aiLimiter,
    meter("parse"),
    privateRoute((req) => extract(req.body)),
  );
  app.delete(root + "/account", async (req, res) => {
    // Require recent authentication in this token, not just a recent login on another device.
    let methods;
    try {
      const jwt = req.headers.authorization.split(" ")[1];
      methods = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      ).amr;
    } catch {
      /* Opaque or malformed credentials cannot authorize account removal. */
    }
    const now = Date.now() / 1000;
    if (
      !Array.isArray(methods) ||
      !methods.some(
        (m) =>
          m.method === "otp" && m.timestamp <= now && now - m.timestamp <= 300,
      )
    ) {
      return res.status(403).json({
        message: "Verify a new email code before deleting your account.",
      });
    }
    try {
      const { error } = await deleteUser(req.user.id);
      if (error) throw error;
      return res.json({ ok: true });
    } catch {
      return res
        .status(503)
        .json({ message: "Account deletion could not be completed." });
    }
  });
  app.get(
    root + "/places",
    privateRoute((req) => list(req, undefined, req.query.after)),
  );
  app.put(
    root + "/places",
    privateRoute(async (req) => {
      const row = placeFields.parse(req.body);
      await result(
        places(req).upsert(
          { ...row, user_id: req.user.id },
          { onConflict: "user_id,placeId" },
        ),
      );
      return { ok: true };
    }),
  );
  app.get(
    root + "/inbox",
    privateRoute((req) => {
      let query = inbox(req)
        .select("id,source,text,extraction")
        .eq("user_id", req.user.id)
        .order("id")
        .limit(100);
      if (req.query.after)
        query = query.gt("id", z.uuid().parse(req.query.after));
      return result(query);
    }),
  );
  for (const [path, getTable, key] of [
    ["places", places, "placeId"],
    ["inbox", inbox, "id"],
  ]) {
    app.delete(
      root + "/" + path + "/:id",
      privateRoute(async (req) => {
        await result(
          getTable(req)
            .delete()
            .eq("user_id", req.user.id)
            .eq(key, req.params.id),
        );
        return { ok: true };
      }),
    );
  }
  const chargeExtraction = meter("parse");
  app.post(
    root + "/mcp",
    (req, res, next) => {
      if (Array.isArray(req.body))
        return res
          .status(400)
          .json({ message: "Send one MCP request at a time." });
      const params = req.body?.params;
      if (
        req.body?.method === "tools/call" &&
        params?.name === "save_place_from_url" &&
        params.arguments?.extractNow === true
      ) {
        return aiLimiter(req, res, () => chargeExtraction(req, res, next));
      }
      next();
    },
    async (req, res) => {
      const server = new McpServer({
        name: "sproutroute-library",
        version: "1.0",
      });
      const content = (value) => ({
        content: [{ type: "text", text: JSON.stringify(value) }],
      });
      server.registerTool(
        "list_saved_places",
        {
          description:
            "List your confirmed places, optionally by exact destination.",
          inputSchema: {
            destination: z.string().max(180).optional(),
            after: z.string().max(200).optional(),
          },
        },
        async ({ destination, after }) => {
          const places = await list(req, destination, after);
          return content({
            places,
            next: places.length === 100 ? places.at(-1).placeId : null,
          });
        },
      );
      server.registerTool(
        "save_place_from_url",
        {
          description:
            "Queue a shared link and optional caption for place extraction and review in the app. With user permission, set extractNow to send the caption or available title to AI for immediate candidate extraction. Supply the same requestId when retrying.",
          inputSchema: {
            ...importFields,
            requestId: z.uuid().optional(),
            extractNow: z.boolean().default(false),
          },
        },
        async ({ source, text, requestId, extractNow }) => {
          const id = requestId ?? randomUUID();
          await result(
            inbox(req).upsert(
              { user_id: req.user.id, id, source, text },
              { onConflict: "user_id,id", ignoreDuplicates: true },
            ),
          );
          if (!extractNow) return content({ id, status: "queued_for_review" });
          const pending = await result(
            inbox(req)
              .select("source,text,extraction")
              .eq("user_id", req.user.id)
              .eq("id", id)
              .single(),
          );
          if (pending.source !== source || pending.text !== text)
            throw new Error("Use a new request ID for different input.");
          const extraction =
            pending.extraction ?? (await extract({ source, text }));
          if (!pending.extraction) {
            await result(
              inbox(req)
                .update({ extraction })
                .eq("user_id", req.user.id)
                .eq("id", id),
            );
          }
          return content({ id, ...extraction });
        },
      );
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.once("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch {
        if (!res.headersSent)
          res.status(503).json({ message: "Private library unavailable." });
      }
    },
  );
}
