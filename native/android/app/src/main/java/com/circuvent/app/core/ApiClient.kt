package com.circuvent.app.core

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Where the session lives.
 *
 * EncryptedSharedPreferences rather than plain ones: this holds a bearer token
 * that is as good as the password until it expires, on a device that may be
 * rooted or shared. The Expo app gets this for free from its secure store; on
 * this side it is a deliberate choice that has to be made and stated.
 */
class Session(context: Context) {

    /*
     * Declared before `prefs` because the fallback below assigns it while
     * `prefs` is still initialising. Kotlin initialises properties in
     * declaration order, so the other way round compiles as "cannot be
     * initialized before declaration" — which is the compiler catching a real
     * ordering bug rather than being fussy.
     */
    var secure: Boolean = true
        private set

    private val prefs: SharedPreferences = try {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "cv-session",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (e: Exception) {
        /*
         * Keystore failures are real on some OEM builds, and the alternative to
         * a fallback is an app that cannot sign in at all on those handsets.
         * It is a downgrade, so it is recorded rather than hidden: `secure`
         * tells the UI which one it got.
         */
        secure = false
        context.getSharedPreferences("cv-session-plain", Context.MODE_PRIVATE)
    }

    var token: String?
        get() = prefs.getString("token", null)
        set(v) = prefs.edit().apply { if (v == null) remove("token") else putString("token", v) }.apply()

    var refreshToken: String?
        get() = prefs.getString("refresh", null)
        set(v) = prefs.edit().apply { if (v == null) remove("refresh") else putString("refresh", v) }.apply()

    val signedIn: Boolean get() = !token.isNullOrBlank()

    fun clear() = prefs.edit().clear().apply()
}

/** What a call produced: the body, or why there is none. */
sealed class Result<out T> {
    data class Ok<T>(val value: T) : Result<T>()
    data class Err(val message: String, val status: Int = 0) : Result<Nothing>()
}

class ApiClient(private val session: Session) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true   // firmware adds fields; a phone must not break on them
        explicitNulls = false
    }

    /*
     * One refresh at a time.
     *
     * The device list and the home screen fire together, so an expired token
     * produces a burst of 401s. Refresh tokens are single-use, so letting each
     * retry rotate independently means all but one present a spent token — and
     * the server reads a spent token as replay and tears the whole family down,
     * signing the user out of a session that was merely stale. The Expo client
     * learned this the hard way; the lock is here for the same reason.
     */
    private val refreshLock = Mutex()

    suspend fun login(email: String, password: String): Result<AuthResponse> {
        val body = json.encodeToString(
            JsonObject.serializer(),
            buildJsonObject {
                put("email", email)
                put("password", password)
            }
        )
        return when (val r = post(Api.LOGIN, body, authed = false)) {
            is Result.Err -> r
            is Result.Ok -> {
                val auth = runCatching { json.decodeFromString<AuthResponse>(r.value) }.getOrNull()
                    ?: return Result.Err("The server sent something this app could not read.")
                if (auth.token.isBlank()) {
                    Result.Err(auth.error ?: "Those details were not accepted.")
                } else {
                    session.token = auth.token
                    auth.refreshToken?.let { session.refreshToken = it }
                    Result.Ok(auth)
                }
            }
        }
    }

    suspend fun devices(): Result<List<Device>> =
        when (val r = get(Api.DEVICES)) {
            is Result.Err -> r
            is Result.Ok -> runCatching { json.decodeFromString<DeviceList>(r.value).devices }
                .fold({ Result.Ok(it) }, { Result.Err("Could not read the device list.") })
        }

    suspend fun command(deviceId: String, cmd: JsonObject): Result<Unit> =
        when (val r = post(Api.command(deviceId), json.encodeToString(JsonObject.serializer(), cmd))) {
            is Result.Err -> r
            is Result.Ok -> Result.Ok(Unit)
        }

    // ---------------------------------------------------------------- plumbing

    private suspend fun get(path: String) = call(Request.Builder().url(Api.BASE + path).get(), true)

    private suspend fun post(path: String, body: String, authed: Boolean = true) = call(
        Request.Builder()
            .url(Api.BASE + path)
            .post(body.toRequestBody("application/json".toMediaType())),
        authed,
    )

    private suspend fun call(
        builder: Request.Builder,
        authed: Boolean,
        allowRetry: Boolean = true,
    ): Result<String> = withContext(Dispatchers.IO) {
        if (authed) session.token?.let { builder.header("Authorization", "Bearer $it") }
        val req = builder.header("Accept", "application/json").build()

        val res = try {
            http.newCall(req).execute()
        } catch (e: Exception) {
            return@withContext Result.Err("Could not reach Circuvent. Check the connection.")
        }

        res.use {
            val text = it.body?.string().orEmpty()

            if (it.code == 401 && authed && allowRetry && !session.refreshToken.isNullOrBlank()) {
                if (refresh()) {
                    // The builder carries a stale Authorization header, so the
                    // request is rebuilt rather than replayed.
                    return@withContext call(
                        builder.removeHeader("Authorization"), authed, allowRetry = false
                    )
                }
            }

            if (!it.isSuccessful) {
                return@withContext Result.Err(readError(text, it.code), it.code)
            }
            Result.Ok(text)
        }
    }

    private suspend fun refresh(): Boolean = refreshLock.withLock {
        val rt = session.refreshToken ?: return false
        val body = json.encodeToString(
            JsonObject.serializer(),
            buildJsonObject { put("refreshToken", rt) }
        )
        val res = withContext(Dispatchers.IO) {
            runCatching {
                http.newCall(
                    Request.Builder()
                        .url(Api.BASE + Api.REFRESH)
                        .post(body.toRequestBody("application/json".toMediaType()))
                        .build()
                ).execute()
            }.getOrNull()
        } ?: return false

        res.use {
            if (!it.isSuccessful) {
                // A refused refresh means the family is gone. Holding a dead
                // token would leave every later call retrying forever.
                session.clear()
                return false
            }
            val auth = runCatching {
                json.decodeFromString<AuthResponse>(it.body?.string().orEmpty())
            }.getOrNull() ?: return false
            if (auth.token.isBlank()) return false
            session.token = auth.token
            auth.refreshToken?.let { t -> session.refreshToken = t }
            return true
        }
    }

    /** The server's own words when it sends them, never a paraphrase. */
    private fun readError(text: String, code: Int): String {
        val fromBody = runCatching {
            (json.parseToJsonElement(text) as? JsonObject)
                ?.get("error")
                ?.toString()
                ?.trim('"')
        }.getOrNull()
        if (!fromBody.isNullOrBlank() && fromBody != "null") return fromBody
        return when (code) {
            403 -> "This account is not allowed to do that."
            404 -> "That is no longer there."
            in 500..599 -> "Circuvent is having trouble. Try again shortly."
            else -> "That did not work (HTTP $code)."
        }
    }
}
