// ══════════════════════════════════════════════════════════════
// Calendar System Routes — Events, attendees, meeting rooms
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── GET /calendar/events — List events ──
router.get("/events", async (req: Request, res: Response) => {
  try {
    const { start, end, organizerId, eventType } = req.query;
    const userId = (req as any).user?.userId;
    const where: any = {};

    if (start || end) {
      where.startTime = {};
      if (start) where.startTime.gte = new Date(start as string);
      if (end) where.startTime.lte = new Date(end as string);
    }
    if (organizerId) where.organizerId = organizerId;
    if (eventType) where.eventType = eventType;

    // Show public events + user's own events + events user is attendee of
    const attendingIds = await prisma.eventAttendee.findMany({
      where: { userId },
      select: { eventId: true },
    });

    const events = await prisma.calendarEvent.findMany({
      where: {
        OR: [
          { ...where, isPrivate: false },
          { ...where, organizerId: userId },
          { ...where, id: { in: attendingIds.map(a => a.eventId) } },
        ],
      },
      include: {
        attendees: true,
        reminders: true,
      },
      orderBy: { startTime: "asc" },
    });

    // Enrich with organizer names
    const orgIds = [...new Set(events.map(e => e.organizerId))];
    const users = await prisma.user.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const enriched = events.map(e => ({
      ...e,
      organizer: userMap.get(e.organizerId) || { firstName: "Unknown", lastName: "" },
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
});

// ── GET /calendar/events/my — My events ──
router.get("/events/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const from = req.query.from ? new Date(req.query.from as string) : new Date();
    const to = req.query.to ? new Date(req.query.to as string) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [organized, attending] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { organizerId: userId, startTime: { gte: from, lte: to } },
        include: { attendees: true },
        orderBy: { startTime: "asc" },
      }),
      prisma.eventAttendee.findMany({
        where: { userId, event: { startTime: { gte: from, lte: to } } },
        include: { event: { include: { attendees: true } } },
      }),
    ]);

    const attendingEvents = attending.map(a => ({ ...a.event, myStatus: a.status }));
    const allEvents = [...organized, ...attendingEvents].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    // Deduplicate
    const seen = new Set<string>();
    const unique = allEvents.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    res.json({ success: true, data: unique });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch your events" });
  }
});

// ── GET /calendar/events/:id ──
router.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: req.params.id },
      include: { attendees: true, reminders: true },
    });
    if (!event) { res.status(404).json({ success: false, error: "Event not found" }); return; }

    // Enrich attendees
    const userIds = event.attendees.map(a => a.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const enrichedAttendees = event.attendees.map(a => ({
      ...a,
      user: userMap.get(a.userId),
    }));

    res.json({ success: true, data: { ...event, attendees: enrichedAttendees } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch event" });
  }
});

// ── POST /calendar/events — Create event ──
router.post("/events", async (req: Request, res: Response) => {
  try {
    const organizerId = (req as any).user?.userId;
    const {
      title, description, startTime, endTime, allDay, eventType,
      recurrence, location, meetingUrl, isPrivate, color, attendeeIds, reminderMinutes,
    } = req.body;

    if (!title || !startTime || !endTime) {
      res.status(400).json({ success: false, error: "title, startTime, endTime required" });
      return;
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title, description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        allDay: allDay || false,
        eventType: eventType || "MEETING",
        recurrence: recurrence || "NONE",
        location, meetingUrl,
        organizerId,
        isPrivate: isPrivate || false,
        color,
        attendees: attendeeIds ? {
          create: attendeeIds.map((uid: string) => ({ userId: uid })),
        } : undefined,
        reminders: reminderMinutes ? {
          create: (Array.isArray(reminderMinutes) ? reminderMinutes : [reminderMinutes]).map((m: number) => ({
            minutesBefore: m,
          })),
        } : {
          create: [{ minutesBefore: 15 }],
        },
      },
      include: { attendees: true, reminders: true },
    });

    // Auto-notify attendees
    if (attendeeIds && attendeeIds.length > 0) {
      await prisma.notification.createMany({
        data: attendeeIds.map((uid: string) => ({
          userId: uid,
          type: "CALENDAR",
          module: "CALENDAR",
          title: `New event: ${title}`,
          message: `You've been invited to "${title}" on ${new Date(startTime).toLocaleDateString()}`,
        })),
      });
    }

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    console.error("[CALENDAR] Create error:", error);
    res.status(500).json({ success: false, error: "Failed to create event" });
  }
});

// ── PUT /calendar/events/:id — Update event ──
router.put("/events/:id", async (req: Request, res: Response) => {
  try {
    const {
      title, description, startTime, endTime, allDay,
      eventType, recurrence, location, meetingUrl, isPrivate, color,
    } = req.body;

    const event = await prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(allDay !== undefined && { allDay }),
        ...(eventType && { eventType }),
        ...(recurrence && { recurrence }),
        ...(location !== undefined && { location }),
        ...(meetingUrl !== undefined && { meetingUrl }),
        ...(isPrivate !== undefined && { isPrivate }),
        ...(color !== undefined && { color }),
      },
      include: { attendees: true },
    });

    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update event" });
  }
});

// ── DELETE /calendar/events/:id ──
router.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    await prisma.calendarEvent.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Event deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete event" });
  }
});

