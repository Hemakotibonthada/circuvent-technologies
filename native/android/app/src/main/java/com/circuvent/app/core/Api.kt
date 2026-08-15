package com.circuvent.app.core

/**
 * The control plane's address and the shapes it speaks.
 *
 * These constants are the whole reason this file is separate from the client
 * that uses them. The Expo app, the web console and this app are three
 * independent implementations of one protocol, and the way that protocol breaks
 * is never a compile error — it is a request that returns 404, or a command the
 * device drops in silence because the key was spelled differently here.
 *
 * `tests/native-client-parity.test.ts` reads this file and mobile/src/config.ts
 * and fails the build if they disagree, which is the only kind of check that
 * survives somebody changing one of them in a hurry.
 */
object Api {
    const val BASE = "https://api.circuvent.com"
    const val WS = "wss://api.circuvent.com/ws"

    /** Endpoints, spelled once. */
    const val LOGIN = "/auth/login"
    const val REFRESH = "/auth/refresh"
    const val DEVICES = "/devices"
    const val ROOMS = "/rooms"
    const val SCENES = "/scenes"
    const val AUTOMATIONS = "/automations"

    fun command(deviceId: String): String = "/devices/$deviceId/command"
    fun runScene(id: Int): String = "/scenes/$id/run"
    fun patchDevice(deviceId: String): String = "/devices/$deviceId"
}
