package com.circuvent.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.circuvent.app.core.Device
import com.circuvent.app.core.DeviceCapabilities

/** The accent pair from src/app/globals.css, so every client looks like one product. */
val Cyan = Color(0xFF06B6D4)
val Violet = Color(0xFF8B5CF6)
val Ink = Color(0xFF0B1220)
val Panel = Color(0xFF111A2B)
val Muted = Color(0xFF94A3B8)
val Danger = Color(0xFFF87171)
val OkGreen = Color(0xFF22C55E)
val Amber = Color(0xFFFBBF24)

@Composable
fun CircuventTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Cyan, secondary = Violet,
            background = Ink, surface = Panel,
            onBackground = Color.White, onSurface = Color.White,
        ),
        content = content,
    )
}

@Composable
fun App(vm: HomeViewModel) {
    val state by vm.state.collectAsState()
    CircuventTheme {
        Surface(Modifier.fillMaxSize(), color = Ink) {
            if (!state.signedIn) SignIn(state, vm) else Shell(state, vm)
        }
    }
}

// --------------------------------------------------------------------- shell

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Shell(state: AppState, vm: HomeViewModel) {
    Scaffold(
        containerColor = Ink,
        bottomBar = {
            NavigationBar(containerColor = Panel) {
                for (tab in Tab.entries) {
                    NavigationBarItem(
                        selected = state.tab == tab,
                        onClick = { vm.select(tab) },
                        icon = { Text(tabGlyph(tab), fontSize = 18.sp) },
                        label = { Text(tab.name, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Cyan,
                            selectedTextColor = Cyan,
                            unselectedIconColor = Muted,
                            unselectedTextColor = Muted,
                            indicatorColor = Panel,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            Banner(state, vm)
            when (state.tab) {
                Tab.Home -> HomeTab(state, vm)
                Tab.Devices -> DevicesTab(state, vm)
                Tab.Rooms -> RoomsTab(state, vm)
                Tab.Scenes -> ScenesTab(state, vm)
                Tab.More -> MoreTab(state, vm)
            }
        }
    }

    state.openDevice?.let { DeviceSheet(it, state, vm) }
}

private fun tabGlyph(tab: Tab) = when (tab) {
    Tab.Home -> "\u2302"
    Tab.Devices -> "\u25A6"
    Tab.Rooms -> "\u2637"
    Tab.Scenes -> "\u2726"
    Tab.More -> "\u2261"
}

/**
 * Errors and confirmations, in one place.
 *
 * Both are shown rather than only errors: a scene that ran and a command that
 * failed are equally worth saying out loud, and an app that only speaks when
 * something breaks trains people to distrust silence.
 */
@Composable
private fun Banner(state: AppState, vm: HomeViewModel) {
    val message = state.error ?: state.notice ?: return
    val isError = state.error != null
    Surface(
        color = if (isError) Danger.copy(alpha = 0.15f) else Cyan.copy(alpha = 0.13f),
        modifier = Modifier.fillMaxWidth().padding(12.dp, 8.dp, 12.dp, 0.dp),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                message,
                color = if (isError) Danger else Cyan,
                fontSize = 13.sp,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { vm.dismissNotice() }) { Text("Dismiss", fontSize = 12.sp) }
        }
    }
}

// ---------------------------------------------------------------------- auth

@Composable
private fun SignIn(state: AppState, vm: HomeViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("Circuvent", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text("Native client", fontSize = 15.sp, color = Cyan)
        Spacer(Modifier.height(28.dp))

        OutlinedTextField(
            value = email, onValueChange = { email = it },
            label = { Text("Email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password, onValueChange = { password = it },
            label = { Text("Password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Danger, fontSize = 14.sp)
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { vm.signIn(email, password) },
            enabled = !state.loading && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            if (state.loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            else Text("Sign in", fontSize = 16.sp)
        }

        if (state.insecureStorage) {
            Spacer(Modifier.height(16.dp))
            // Stated rather than hidden: the session is being kept somewhere
            // weaker than intended, and that is the owner's business.
            Text(
                "This phone's secure keystore was unavailable, so your session is stored " +
                    "without hardware protection.",
                color = Amber, fontSize = 12.sp,
            )
        }
    }
}

// ---------------------------------------------------------------------- home

@Composable
private fun HomeTab(state: AppState, vm: HomeViewModel) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column {
                Text("Home", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White)
                Text(
                    if (state.liveConnected) "Live" else "Not receiving live updates",
                    fontSize = 12.sp,
                    color = if (state.liveConnected) Cyan else Amber,
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Stat("${state.activeCount}", "on now", Modifier.weight(1f))
                Stat("${state.onlineCount}/${state.devices.size}", "online", Modifier.weight(1f))
                Stat("${state.scenes.size}", "scenes", Modifier.weight(1f))
            }
        }

        if (state.scenes.isNotEmpty()) {
            item { SectionLabel("Scenes") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.scenes, key = { it.id }) { scene ->
                        Surface(
                            color = Panel, shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.clickable { vm.runScene(scene) },
                        ) {
                            Text(
                                scene.name.ifBlank { "Scene ${scene.id}" },
                                color = Color.White, fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(16.dp, 14.dp),
                            )
                        }
                    }
                }
            }
        }

        val favourites = state.favourites
        if (favourites.isNotEmpty()) {
            item { SectionLabel("Favourites") }
            items(favourites, key = { "fav-${it.id}" }) { d -> DeviceRow(d, state, vm) }
        }

        item { SectionLabel(if (favourites.isEmpty()) "Devices" else "Everything else") }
        val rest = if (favourites.isEmpty()) state.devices else state.devices.filterNot { it.favorite }
        if (rest.isEmpty() && favourites.isEmpty()) {
            item { Empty(if (state.loading) "Loading…" else "No devices on this account yet.") }
        }
        items(rest, key = { it.id }) { d -> DeviceRow(d, state, vm) }
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(color = Panel, shape = RoundedCornerShape(14.dp), modifier = modifier) {
        Column(Modifier.padding(14.dp)) {
            Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Cyan)
            Text(label, fontSize = 11.sp, color = Muted)
        }
    }
}

// ------------------------------------------------------------------- devices

@Composable
private fun DevicesTab(state: AppState, vm: HomeViewModel) {
    val shown = state.roomFilter?.let { r -> state.devices.filter { it.room == r } } ?: state.devices

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp, 12.dp, 16.dp, 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Devices", fontSize = 26.sp, fontWeight = FontWeight.Bold,
                color = Color.White, modifier = Modifier.weight(1f))
            TextButton(onClick = { vm.refresh() }) { Text("Refresh") }
        }

        if (state.rooms.isNotEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    FilterChip(
                        selected = state.roomFilter == null,
                        onClick = { vm.filterRoom(null) },
                        label = { Text("All") },
                    )
                }
                items(state.rooms, key = { it.id }) { room ->
                    FilterChip(
                        selected = state.roomFilter == room.name,
                        onClick = { vm.filterRoom(if (state.roomFilter == room.name) null else room.name) },
                        label = { Text(room.name) },
                    )
                }
            }
        }

        if (shown.isEmpty()) {
            Empty(
                when {
                    state.loading -> "Loading…"
                    state.roomFilter != null -> "Nothing in ${state.roomFilter} yet."
                    else -> "No devices on this account yet."
                }
            )
            return@Column
        }

        LazyColumn(
            contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(shown, key = { it.id }) { d -> DeviceRow(d, state, vm) }
        }
    }
}

