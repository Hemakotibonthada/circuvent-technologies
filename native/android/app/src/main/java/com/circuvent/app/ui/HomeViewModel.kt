package com.circuvent.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.circuvent.app.core.ApiClient
import com.circuvent.app.core.Commands
import com.circuvent.app.core.Device
import com.circuvent.app.core.LiveFeed
import com.circuvent.app.core.Result
import com.circuvent.app.core.Session
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

data class HomeState(
    val signedIn: Boolean = false,
    val loading: Boolean = false,
    val devices: List<Device> = emptyList(),
    val error: String? = null,
    val liveConnected: Boolean = false,
    val insecureStorage: Boolean = false,
    /** Fields with a command in flight, as "deviceId::field". */
    val pending: Set<String> = emptySet(),
)

class HomeViewModel(app: Application) : AndroidViewModel(app) {

    private val session = Session(app)
    private val api = ApiClient(session)
    private val live = LiveFeed(session)

    private val _state = MutableStateFlow(
        HomeState(signedIn = session.signedIn, insecureStorage = !session.secure)
    )
    val state: StateFlow<HomeState> = _state.asStateFlow()

    private var liveJob: Job? = null
    private var pollJob: Job? = null

    init {
        if (session.signedIn) start()
    }

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
        _state.value = HomeState(signedIn = false, insecureStorage = !session.secure)
    }

    fun refresh() {
        viewModelScope.launch { load() }
    }

    /**
     * Flip one boolean field on a device.
     *
     * The optimistic update is applied locally and the field is marked pending
     * until the device's own report replaces it. That pin is the whole reason
     * `Commands` refuses to build a command for a field a type does not read:
     * a control that pins and never resolves is worse than one that does
     * nothing, because it also lies about being busy.
     */
    fun toggle(device: Device, field: String, value: Boolean) {
        val cmd: JsonObject = Commands.setBool(device.type, field, value) ?: run {
            _state.value = _state.value.copy(
                error = "This app does not know how to switch ${device.type}. Nothing was sent."
            )
            return
        }
        val key = "${device.id}::$field"
        _state.value = _state.value.copy(pending = _state.value.pending + key)

        viewModelScope.launch {
            val r = api.command(device.id, cmd)
            if (r is Result.Err) {
                _state.value = _state.value.copy(
                    pending = _state.value.pending - key,
                    error = r.message,
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

    private fun start() {
        load()
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
                            "status" -> d.copy(online = update.payload["online"]
                                ?.toString()?.toBoolean() ?: d.online)
                            else -> d
                        }
                    },
                    pending = _state.value.pending.filterNot { it.startsWith("${update.deviceId}::") }
                        .toSet(),
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
                load()
            }
        }
    }

    private fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.devices.isEmpty())
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
}
