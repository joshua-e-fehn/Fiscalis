import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { db } from "@/db/drizzle/drizzle";
import { brokerConnections, brokerPositions } from "@/db/drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

import { auth } from "@clerk/nextjs/server";

// Validation schemas
const createConnectionSchema = z.object({
  brokerType: z.enum(["interactive_brokers"]),
  connectionName: z.string().min(1).max(100),
  accountId: z.string().optional(),
  username: z.string().optional(),
});

const app = new Hono()
  // Get all broker connections for user
  .get("/connections", async (c) => {
    const { userId } = await auth();

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const connections = await db
        .select()
        .from(brokerConnections)
        .where(eq(brokerConnections.userId, userId))
        .orderBy(desc(brokerConnections.createdAt));

      return c.json({ connections });
    } catch (error) {
      console.error("Error fetching broker connections:", error);
      return c.json({ error: "Failed to fetch broker connections" }, 500);
    }
  })

  // Create a new broker connection
  .post(
    "/connections",
    zValidator("json", createConnectionSchema),
    async (c) => {
      const { userId } = await auth();

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { brokerType, connectionName, accountId, username } =
        c.req.valid("json");

      try {
        // Check for duplicate connection
        if (accountId) {
          const existing = await db
            .select()
            .from(brokerConnections)
            .where(
              and(
                eq(brokerConnections.userId, userId),
                eq(brokerConnections.brokerType, brokerType),
                eq(brokerConnections.accountId, accountId),
              ),
            );

          if (existing.length > 0) {
            return c.json(
              {
                error: "Duplicate connection",
                message: `You already have a connection to this ${brokerType === "interactive_brokers" ? "Interactive Brokers" : brokerType} account.`,
              },
              409,
            );
          }
        }

        // Create the connection
        const [newConnection] = await db
          .insert(brokerConnections)
          .values({
            userId,
            brokerType,
            connectionName,
            accountId: accountId || null,
            username: username || null,
            status: "pending", // Will be "connected" after successful API verification
          })
          .returning();

        return c.json({ success: true, connection: newConnection });
      } catch (error) {
        console.error("Error creating broker connection:", error);
        return c.json({ error: "Failed to create broker connection" }, 500);
      }
    },
  )

  // Delete a broker connection
  .delete("/connections/:connectionId", async (c) => {
    const { userId } = await auth();
    const connectionId = parseInt(c.req.param("connectionId"));

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (isNaN(connectionId)) {
      return c.json({ error: "Invalid connection ID" }, 400);
    }

    try {
      // Verify ownership
      const [connection] = await db
        .select()
        .from(brokerConnections)
        .where(
          and(
            eq(brokerConnections.id, connectionId),
            eq(brokerConnections.userId, userId),
          ),
        );

      if (!connection) {
        return c.json({ error: "Connection not found" }, 404);
      }

      // Delete associated positions first
      await db
        .delete(brokerPositions)
        .where(eq(brokerPositions.connectionId, connectionId));

      // Delete the connection
      await db
        .delete(brokerConnections)
        .where(eq(brokerConnections.id, connectionId));

      return c.json({ success: true, message: "Broker connection removed" });
    } catch (error) {
      console.error("Error deleting broker connection:", error);
      return c.json({ error: "Failed to delete broker connection" }, 500);
    }
  })

  // Sync a broker connection (placeholder for actual API integration)
  .post("/connections/:connectionId/sync", async (c) => {
    const { userId } = await auth();
    const connectionId = parseInt(c.req.param("connectionId"));

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (isNaN(connectionId)) {
      return c.json({ error: "Invalid connection ID" }, 400);
    }

    try {
      // Verify ownership
      const [connection] = await db
        .select()
        .from(brokerConnections)
        .where(
          and(
            eq(brokerConnections.id, connectionId),
            eq(brokerConnections.userId, userId),
          ),
        );

      if (!connection) {
        return c.json({ error: "Connection not found" }, 404);
      }

      // TODO: Implement actual Interactive Brokers API sync
      // For now, just update the lastSyncAt timestamp and set status to connected
      await db
        .update(brokerConnections)
        .set({
          status: "connected",
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(brokerConnections.id, connectionId));

      // TODO: Fetch and store actual positions from IB API
      // For now, return mock data to simulate the flow

      return c.json({
        success: true,
        message: "Sync completed (demo mode - no actual data fetched)",
      });
    } catch (error) {
      console.error("Error syncing broker connection:", error);
      return c.json({ error: "Failed to sync broker connection" }, 500);
    }
  })

  // Get positions
  .get("/positions", async (c) => {
    const { userId } = await auth();
    const connectionIdParam = c.req.query("connectionId");

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      let query = db
        .select()
        .from(brokerPositions)
        .where(eq(brokerPositions.userId, userId));

      if (connectionIdParam) {
        const connectionId = parseInt(connectionIdParam);
        if (!isNaN(connectionId)) {
          query = db
            .select()
            .from(brokerPositions)
            .where(
              and(
                eq(brokerPositions.userId, userId),
                eq(brokerPositions.connectionId, connectionId),
              ),
            );
        }
      }

      const positions = await query;

      return c.json({ positions });
    } catch (error) {
      console.error("Error fetching broker positions:", error);
      return c.json({ error: "Failed to fetch broker positions" }, 500);
    }
  });

export default app;
