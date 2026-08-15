package com.circuvent.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.circuvent.app.core.ApiClient
import com.circuvent.app.core.Automation
import com.circuvent.app.core.Commands
import com.circuvent.app.core.Device
import com.circuvent.app.core.DeviceCapabilities
import com.circuvent.app.core.LiveFeed
import com.circuvent.app.core.Result
import com.circuvent.app.core.Room
import com.circuvent.app.core.Scene
import com.circuvent.app.core.Session
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

enum class Tab { Home, Devices, Rooms, Scenes, More }

data class AppState(
    val signedIn: Boolean = false,
    val loading: Boolean = false,
    val tab: Tab = Tab.Home,
    val devices: List<Device> = emptyList(),
    val rooms: List<Room> = emptyList(),
    val scenes: List<Scene> = emptyList(),
    val automations: List<Automation> = emptyList(),
    val error: String? = null,
    val notice: String? = null,
    val liveConnected: Boolean = false,
    val insecureStorage: Boolean = false,
    /** Fields with a command in flight, as "deviceId::field". */
    val pending: Set<String> = emptySet(),
    /** The device whose detail sheet is open. */
    val openDeviceId: String? = null,
    /** Room filter on the devices tab, by room name. */
    val roomFilter: String? = null,
) {
    val openDevice: Device? get() = devices.firstOrNull { it.id == openDeviceId }
    val favourites: List<Device> get() = devices.filter { it.favorite }
    val onlineCount: Int get() = devices.count { it.online }

    /** Devices that are on right now, by the field their own firmware reads. */
    val activeCount: Int
        get() = devices.count { d ->
            DeviceCapabilities.of(d.type).power?.let { d.bool(it.field) == true } ?: false
        }
}

class HomeViewModel(app: Application) : AndroidViewModel(app) {

    private val session = Session(app)
    private val api = ApiClient(session)
    private val live = LiveFeed(session)

    private val _state = MutableStateFlow(
        AppState(signedIn = session.signedIn, insecureStorage = !session.secure)
    )
    val state: StateFlow<AppState> = _state.asStateFlow()

    private var liveJob: Job? = null
    private var pollJob: Job? = null

    init {
        if (session.signedIn) start()
    }

    // ------------------------------------------------------------------ auth