@Composable
private fun DeviceRow(device: Device, state: AppState, vm: HomeViewModel) {
    val caps = DeviceCapabilities.of(device.type)
    val power = caps.power
    val on = power?.let { device.bool(it.field) }
    val pending = power != null && state.pending.contains("${device.id}::${power.field}")

    Surface(
        color = Panel,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth().clickable { vm.openDevice(device.id) },
    ) {
        Row(Modifier.padding(16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(10.dp).background(
                    if (device.online) OkGreen else Color(0xFF475569),
                    RoundedCornerShape(5.dp),
                )
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(device.label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                Text(
                    buildString {
                        append(DeviceCapabilities.metricFor(device))
                        device.room?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
                        if (!device.online) append(" · offline")
                    },
                    fontSize = 12.sp, color = Muted,
                )
            }

            when {
                /*
                 * A device with no primary switch gets no switch drawn. The
                 * alternative — a control that sends `power` and hopes — is how
                 * four shipped types ended up with a toggle their firmware
                 * dropped in silence.
                 */
                power == null || on == null -> Text("\u203A", color = Muted, fontSize = 20.sp)
                pending -> CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                else -> Switch(
                    checked = on,
                    enabled = device.online,
                    onCheckedChange = { vm.toggle(device, power.field, it) },
                )
            }
        }
    }
}

// -------------------------------------------------------------- device sheet

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeviceSheet(device: Device, state: AppState, vm: HomeViewModel) {
    val caps = DeviceCapabilities.of(device.type)

    ModalBottomSheet(
        onDismissRequest = { vm.openDevice(null) },
        containerColor = Ink,
    ) {
        Column(
            Modifier.padding(20.dp, 0.dp, 20.dp, 32.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(device.label, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(
                        buildString {
                            append(device.type)
                            if (!device.online) append(" · offline")
                            device.fwVersion?.let { append(" · fw ").append(it) }
                        },
                        fontSize = 12.sp, color = Muted,
                    )
                }
                TextButton(onClick = { vm.star(device) }) {
                    Text(if (device.favorite) "\u2605 Starred" else "\u2606 Star")
                }
            }

            if (!device.online) {
                Text(
                    "This device is not answering. Controls are shown but will not reach it " +
                        "until it is back.",
                    color = Amber, fontSize = 13.sp,
                )
            }

            caps.power?.let { p ->
                val on = device.bool(p.field)
                val pending = state.pending.contains("${device.id}::${p.field}")
                ControlRow(p.label) {
                    if (pending) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Switch(
                        checked = on == true,
                        enabled = device.online,
                        onCheckedChange = { vm.toggle(device, p.field, it) },
                    )
                }
            }

            caps.dimmer?.let { d ->
                LevelControl(
                    label = d.label,
                    value = (device.number(d.field) ?: 0.0).toInt(),
                    enabled = device.online,
                    onChange = { vm.setLevel(device, d.field, it) },
                )
            }

            caps.fan?.let { f ->
                LevelControl(
                    label = f.label,
                    value = (device.number(f.field) ?: 0.0).toInt(),
                    enabled = device.online,
                    onChange = { vm.setLevel(device, f.field, it, f.legacyField) },
                )
            }

            caps.thermostat?.let { t ->
                val current = (device.number(t.field) ?: t.min.toDouble()).toInt()
                ControlRow("${t.label} · $current°") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { vm.setTarget(device, t.field, (current - 1).coerceAtLeast(t.min)) },
                            enabled = device.online,
                        ) { Text("\u2212") }
                        OutlinedButton(
                            onClick = { vm.setTarget(device, t.field, (current + 1).coerceAtMost(t.max)) },
                            enabled = device.online,
                        ) { Text("+") }
                    }
                }
            }

            // Touch boards get a whole-board control, which is a real command
            // the sketch reads rather than eight separate ones.
            if (device.type == "touchboard" || device.type == "touchboard-8") {
                val gangs = (1..8).filter { device.raw("g$it") != null }
                Text("Gangs", fontSize = 13.sp, color = Muted, fontWeight = FontWeight.Medium)
                for (g in gangs) {
                    val field = "g$g"
                    val pending = state.pending.contains("${device.id}::$field")
                    ControlRow("Gang $g") {
                        if (pending) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        else Switch(
                            checked = device.bool(field) == true,
                            enabled = device.online,
                            onCheckedChange = { vm.toggle(device, field, it) },
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = { vm.allGangs(device, true) },
                        enabled = device.online, modifier = Modifier.weight(1f),
                    ) { Text("All on") }
                    OutlinedButton(
                        onClick = { vm.allGangs(device, false) },
                        enabled = device.online, modifier = Modifier.weight(1f),
                    ) { Text("All off") }
                }
            }

            HorizontalDivider(color = Color.White.copy(alpha = 0.08f))

            Text("Setup", fontSize = 13.sp, color = Muted, fontWeight = FontWeight.Medium)
            OutlinedButton(
                onClick = { vm.openSetupMode(device) },
                enabled = device.online,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Open its setup hotspot") }
            Text(
                "The device raises its own hotspot for ten minutes and then rejoins your Wi-Fi. " +
                    "Nobody has to walk to it.",
                fontSize = 11.sp, color = Muted,
            )

            if (device.state.isNotEmpty()) {
                HorizontalDivider(color = Color.White.copy(alpha = 0.08f))
                Text("Reported state", fontSize = 13.sp, color = Muted, fontWeight = FontWeight.Medium)
                for ((key, value) in device.state.entries.sortedBy { it.key }) {
                    Row(Modifier.fillMaxWidth()) {
                        Text(key, fontSize = 12.sp, color = Muted, modifier = Modifier.weight(1f))
                        Text(
                            value.toString().trim('"'),
                            fontSize = 12.sp, color = Color.White,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ControlRow(label: String, control: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 15.sp, color = Color.White, modifier = Modifier.weight(1f))
        control()
    }
}

@Composable
private fun LevelControl(label: String, value: Int, enabled: Boolean, onChange: (Int) -> Unit) {
    /*
     * Held locally while dragging and only sent on release. A slider that
     * publishes every intermediate value floods the broker with commands the
     * device cannot keep up with, and the visible result is a control that
     * lags and then jumps.
     */
    var local by remember(value) { mutableFloatStateOf(value.toFloat()) }
    Column {
        Text("$label · ${local.toInt()}%", fontSize = 15.sp, color = Color.White)
        Slider(
            value = local,
            onValueChange = { local = it },
            onValueChangeFinished = { onChange(local.toInt()) },
            valueRange = 0f..100f,
            enabled = enabled,
        )
    }
}

// --------------------------------------------------------------------- rooms

@Composable
private fun RoomsTab(state: AppState, vm: HomeViewModel) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Rooms", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
        if (state.rooms.isEmpty()) {
            item { Empty(if (state.loading) "Loading…" else "No rooms yet.") }
        }
        items(state.rooms, key = { it.id }) { room ->
            val inRoom = state.devices.filter { it.room == room.name }
            val on = inRoom.count { d ->
                DeviceCapabilities.of(d.type).power?.let { d.bool(it.field) == true } ?: false
            }
            Surface(
                color = Panel, shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().clickable {
                    vm.filterRoom(room.name); vm.select(Tab.Devices)
                },
            ) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(room.name, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                        Text(
                            "${inRoom.size} device${if (inRoom.size == 1) "" else "s"} · $on on",
                            fontSize = 12.sp, color = Muted,
                        )
                    }
                    Text("\u203A", color = Muted, fontSize = 20.sp)
                }
            }
        }
    }
}

// -------------------------------------------------------------------- scenes

@Composable
private fun ScenesTab(state: AppState, vm: HomeViewModel) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text("Scenes", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White) }
        if (state.scenes.isEmpty()) {
            item { Empty(if (state.loading) "Loading…" else "No scenes yet.") }
        }
        items(state.scenes, key = { it.id }) { scene ->
            Surface(
                color = Panel, shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().clickable { vm.runScene(scene) },
            ) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        scene.name.ifBlank { "Scene ${scene.id}" },
                        fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                        color = Color.White, modifier = Modifier.weight(1f),
                    )
                    Text("Run", color = Cyan, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        if (state.automations.isNotEmpty()) {
            item { SectionLabel("Automations") }
            items(state.automations, key = { "a-${it.id}" }) { a ->
                Surface(color = Panel, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                a.name.ifBlank { "Automation ${a.id}" },
                                fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color.White,
                            )
                            Text(if (a.enabled) "Enabled" else "Paused", fontSize = 12.sp, color = Muted)
                        }
                        /*
                         * Read-only for now, and shown rather than hidden. An
                         * automation the owner cannot see is one they cannot
                         * explain when it fires; an editor that half-worked
                         * would be worse than this.
                         */
                        Text(if (a.enabled) "\u25CF" else "\u25CB",
                            color = if (a.enabled) OkGreen else Muted, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------- more

@Composable
private fun MoreTab(state: AppState, vm: HomeViewModel) {
    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("More", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)

        Surface(color = Panel, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Connection", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                InfoLine("Live feed", if (state.liveConnected) "connected" else "not connected",
                    if (state.liveConnected) OkGreen else Amber)
                InfoLine("Devices", "${state.onlineCount} of ${state.devices.size} online", Muted)
                InfoLine("Session storage", if (state.insecureStorage) "unprotected" else "hardware-backed",
                    if (state.insecureStorage) Amber else Muted)
            }
        }

        Surface(color = Panel, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("About", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                InfoLine("Client", "Native Android", Muted)
                InfoLine("Version", "0.1.0", Muted)
                Text(
                    "This is the native client. The Expo app remains the published one and is " +
                        "installed separately; both can run on this phone at once.",
                    fontSize = 11.sp, color = Muted,
                )
            }
        }

        OutlinedButton(onClick = { vm.refresh() }, modifier = Modifier.fillMaxWidth()) {
            Text("Refresh everything")
        }
        Button(
            onClick = { vm.signOut() },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Danger),
        ) { Text("Sign out") }
    }
}

@Composable
private fun InfoLine(label: String, value: String, color: Color) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontSize = 13.sp, color = Muted, modifier = Modifier.weight(1f))
        Text(value, fontSize = 13.sp, color = color)
    }
}

// ------------------------------------------------------------------- shared

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        fontSize = 11.sp, color = Muted, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 8.dp),
    )
}

@Composable
private fun Empty(message: String) {
    Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) {
        Text(message, color = Muted, fontSize = 15.sp)
    }
}
