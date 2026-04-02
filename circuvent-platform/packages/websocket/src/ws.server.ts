// ──────────────────────────────────────────────────────────────
// Circuvent Platform — WebSocket Server
// Manages authenticated WebSocket connections, pub/sub channels,
// and real-time event broadcasting for IoT and AI modules.
// ──────────────────────────────────────────────────────────────

import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { verifyAccessToken } from "@circuvent/auth";

const HEARTBEAT_INTERVAL_MS = 30_000;
const CLIENT_TIMEOUT_MS = 45_000;

export interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  role?: string;
  channels: Set<string>;
  isAlive: boolean;
  lastActivity: number;
  clientId: string;
}

interface WSMessage {
  type: "subscribe" | "unsubscribe" | "publish" | "ping" | "pong";
  channel?: string;
  data?: unknown;
  filters?: Record<string, string>;
}

type MessageHandler = (socket: AuthenticatedSocket, data: unknown) => void;

export class CircuventWSServer {
  private wss: WebSocketServer;
  private clients = new Map<string, AuthenticatedSocket>();
  private channelSubscribers = new Map<string, Set<string>>(); // channel -> Set<clientId>
  private messageHandlers = new Map<string, MessageHandler>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private nextClientId = 1;

  constructor(server: HTTPServer, path = "/ws") {
    this.wss = new WebSocketServer({ server, path });
    this.setupConnectionHandler();
    this.startHeartbeat();
    console.log(`[WS] WebSocket server started on path ${path}`);
  }

  private setupConnectionHandler(): void {
    this.wss.on("connection", (ws: WebSocket, req) => {
      const socket = ws as AuthenticatedSocket;
      socket.channels = new Set();
      socket.isAlive = true;
      socket.lastActivity = Date.now();
      socket.clientId = `ws_${this.nextClientId++}`;

      // Authenticate via query param or first message
      const url = new URL(req.url || "/", "ws://localhost");
      const token = url.searchParams.get("token");

      if (token) {
        try {
          const decoded = verifyAccessToken(token);
          socket.userId = decoded.userId;
          socket.role = decoded.role;
        } catch {
          socket.send(JSON.stringify({ type: "error", message: "Invalid token" }));
          socket.close(4001, "Unauthorized");
          return;
        }
      }

      this.clients.set(socket.clientId, socket);

      socket.send(JSON.stringify({
        type: "connected",
        clientId: socket.clientId,
        userId: socket.userId,
        timestamp: new Date().toISOString(),
      }));

      socket.on("message", (raw: RawData) => this.handleMessage(socket, raw));
      socket.on("pong", () => { socket.isAlive = true; });
      socket.on("close", () => this.handleDisconnect(socket));
      socket.on("error", (err) => {
        console.error(`[WS] Client error ${socket.clientId}:`, err.message);
      });
    });
  }

  private handleMessage(socket: AuthenticatedSocket, raw: RawData): void {
    socket.lastActivity = Date.now();
    socket.isAlive = true;

    let msg: WSMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "subscribe":
        if (msg.channel) this.subscribe(socket, msg.channel);
        break;
      case "unsubscribe":
        if (msg.channel) this.unsubscribe(socket, msg.channel);
        break;
      case "publish":
        if (msg.channel && msg.data) {
          const handler = this.messageHandlers.get(msg.channel);
          if (handler) handler(socket, msg.data);
        }
        break;
      case "ping":
        socket.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        break;
    }
  }

  private subscribe(socket: AuthenticatedSocket, channel: string): void {
    socket.channels.add(channel);

    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }
    this.channelSubscribers.get(channel)!.add(socket.clientId);

    socket.send(JSON.stringify({
      type: "subscribed",
      channel,
      timestamp: new Date().toISOString(),
    }));
  }

  private unsubscribe(socket: AuthenticatedSocket, channel: string): void {
    socket.channels.delete(channel);
    this.channelSubscribers.get(channel)?.delete(socket.clientId);

    socket.send(JSON.stringify({
      type: "unsubscribed",
      channel,
      timestamp: new Date().toISOString(),
    }));
  }

  private handleDisconnect(socket: AuthenticatedSocket): void {
    for (const channel of socket.channels) {
      this.channelSubscribers.get(channel)?.delete(socket.clientId);
    }
    this.clients.delete(socket.clientId);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [id, socket] of this.clients.entries()) {
        if (!socket.isAlive) {
          socket.terminate();
          this.handleDisconnect(socket);
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Broadcast a message to all subscribers of a channel.
   */
  broadcast(channel: string, event: string, data: unknown, excludeClientId?: string): void {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify({
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    for (const clientId of subscribers) {
      if (clientId === excludeClientId) continue;
      const socket = this.clients.get(clientId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }

  /**
   * Send a message to a specific user (all their connections).
   */
  sendToUser(userId: string, channel: string, event: string, data: unknown): void {
    const message = JSON.stringify({
      channel, event, data,
      timestamp: new Date().toISOString(),
    });

    for (const socket of this.clients.values()) {
      if (socket.userId === userId && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }

  /**
   * Register a handler for messages published to a specific channel.
   */
  onChannel(channel: string, handler: MessageHandler): void {
    this.messageHandlers.set(channel, handler);
  }

  /**
   * Get connected client stats.
   */
  getStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    channelCounts: Record<string, number>;
  } {
    let authenticated = 0;
    for (const socket of this.clients.values()) {
      if (socket.userId) authenticated++;
    }

    const channelCounts: Record<string, number> = {};
    for (const [ch, subs] of this.channelSubscribers.entries()) {
      channelCounts[ch] = subs.size;
    }

    return {
      totalConnections: this.clients.size,
      authenticatedConnections: authenticated,
      channelCounts,
    };
  }

  shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const socket of this.clients.values()) {
      socket.close(1001, "Server shutting down");
    }
    this.wss.close();
    console.log("[WS] WebSocket server shut down");
  }
}
