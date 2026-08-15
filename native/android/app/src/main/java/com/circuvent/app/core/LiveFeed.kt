package com.circuvent.app.core

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * The live device feed.
 *
 * The socket carries its token in the query string rather than a header. That
 * is not a shortcut — a WebSocket handshake from a browser cannot set custom
 * headers, so the control plane accepts it there, and the three clients all
 * connect the same way so there is one code path on the server to keep right.
 *
 * WHY POLLING IS NOT ENOUGH, AND WHY THE SOCKET IS NOT TRUSTED EITHER
 *
 * A command's confirmation arrives here, so without the socket every control
 * would sit pinned until a poll happened to catch up. But a socket that has
 * silently stopped delivering looks exactly like a home where nothing is
 * happening, which is the failure mode this codebase keeps finding. So the
 * caller is expected to keep a slow refresh going as well: the socket makes it
 * feel instant, the poll makes it true.
 */
class LiveFeed(private val session: Session) {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private val http = OkHttpClient.Builder()
        // Well under any sensible idle timeout on the far side. A dead socket
        // that is never noticed is worse than one that reconnects too often.
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    fun updates(): Flow<DeviceUpdate> = callbackFlow {
        val token = session.token
        if (token.isNullOrBlank()) {
            close()
            return@callbackFlow
        }

        val url = Api.WS + "?token=" + URLEncoder.encode(token, "UTF-8")
        var socket: WebSocket? = null

        val listener = object : WebSocketListener() {
            override fun onMessage(ws: WebSocket, text: String) {
                val update = runCatching { json.decodeFromString<DeviceUpdate>(text) }.getOrNull()
                    ?: return
                // Frames are a separate message type and are not device state.
                // Feeding them through here would have a camera's video
                // overwriting the fields a control renders from.
                if (update.type == "device:update") trySend(update)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                // Not closed: the flow stays open so a collector keeps its
                // subscription, and the caller decides when to retry. Ending
                // the flow here would quietly stop live updates for the rest of
                // the session after one dropped connection.
                trySend(DISCONNECTED)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                trySend(DISCONNECTED)
            }
        }

        socket = http.newWebSocket(Request.Builder().url(url).build(), listener)
        awaitClose { socket?.close(1000, null) }
    }

    companion object {
        /**
         * A sentinel the UI can watch for.
         *
         * Modelled as a message rather than an exception because "the feed
         * stopped" is information the person looking at the screen needs — a
         * panel showing confidently stale state is worse than one admitting it
         * has lost touch.
         */
        val DISCONNECTED = DeviceUpdate(type = "socket:down")
    }
}
