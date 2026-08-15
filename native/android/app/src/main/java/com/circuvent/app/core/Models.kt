package com.circuvent.app.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * The device as the control plane reports it.
 *
 * `state` is deliberately left as raw JSON rather than being modelled per
 * device type. Twenty-four sketches publish their own fields and gain new ones
 * with every firmware release, so a sealed hierarchy here would mean a phone
 * that silently drops a field the hardware started sending — and the symptom of
 * that is a control the app does not know exists, which is this codebase's
 * signature defect.
 *
 * Readers pull what they understand and ignore the rest, exactly as the Expo
 * app and the console do.
 */
@Serializable
data class Device(
    val id: String,
    val type: String,
    val name: String = "",
    val room: String? = null,
    val favorite: Boolean = false,
    val online: Boolean = false,
    @SerialName("last_seen") val lastSeen: String? = null,
    val state: JsonObject = JsonObject(emptyMap()),
    @SerialName("fw_version") val fwVersion: String? = null,
) {
    fun bool(field: String): Boolean? =
        (state[field] as? JsonPrimitive)?.booleanOrNull

    fun number(field: String): Double? =
        (state[field] as? JsonPrimitive)?.doubleOrNull

    fun raw(field: String): JsonElement? = state[field]

    val label: String get() = name.ifBlank { id }
}

@Serializable
data class DeviceList(val devices: List<Device> = emptyList())

@Serializable
data class User(val id: Int, val email: String = "", val name: String = "")

@Serializable
data class AuthResponse(
    val token: String = "",
    val refreshToken: String? = null,
    val user: User? = null,
    val error: String? = null,
)

/**
 * A live update from the socket.
 *
 * `kind` separates the three things a device can say, and they are not
 * interchangeable: `state` is the whole retained picture, `telemetry` is a
 * reading that is only true at the moment it was sent, and `status` is the
 * broker speaking on behalf of a device that has stopped answering. Merging
 * them into one "update" is how a stale reading ends up displayed as current.
 */
@Serializable
data class DeviceUpdate(
    val type: String = "",
    val deviceId: String = "",
    val kind: String = "",
    val payload: JsonObject = JsonObject(emptyMap()),
    val at: String = "",
)

@Serializable
data class Room(
    val id: Int,
    val name: String = "",
    val icon: String? = null,
    val sort: Int = 0,
)

@Serializable
data class RoomList(val rooms: List<Room> = emptyList())

/**
 * A scene: a named set of commands, applied together.
 *
 * `actions` is kept as raw JSON for the same reason device state is — a scene
 * can carry any command any device type reads, and modelling them here would
 * mean a phone that silently drops the ones it has not been taught.
 */
@Serializable
data class Scene(
    val id: Int,
    val name: String = "",
    val icon: String? = null,
    val actions: JsonElement? = null,
)

@Serializable
data class SceneList(val scenes: List<Scene> = emptyList())

@Serializable
data class Automation(
    val id: Int,
    val name: String = "",
    val enabled: Boolean = true,
    val trigger: JsonElement? = null,
    val actions: JsonElement? = null,
)

@Serializable
data class AutomationList(val automations: List<Automation> = emptyList())