    fun signIn(email: String, password: String) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            when (val r = api.login(email.trim(), password)) {
                is Result.Err -> _state.value = _state.value.copy(loading = false, error = r.message)
                is Result.Ok -> {
                    _state.value = _state.value.copy(loading = false, signedIn = true, error = null)
                    start()
                }
            }
        }
    }

    fun signOut() {
        liveJob?.cancel(); pollJob?.cancel()
        session.clear()
        _state.value = AppState(signedIn = false, insecureStorage = !session.secure)
    }

    // ------------------------------------------------------------ navigation

    fun select(tab: Tab) { _state.value = _state.value.copy(tab = tab, error = null) }
    fun openDevice(id: String?) { _state.value = _state.value.copy(openDeviceId = id) }
    fun filterRoom(room: String?) { _state.value = _state.value.copy(roomFilter = room) }
    fun dismissNotice() { _state.value = _state.value.copy(notice = null, error = null) }

    // --------------------------------------------------------------- actions

    fun refresh() { viewModelScope.launch { loadAll() } }

    /**
     * Flip one boolean field on a device.
     *
     * The field is marked pending until the device's own report replaces it.
     * That pin is the whole reason `Commands` refuses to build a command for a
     * field a type does not read: a control that pins and never resolves is
     * worse than one that does nothing, because it also lies about being busy.
     */
    fun toggle(device: Device, field: String, value: Boolean) {
        send(device, field, Commands.setBool(device.type, field, value))
    }

    /** A 0..100 control: brightness, curtain position, fan speed. */
    fun setLevel(device: Device, field: String, value: Int, legacyField: String? = null) {
        val clamped = value.coerceIn(0, 100)
        val cmd = buildJsonObject {
            put("action", "set")
            put(field, clamped)
            /*
             * The legacy field rides along on purpose. A fan that has not taken
             * the firmware update reads `speed` and ignores `level`; one that
             * has reads both. Sending only the new field would make the control
             * silently do nothing on older hardware, which is indistinguishable
             * from a broken fan.
             */
            legacyField?.let { put(it, (clamped / 34).coerceIn(0, 3)) }
        }
        send(device, field, cmd)
    }

    fun setTarget(device: Device, field: String, value: Int) {
        send(device, field, buildJsonObject { put("action", "set"); put(field, value) })
    }

    /** Every gang of a touch board at once. */
    fun allGangs(device: Device, value: Boolean) {
        send(device, "all", Commands.allGangs(value))
    }

    fun star(device: Device) {
        viewModelScope.launch {
            val next = !device.favorite
            // Applied locally first: starring is the app's own record, not the
            // device's, so there is no echo coming to confirm it.
            _state.value = _state.value.copy(
                devices = _state.value.devices.map {
                    if (it.id == device.id) it.copy(favorite = next) else it
                }
            )
            if (api.patchDevice(device.id, favorite = next) is Result.Err) {
                _state.value = _state.value.copy(
                    devices = _state.value.devices.map {
                        if (it.id == device.id) it.copy(favorite = !next) else it
                    },
                    error = "Could not save that.",
                )
            }
        }
    }

    fun runScene(scene: Scene) {
        viewModelScope.launch {
            when (api.runScene(scene.id)) {
                is Result.Err -> _state.value = _state.value.copy(error = "Could not run ${scene.name}.")
                is Result.Ok -> {
                    _state.value = _state.value.copy(notice = "${scene.name} applied.")
                    // A scene moves several devices at once and the echoes
                    // arrive separately, so the list is refreshed rather than
                    // guessed at.
                    delay(1200)
                    loadDevices()
                }
            }
        }
    }

    /** Ask a device to raise its setup hotspot, so nobody has to walk to it. */
    fun openSetupMode(device: Device) {
        viewModelScope.launch {
            when (api.command(device.id, Commands.setupMode(10))) {
                is Result.Err ->
                    _state.value = _state.value.copy(error = "Could not reach ${device.label}.")
                is Result.Ok -> _state.value = _state.value.copy(
                    notice = "${device.label} will open its setup hotspot for 10 minutes, " +
                        "then rejoin your Wi-Fi on its own."
                )
            }
        }
    }

    private fun send(device: Device, field: String, cmd: JsonObject?) {
        if (cmd == null) {
            _state.value = _state.value.copy(
                error = "This app does not know how to control ${device.type}. Nothing was sent."
            )
            return
        }
        val key = "${device.id}::$field"
        _state.value = _state.value.copy(pending = _state.value.pending + key)
        viewModelScope.launch {
            if (api.command(device.id, cmd) is Result.Err) {
                _state.value = _state.value.copy(
                    pending = _state.value.pending - key,
                    error = "That did not reach ${device.label}.",
                )
                return@launch
            }
            /*
             * Released on a timer as well as by the device's echo. Without the
             * timer a command the hardware never answers leaves the control
             * spinning for the rest of the session, which reads as the app
             * being broken rather than the device being unreachable.
             */
            delay(8000)
            _state.value = _state.value.copy(pending = _state.value.pending - key)
        }
    }

    // ---------------------------------------------------------------- loading

    private fun start() {
        loadAll()
        liveJob?.cancel()
        liveJob = viewModelScope.launch {
            live.updates().collect { update ->
                if (update.type == "socket:down") {
                    _state.value = _state.value.copy(liveConnected = false)
                    return@collect
                }
                _state.value = _state.value.copy(
                    liveConnected = true,
                    devices = _state.value.devices.map { d ->
                        if (d.id != update.deviceId) d
                        else when (update.kind) {
                            // Only `state` is the whole picture. Telemetry is a
                            // reading, and status is the broker speaking for a
                            // device that stopped answering — merging either
                            // into state would display a moment as the present.
                            "state" -> d.copy(state = JsonObject(d.state + update.payload))
                            "status" -> d.copy(
                                online = update.payload["online"]?.toString()?.toBoolean() ?: d.online
                            )
                            else -> d
                        }
                    },
                    pending = _state.value.pending
                        .filterNot { it.startsWith("${update.deviceId}::") }.toSet(),
                )
            }
        }

        /*
         * A slow poll behind the socket. The socket makes it feel instant; this
         * makes it true. A socket that has silently stopped delivering looks
         * exactly like a home where nothing is happening.
         */
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(30_000)
                loadDevices()
            }
        }
    }

    private fun loadAll() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.devices.isEmpty())
            loadDevices()
            // Rooms and scenes change rarely, so a failure on either is not
            // allowed to blank the device list the app is actually for.
            (api.rooms() as? Result.Ok)?.let { _state.value = _state.value.copy(rooms = it.value) }
            (api.scenes() as? Result.Ok)?.let { _state.value = _state.value.copy(scenes = it.value) }
            (api.automations() as? Result.Ok)?.let {
                _state.value = _state.value.copy(automations = it.value)
            }
            _state.value = _state.value.copy(loading = false)
        }
    }

    private suspend fun loadDevices() {
        when (val r = api.devices()) {
            is Result.Err -> _state.value = _state.value.copy(loading = false, error = r.message)
            is Result.Ok -> _state.value = _state.value.copy(
                loading = false,
                devices = r.value.sortedWith(
                    compareByDescending<Device> { it.favorite }
                        .thenByDescending { it.online }
                        .thenBy { it.label.lowercase() }
                ),
                error = null,
            )
        }
    }
}
