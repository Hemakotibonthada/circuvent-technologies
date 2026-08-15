package com.circuvent.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import com.circuvent.app.core.Commands
import com.circuvent.app.core.Device

/** The accent pair from src/app/globals.css, so three clients look like one product. */
private val Cyan = Color(0xFF06B6D4)
private val Violet = Color(0xFF8B5CF6)
private val Ink = Color(0xFF0B1220)
private val Panel = Color(0xFF111A2B)
private val Muted = Color(0xFF94A3B8)

@Composable
fun CircuventTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Cyan,
            secondary = Violet,
            background = Ink,
            surface = Panel,
            onBackground = Color.White,
            onSurface = Color.White,
        ),
        content = content,
    )
}

@Composable
fun App(vm: HomeViewModel) {
    val state by vm.state.collectAsState()
    CircuventTheme {
        Surface(Modifier.fillMaxSize(), color = Ink) {
            if (!state.signedIn) SignIn(state, vm) else Devices(state, vm)
        }
    }
}

@Composable
private fun SignIn(state: HomeState, vm: HomeViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Circuvent", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text("Native client", fontSize = 15.sp, color = Cyan)
        Spacer(Modifier.height(28.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Color(0xFFF87171), fontSize = 14.sp)
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
                color = Color(0xFFFBBF24), fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun Devices(state: HomeState, vm: HomeViewModel) {
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(20.dp, 28.dp, 20.dp, 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Your devices", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
                Text(
                    if (state.liveConnected) "Live" else "Not receiving live updates",
                    fontSize = 12.sp,
                    color = if (state.liveConnected) Cyan else Color(0xFFFBBF24),
                )
            }
            TextButton(onClick = { vm.refresh() }) { Text("Refresh") }
            TextButton(onClick = { vm.signOut() }) { Text("Sign out") }
        }

        state.error?.let {
            Text(
                it,
                color = Color(0xFFF87171),
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
            )
        }

        if (state.loading && state.devices.isEmpty()) {
            Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }

        if (state.devices.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(32.dp), Alignment.Center) {
                Text(
                    "No devices on this account yet.",
                    color = Muted, fontSize = 15.sp,
                )
            }
            return@Column
        }

        LazyColumn(
            contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.devices, key = { it.id }) { d -> DeviceCard(d, state, vm) }
        }
    }
}

@Composable
private fun DeviceCard(device: Device, state: HomeState, vm: HomeViewModel) {
    val field = Commands.primaryToggle(device.type)
    val on = field?.let { device.bool(it) }
    val pending = field != null && state.pending.contains("${device.id}::$field")

    Surface(
        color = Panel,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(10.dp).background(
                    if (device.online) Color(0xFF22C55E) else Color(0xFF475569),
                    RoundedCornerShape(5.dp),
                )
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(device.label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                Text(
                    buildString {
                        append(device.type)
                        device.room?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
                        if (!device.online) append(" · offline")
                    },
                    fontSize = 12.sp, color = Muted,
                )
            }

            when {
                /*
                 * A device with no primary switch gets no switch drawn. The
                 * alternative — a control that sends `power` and hopes — is
                 * how four shipped types ended up with a toggle their firmware
                 * dropped in silence.
                 */
                field == null || on == null -> Text("—", color = Muted, fontSize = 14.sp)
                pending -> CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                else -> Switch(
                    checked = on,
                    enabled = device.online,
                    onCheckedChange = { vm.toggle(device, field, it) },
                )
            }
        }
    }
}