// ── RSVP ──
router.post("/events/:id/rsvp", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { status } = req.body; // ACCEPTED, DECLINED, TENTATIVE
    const attendee = await prisma.eventAttendee.upsert({
      where: { eventId_userId: { eventId: req.params.id, userId } },
      create: { eventId: req.params.id, userId, status, responseAt: new Date() },
      update: { status, responseAt: new Date() },
    });
    res.json({ success: true, data: attendee });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to RSVP" });
  }
});

// ── Meeting Rooms ─────────────────────────────────────────
router.get("/rooms", async (_req: Request, res: Response) => {
  try {
    const rooms = await prisma.meetingRoom.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: rooms });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch rooms" });
  }
});

router.post("/rooms", async (req: Request, res: Response) => {
  try {
    const { name, location, capacity, amenities } = req.body;
    const room = await prisma.meetingRoom.create({
      data: { name, location, capacity: Number(capacity), amenities: amenities || [] },
    });
    res.status(201).json({ success: true, data: room });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create room" });
  }
});

router.put("/rooms/:id", async (req: Request, res: Response) => {
  try {
    const { name, location, capacity, amenities, isActive } = req.body;
    const room = await prisma.meetingRoom.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(location && { location }),
        ...(capacity !== undefined && { capacity: Number(capacity) }),
        ...(amenities && { amenities }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: room });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update room" });
  }
});

// ── Room Availability ──
router.get("/rooms/:id/availability", async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const day = date ? new Date(date as string) : new Date();
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

    const room = await prisma.meetingRoom.findUnique({ where: { id: req.params.id } });
    if (!room) { res.status(404).json({ success: false, error: "Room not found" }); return; }

    const bookings = await prisma.calendarEvent.findMany({
      where: {
        location: room.name,
        startTime: { gte: dayStart },
        endTime: { lte: dayEnd },
      },
      select: { title: true, startTime: true, endTime: true, organizerId: true },
      orderBy: { startTime: "asc" },
    });

    // Generate available slots (9 AM - 6 PM, 30 min blocks)
    const slots: { time: string; available: boolean }[] = [];
    for (let h = 9; h < 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const slotStart = new Date(dayStart);
        slotStart.setHours(h, m, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + 30);

        const isBooked = bookings.some(b =>
          slotStart < new Date(b.endTime) && slotEnd > new Date(b.startTime)
        );

        slots.push({
          time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          available: !isBooked,
        });
      }
    }

    res.json({ success: true, data: { room, date: dayStart, bookings, slots } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to check availability" });
  }
});

// ── Free/Busy Look up ──
router.get("/free-busy", async (req: Request, res: Response) => {
  try {
    const { userId, date } = req.query;
    if (!userId) { res.status(400).json({ success: false, error: "userId required" }); return; }

    const day = date ? new Date(date as string) : new Date();
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

    const events = await prisma.calendarEvent.findMany({
      where: {
        OR: [
          { organizerId: userId as string, startTime: { gte: dayStart, lte: dayEnd } },
          { attendees: { some: { userId: userId as string } }, startTime: { gte: dayStart, lte: dayEnd } },
        ],
      },
      select: { startTime: true, endTime: true, title: true },
      orderBy: { startTime: "asc" },
    });

    const busySlots = events.map(e => ({
      start: e.startTime,
      end: e.endTime,
      title: e.title,
    }));

    res.json({ success: true, data: { userId, date: dayStart, busySlots, eventCount: events.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to check free/busy" });
  }
});

// ── Auto-generate recurring events ──
router.post("/events/:id/generate-recurring", async (req: Request, res: Response) => {
  try {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: req.params.id },
      include: { attendees: true },
    });
    if (!event || event.recurrence === "NONE") {
      res.status(400).json({ success: false, error: "Event has no recurrence" });
      return;
    }

    const { count = 4 } = req.body;
    const intervalMs: Record<string, number> = {
      DAILY: 24 * 60 * 60 * 1000,
      WEEKLY: 7 * 24 * 60 * 60 * 1000,
      BIWEEKLY: 14 * 24 * 60 * 60 * 1000,
      MONTHLY: 30 * 24 * 60 * 60 * 1000,
      QUARTERLY: 90 * 24 * 60 * 60 * 1000,
      YEARLY: 365 * 24 * 60 * 60 * 1000,
    };

    const interval = intervalMs[event.recurrence] || 7 * 24 * 60 * 60 * 1000;
    let created = 0;
    const duration = event.endTime.getTime() - event.startTime.getTime();

    for (let i = 1; i <= count; i++) {
      const newStart = new Date(event.startTime.getTime() + interval * i);
      const newEnd = new Date(newStart.getTime() + duration);

      await prisma.calendarEvent.create({
        data: {
          title: event.title,
          description: event.description,
          startTime: newStart,
          endTime: newEnd,
          allDay: event.allDay,
          eventType: event.eventType,
          recurrence: "NONE", // Don't recurse the recurrence
          location: event.location,
          meetingUrl: event.meetingUrl,
          organizerId: event.organizerId,
          isPrivate: event.isPrivate,
          color: event.color,
          attendees: {
            create: event.attendees.map(a => ({ userId: a.userId })),
          },
        },
      });
      created++;
    }

    res.json({ success: true, message: `Generated ${created} recurring instances` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to generate recurring events" });
  }
});

export { router as calendarRouter };
