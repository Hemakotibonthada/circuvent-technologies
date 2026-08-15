/*
 * CvHomeLink — the local bus that lets one Circuvent board drive another.
 * ======================================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * A three-bedroom flat has switchboards in every room, and the useful wiring
 * is rarely "this pad switches the load behind this pad". The hall board wants
 * a master-off. The bedroom board wants the balcony light that is physically
 * wired to the living-room board. A bedside pad wants the fan on the far wall.
 *
 * Today all of that goes: pad -> ESP32 -> home router -> internet -> our broker
 * -> back down -> the other board. Two devices two metres apart, on the same
 * Wi-Fi, hold a conversation that leaves the country and comes back. Which
 * mostly works, and has two failure modes that matter more than "mostly":
 *
 *   - The broadband drops and the flat stops being a smart home. Not degraded:
 *     every cross-board switch is dead, including the master-off by the front
 *     door, while the loads themselves are perfectly healthy and the router is
 *     still up.
 *   - Even when it works it is slow enough to feel. A round trip through a
 *     datacentre is a couple of hundred milliseconds on a good day, and a
 *     light that lags a finger by a fifth of a second reads as a fault.
 *
 * So boards talk to each other directly, and the cloud stops being load-bearing
 * for things that never had to leave the building.
 *
 * WHY ESP-NOW
 * -----------
 * The boards already have 2.4 GHz radios and are already in range of each
 * other — they are in the same flat. ESP-NOW is connectionless: no association,
 * no DHCP, no broker, no router. A frame is out and acknowledged in single-digit
 * milliseconds, and it keeps working with the router unplugged, which is the
 * whole point.
 *
 * LoRa (see CvTankLink.h) is the right answer there and the wrong one here: it
 * exists to get through a concrete roof slab to a battery unit on a tank, at
 * one reading a minute. Its airtime and duty cycle make it useless for
 * "somebody just touched a light switch".
 *
 * THE CHANNEL PROBLEM, WHICH IS THE WHOLE DIFFICULTY
 * --------------------------------------------------
 * An ESP32 has one radio. ESP-NOW transmits on whatever channel the Wi-Fi
 * interface is currently parked on, so two boards can only hear each other if
 * they are on the same channel.
 *
 * While every board is joined to the same router this is free — they all
 * inherit the router's channel. The trouble starts at precisely the moment the
 * link becomes valuable:
 *
 *   The router loses power. Each board notices at a slightly different time and
 *   starts scanning, which sweeps it across every channel. Boards that were all
 *   on channel 6 are now on 1, 11, 6 and 3, hopping independently. The local
 *   bus disintegrates during the outage it was built for, and reassembles by
 *   luck when the router comes back.
 *
 * Nothing errors. Every board reports a healthy radio, and the switches simply
 * stop working for each other.
 *
 * The fix is that losing the router is a defined state rather than an accident:
 * once a board has been disconnected for CV_HOME_PARK_AFTER_MS it stops
 * scanning, parks on CV_HOME_PARK_CHANNEL, and stays there. Every board in the
 * flat makes the same decision and converges on the same channel, so the local
 * bus survives the outage. Reconnection is retried from there on a slow timer,
 * and the moment Wi-Fi is back the link follows the STA channel again.
 *
 * AUTHENTICATION
 * --------------
 * ESP-NOW frames are broadcast into the air of a building that contains other
 * people's flats. Unauthenticated, "switch everything off" would be a packet
 * anybody in the stairwell could send, and "switch everything on" is an
 * unattended immersion heater.
 *
 * Every packet therefore carries a truncated HMAC-SHA512 over its own contents,
 * keyed by a secret every board in one home shares and no other home has, plus
 * a per-sender rolling sequence number so a captured frame cannot be replayed
 * later. Same construction as CvTankLink, for the same reasons, and reviewed as
 * one decision rather than two.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * -----------------------------
 * It is not a second source of truth. The cloud remains authoritative for
 * configuration, history and anything involving a person who is not in the
 * building. This carries exactly one class of message — "an output changed, or
 * should change" — between boards that can see each other. When MQTT is up,
 * every local action is still published, so the console and the app never learn
 * a different story from the wall.
 */
#ifndef CV_HOME_LINK_H
#define CV_HOME_LINK_H

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

extern "C" {
#include "tweetnacl.h"
}

#define CV_HOME_LINK_VERSION 1

/*
 * The receive callback changed shape between ESP-IDF 4 and 5.
 *
 * IDF 4 hands the sender's MAC as a bare pointer; IDF 5 wraps it in an
 * esp_now_recv_info_t that also carries the destination address and the radio
 * metadata. Compiling against the wrong one is not a subtle failure — it is
 * "does not name a type" — but it fails in a shared header included by every
 * product, so it is worth handling once here rather than pinning the whole
 * fleet to one core version.
 */
#if defined(ESP_IDF_VERSION_MAJOR) && ESP_IDF_VERSION_MAJOR >= 5
#define CV_HOME_RECV_ARG const esp_now_recv_info_t *_cvInfo
#define CV_HOME_RECV_MAC _cvInfo->src_addr
#else
#define CV_HOME_RECV_ARG const uint8_t *_cvMac
#define CV_HOME_RECV_MAC _cvMac
#endif

/** Bytes of the shared home secret. */
#define CV_HOME_KEY_BYTES 32
/** Truncated MAC length. 64 bits against forgery, and it keeps frames small. */
#define CV_HOME_MAC_BYTES 8
#define CV_HOME_HASH_BYTES 64
#define CV_HOME_HMAC_BLOCK 128

/** Field names are short and fixed-width: "g1", "power2", "relay16". */
#define CV_HOME_FIELD_LEN 12
/** Device ids are truncated to their short form, which is what the app shows. */
#define CV_HOME_ID_LEN 12

/** Peers we will remember. A large flat is a dozen boards, not a hundred. */
#define CV_HOME_MAX_PEERS 24

/*
 * How long a board tolerates having no Wi-Fi before it stops chasing the
 * router and parks, so the whole flat converges on one channel.
 *
 * Long enough that a brief re-association does not tear the bus down, short
 * enough that a real outage does not leave the switches dead for minutes.
 */
#define CV_HOME_PARK_AFTER_MS 20000UL
/*
 * Channel 1 by convention. It only has to be a number every board agrees on
 * without being able to ask anybody, and 1 is the one that is legal in every
 * regulatory domain we ship to.
 */
#define CV_HOME_PARK_CHANNEL 1
/** How often a parked board retries the router. */
#define CV_HOME_REJOIN_EVERY_MS 30000UL

/** A peer that has not been heard from in this long is treated as gone. */
#define CV_HOME_PEER_STALE_MS 90000UL
/** Presence announcement cadence. */
#define CV_HOME_ANNOUNCE_MS 30000UL

/* ------------------------------------------------------------- messages --- */

enum : uint8_t {
  CV_HOME_MSG_ANNOUNCE = 1,  ///< "I exist, here is my id and type."
  CV_HOME_MSG_STATE    = 2,  ///< "One of my outputs changed."
  CV_HOME_MSG_COMMAND  = 3,  ///< "Set one of your outputs."
  CV_HOME_MSG_SCENE    = 4,  ///< "Everyone: apply this scene."
};

/*
 * The wire format. Packed and fixed size: both ends are our own firmware, and
 * the signed region is deliberately kept under 64 bytes — see cvHomeHmac.
 */
struct __attribute__((packed)) CvHomePacket {
  uint8_t  magic[3];                  ///< 'C','V','H'
  uint8_t  version;
  uint8_t  msgType;
  uint8_t  flags;
  uint16_t homeId;                    ///< Derived from the key; cheap pre-filter.
  char     src[CV_HOME_ID_LEN];       ///< Short device id of the sender.
  char     field[CV_HOME_FIELD_LEN];  ///< "g3", "power2", "" for scenes.
  int32_t  value;                     ///< Booleans are 0/1; levels are 0..100.
  uint32_t seq;
  uint8_t  mac[CV_HOME_MAC_BYTES];
};

/** Bytes covered by the MAC: everything before the MAC itself. */
#define CV_HOME_SIGNED_BYTES (sizeof(CvHomePacket) - CV_HOME_MAC_BYTES)

/*
 * A command names its target; everything else is addressed to the whole home.
 *
 * The target rides in `field` for commands as "id:field", which keeps the
 * struct one shape. It is checked below rather than parsed by every caller.
 */
#define CV_HOME_FLAG_TARGETED 0x01

/* ------------------------------------------------------------ integrity --- */

/*
 * HMAC-SHA512, truncated.
 *
 * Built from crypto_hash rather than crypto_auth because the bundled tweetnacl
 * is a trimmed build that has the former and not the latter, and adding
 * primitives to a library compiled into every product we sell is a change with
 * the whole fleet as its blast radius. RFC 2104 construction, so there is
 * nothing novel here to get wrong.
 *
 * NOTE FOR ANYONE COPYING THIS: cvTankHmac in CvTankLink.h truncates the
 * message to 64 bytes. That is correct there — its packet is smaller than that
 * — but it would silently sign only part of a longer one. This version takes
 * the whole message, and CV_HOME_SIGNED_BYTES is static_asserted below to stay
 * inside the single inner block this construction uses.
 */
inline void cvHomeHmac(uint8_t out[CV_HOME_HASH_BYTES], const uint8_t *msg, size_t msgLen,
                       const uint8_t key[CV_HOME_KEY_BYTES]) {
  uint8_t k[CV_HOME_HMAC_BLOCK];
  memset(k, 0, sizeof(k));
  memcpy(k, key, CV_HOME_KEY_BYTES);

  uint8_t inner[CV_HOME_HMAC_BLOCK + CV_HOME_HMAC_BLOCK];
  uint8_t outer[CV_HOME_HMAC_BLOCK + CV_HOME_HASH_BYTES];

  for (size_t i = 0; i < CV_HOME_HMAC_BLOCK; i++) inner[i] = k[i] ^ 0x36;
  size_t n = msgLen > CV_HOME_HMAC_BLOCK ? CV_HOME_HMAC_BLOCK : msgLen;
  memcpy(inner + CV_HOME_HMAC_BLOCK, msg, n);

  uint8_t innerHash[CV_HOME_HASH_BYTES];
  crypto_hash(innerHash, inner, CV_HOME_HMAC_BLOCK + n);

  for (size_t i = 0; i < CV_HOME_HMAC_BLOCK; i++) outer[i] = k[i] ^ 0x5c;
  memcpy(outer + CV_HOME_HMAC_BLOCK, innerHash, CV_HOME_HASH_BYTES);

  crypto_hash(out, outer, CV_HOME_HMAC_BLOCK + CV_HOME_HASH_BYTES);
}

static_assert(CV_HOME_SIGNED_BYTES <= CV_HOME_HMAC_BLOCK,
              "the signed region must fit the single inner block cvHomeHmac hashes");

inline void cvHomeSign(CvHomePacket &p, const uint8_t key[CV_HOME_KEY_BYTES]) {
  uint8_t full[CV_HOME_HASH_BYTES];
  cvHomeHmac(full, (const uint8_t *)&p, CV_HOME_SIGNED_BYTES, key);
  memcpy(p.mac, full, CV_HOME_MAC_BYTES);
}

/**
 * Constant-time MAC comparison.
 *
 * memcmp returns at the first difference, so how long it takes reveals how many
 * leading bytes were right — which is enough to forge a MAC a byte at a time.
 */
inline bool cvHomeVerify(const CvHomePacket &p, const uint8_t key[CV_HOME_KEY_BYTES]) {
  uint8_t full[CV_HOME_HASH_BYTES];
  cvHomeHmac(full, (const uint8_t *)&p, CV_HOME_SIGNED_BYTES, key);
  uint8_t diff = 0;
  for (size_t i = 0; i < CV_HOME_MAC_BYTES; i++) diff |= (uint8_t)(full[i] ^ p.mac[i]);
  return diff == 0;
}

/** A cheap, non-secret home discriminator so foreign frames die before HMAC. */
inline uint16_t cvHomeIdFromKey(const uint8_t key[CV_HOME_KEY_BYTES]) {
  uint8_t h[CV_HOME_HASH_BYTES];
  crypto_hash(h, key, CV_HOME_KEY_BYTES);
  return (uint16_t)((h[0] << 8) | h[1]);
}

/**
 * Parse a 64-character hex home key.
 *
 * Strict about the length on purpose. A short or malformed key that was
 * accepted and zero-padded would produce a board that joins a home nobody
 * else is in: it would report a healthy local bus, hear nothing, and every
 * cross-board switch on it would quietly do nothing.
 */
inline bool cvHomeKeyFromHex(const char *hex, uint8_t out[CV_HOME_KEY_BYTES]) {
  if (!hex) return false;
  size_t n = strlen(hex);
  if (n != CV_HOME_KEY_BYTES * 2) return false;
  for (size_t i = 0; i < CV_HOME_KEY_BYTES; i++) {
    uint8_t b = 0;
    for (int half = 0; half < 2; half++) {
      char ch = hex[i * 2 + half];
      uint8_t v;
      if (ch >= '0' && ch <= '9') v = (uint8_t)(ch - '0');
      else if (ch >= 'a' && ch <= 'f') v = (uint8_t)(ch - 'a' + 10);
      else if (ch >= 'A' && ch <= 'F') v = (uint8_t)(ch - 'A' + 10);
      else return false;
      b = (uint8_t)((b << 4) | v);
    }
    out[i] = b;
  }
  return true;
}

/* ----------------------------------------------------------------- peers --- */

struct CvHomePeer {
  char     id[CV_HOME_ID_LEN];
  uint8_t  mac[6];
  uint32_t lastSeenMs;
  uint32_t lastSeq;
  bool     used;
};

/**
 * What the link knows about the rest of the home.
 *
 * `lastSeq` is per-peer on purpose. A single shared counter would have every
 * board rejecting every other board's traffic as replays the moment two of
 * them talked in the same second.
 */
struct CvHomeLinkState {
  CvHomePeer peers[CV_HOME_MAX_PEERS];
  uint32_t   sent = 0;
  uint32_t   delivered = 0;
  uint32_t   accepted = 0;
  uint32_t   rejected = 0;   ///< Failed HMAC, wrong home, or replayed.
  uint8_t    channel = 0;
  bool       parked = false;
};

/** Peers heard from recently enough to still be considered present. */
inline int cvHomeLivePeers(const CvHomeLinkState &s, uint32_t nowMs) {
  int n = 0;
  for (int i = 0; i < CV_HOME_MAX_PEERS; i++) {
    if (!s.peers[i].used) continue;
    if (nowMs - s.peers[i].lastSeenMs < CV_HOME_PEER_STALE_MS) n++;
  }
  return n;
}

/**
 * Decide whether to park the radio because the router is gone.
 *
 * Split out from the class so it can be reasoned about — and tested — without
 * a radio present. The rule is deliberately one-way per state: a board parks
 * only after being down continuously for the timeout, so a re-association does
 * not tear the bus down, and it unparks the moment it is genuinely back.
 */
inline bool cvHomeShouldPark(bool wifiConnected, uint32_t downSinceMs, uint32_t nowMs) {
  if (wifiConnected) return false;
  if (downSinceMs == 0) return false;
  return (nowMs - downSinceMs) >= CV_HOME_PARK_AFTER_MS;
}

/** Split "id:field" out of a targeted command. Returns false if not targeted. */
inline bool cvHomeSplitTarget(const char *packed, char *idOut, size_t idCap,
                              char *fieldOut, size_t fieldCap) {
  const char *colon = strchr(packed, ':');
  if (!colon) return false;
  size_t idLen = (size_t)(colon - packed);
  if (idLen == 0 || idLen >= idCap) return false;
  memcpy(idOut, packed, idLen);
  idOut[idLen] = 0;
  strncpy(fieldOut, colon + 1, fieldCap - 1);
  fieldOut[fieldCap - 1] = 0;
  return fieldOut[0] != 0;
}

/* ------------------------------------------------------------------ link --- */

/** field, value, and who it came from. */
typedef std::function<void(const char *field, int32_t value, const char *fromId)> CvHomeCommandHandler;
/** A peer reported one of its own outputs changing. */
typedef std::function<void(const char *fromId, const char *field, int32_t value)> CvHomeStateHandler;
/** Everyone was asked to apply a scene. */
typedef std::function<void(const char *scene)> CvHomeSceneHandler;

class CvHomeLink {
 public:
  /**
   * @param selfId  this device's id; truncated to its short form on the wire.
   * @param key     the home secret, shared by every board in one home.
   */
  void begin(const char *selfId, const uint8_t key[CV_HOME_KEY_BYTES]) {
    strncpy(_selfId, selfId, sizeof(_selfId) - 1);
    _selfId[sizeof(_selfId) - 1] = 0;
    memcpy(_key, key, CV_HOME_KEY_BYTES);
    _homeId = cvHomeIdFromKey(_key);
    memset(&_state, 0, sizeof(_state));

    /*
     * ESP-NOW needs the interface up but not necessarily associated. This is
     * what lets the bus work with the router unplugged: the radio is on, the
     * board simply is not joined to anything.
     */
    if (WiFi.getMode() == WIFI_OFF) WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK) {
      Serial.println("[CVHOME] esp_now_init failed — local bus unavailable");
      _up = false;
      return;
    }
    _instance = this;
    esp_now_register_recv_cb(&CvHomeLink::_onRecvStatic);
    esp_now_register_send_cb(&CvHomeLink::_onSentStatic);
    _addBroadcastPeer();
    _up = true;
    _state.channel = _currentChannel();
    Serial.printf("[CVHOME] local bus up on channel %u, home %04x\n",
                  (unsigned)_state.channel, (unsigned)_homeId);
  }

  bool up() const { return _up; }
  const CvHomeLinkState &state() const { return _state; }
  int livePeers() const { return cvHomeLivePeers(_state, millis()); }

  void onCommand(CvHomeCommandHandler h) { _cmd = h; }
  void onPeerState(CvHomeStateHandler h) { _peerState = h; }
  void onScene(CvHomeSceneHandler h) { _scene = h; }

  /**
   * Tell the home that one of our outputs moved.
   *
   * Broadcast rather than addressed because a switchboard does not know who
   * cares. Bindings live on the listening side, so adding "the hall pad also
   * dims the corridor" never means reflashing the hall board.
   */
  void publishState(const char *field, int32_t value) {
    CvHomePacket p;
    _fill(p, CV_HOME_MSG_STATE, field, value, 0);
    _send(p, nullptr);
  }

  /** Ask one specific board to set one of its outputs. */
  void sendCommand(const char *peerId, const char *field, int32_t value) {
    char packed[CV_HOME_FIELD_LEN];
    snprintf(packed, sizeof(packed), "%s:%s", peerId, field);
    CvHomePacket p;
    _fill(p, CV_HOME_MSG_COMMAND, packed, value, CV_HOME_FLAG_TARGETED);
    const CvHomePeer *peer = _findPeer(peerId);
    _send(p, peer ? peer->mac : nullptr);
  }

  /**
   * Ask the whole home to apply a scene.
   *
   * This is the one that has to work with the internet down: "all off" by the
   * front door at night is the single most-used cross-board action in a flat,
   * and routing it through a datacentre made it the first thing to break.
   */
  void sendScene(const char *scene) {
    CvHomePacket p;
    _fill(p, CV_HOME_MSG_SCENE, scene, 0, 0);
    _send(p, nullptr);
  }

  /**
   * Housekeeping: announce presence, and park the radio if the router is gone.
   *
   * @param wifiConnected the caller's view of the STA link, so this stays
   *                      testable and does not second-guess the device library.
   */
  void loop(bool wifiConnected) {
    if (!_up) return;
    const uint32_t now = millis();

    if (!wifiConnected && _downSince == 0) _downSince = now ? now : 1;
    if (wifiConnected) _downSince = 0;

    const bool wantPark = cvHomeShouldPark(wifiConnected, _downSince, now);
    if (wantPark && !_state.parked) _park();
    else if (!wantPark && _state.parked && wifiConnected) _unpark();

    if (now - _lastAnnounce >= CV_HOME_ANNOUNCE_MS) {
      _lastAnnounce = now;
      CvHomePacket p;
      _fill(p, CV_HOME_MSG_ANNOUNCE, "", 0, 0);
      _send(p, nullptr);
    }
  }

 private:
  static CvHomeLink *_instance;

  char     _selfId[CV_HOME_ID_LEN] = {0};
  uint8_t  _key[CV_HOME_KEY_BYTES] = {0};
  uint16_t _homeId = 0;
  uint32_t _seq = 0;
  uint32_t _lastAnnounce = 0;
  uint32_t _downSince = 0;
  bool     _up = false;
  CvHomeLinkState _state;

  CvHomeCommandHandler _cmd;
  CvHomeStateHandler   _peerState;
  CvHomeSceneHandler   _scene;

  static uint8_t _currentChannel() {
    uint8_t ch = 0;
    wifi_second_chan_t sec;
    esp_wifi_get_channel(&ch, &sec);
    return ch;
  }

  void _park() {
    /*
     * Stop scanning and settle. WiFi.disconnect() is what actually ends the
     * channel hopping — without it the driver keeps sweeping looking for the
     * AP, and the channel we just set is abandoned within a second.
     */
    WiFi.disconnect(false, false);
    esp_wifi_set_channel(CV_HOME_PARK_CHANNEL, WIFI_SECOND_CHAN_NONE);
    _state.parked = true;
    _state.channel = CV_HOME_PARK_CHANNEL;
    Serial.printf("[CVHOME] router gone — parked on channel %u so the flat stays linked\n",
                  (unsigned)CV_HOME_PARK_CHANNEL);
  }

  void _unpark() {
    _state.parked = false;
    _state.channel = _currentChannel();
    Serial.printf("[CVHOME] back on the router, channel %u\n", (unsigned)_state.channel);
  }

  void _addBroadcastPeer() {
    esp_now_peer_info_t info;
    memset(&info, 0, sizeof(info));
    memset(info.peer_addr, 0xFF, 6);
    // Channel 0 means "whatever the interface is on", which is what lets the
    // peer follow us across a park without being re-added.
    info.channel = 0;
    info.ifidx = WIFI_IF_STA;
    info.encrypt = false;
    if (!esp_now_is_peer_exist(info.peer_addr)) esp_now_add_peer(&info);
  }

  void _fill(CvHomePacket &p, uint8_t type, const char *field, int32_t value, uint8_t flags) {
    memset(&p, 0, sizeof(p));
    p.magic[0] = 'C'; p.magic[1] = 'V'; p.magic[2] = 'H';
    p.version = CV_HOME_LINK_VERSION;
    p.msgType = type;
    p.flags = flags;
    p.homeId = _homeId;
    strncpy(p.src, _selfId, CV_HOME_ID_LEN - 1);
    strncpy(p.field, field, CV_HOME_FIELD_LEN - 1);
    p.value = value;
    p.seq = ++_seq;
    cvHomeSign(p, _key);
  }

  void _send(CvHomePacket &p, const uint8_t *mac) {
    static const uint8_t bcast[6] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };
    _state.sent++;
    esp_now_send(mac ? mac : bcast, (const uint8_t *)&p, sizeof(p));
  }

  CvHomePeer *_findPeer(const char *id) {
    for (int i = 0; i < CV_HOME_MAX_PEERS; i++) {
      if (_state.peers[i].used && strncmp(_state.peers[i].id, id, CV_HOME_ID_LEN) == 0) {
        return &_state.peers[i];
      }
    }
    return nullptr;
  }

  void _rememberPeer(const char *id, const uint8_t *mac, uint32_t seq) {
    CvHomePeer *slot = _findPeer(id);
    if (!slot) {
      for (int i = 0; i < CV_HOME_MAX_PEERS; i++) {
        if (!_state.peers[i].used) { slot = &_state.peers[i]; break; }
      }
      /*
       * Full table: evict the one nobody has heard from in longest. A flat
       * that has replaced boards over the years must not become unable to
       * learn a new one because the table is full of units in a skip.
       */
      if (!slot) {
        uint32_t oldest = 0xFFFFFFFF;
        for (int i = 0; i < CV_HOME_MAX_PEERS; i++) {
          if (_state.peers[i].lastSeenMs <= oldest) { oldest = _state.peers[i].lastSeenMs; slot = &_state.peers[i]; }
        }
      }
      memset(slot, 0, sizeof(*slot));
      strncpy(slot->id, id, CV_HOME_ID_LEN - 1);
      slot->used = true;
      esp_now_peer_info_t info;
      memset(&info, 0, sizeof(info));
      memcpy(info.peer_addr, mac, 6);
      info.channel = 0;
      info.ifidx = WIFI_IF_STA;
      info.encrypt = false;
      if (!esp_now_is_peer_exist(info.peer_addr)) esp_now_add_peer(&info);
    }
    memcpy(slot->mac, mac, 6);
    slot->lastSeenMs = millis();
    slot->lastSeq = seq;
  }

  void _onRecv(const uint8_t *mac, const uint8_t *data, int len) {
    if (len != (int)sizeof(CvHomePacket)) return;
    CvHomePacket p;
    memcpy(&p, data, sizeof(p));

    if (p.magic[0] != 'C' || p.magic[1] != 'V' || p.magic[2] != 'H') return;
    if (p.version != CV_HOME_LINK_VERSION) return;
    // Cheap filter first so a neighbour's home costs us no SHA-512.
    if (p.homeId != _homeId) { _state.rejected++; return; }
    // Our own broadcast comes back to us; it is not news.
    if (strncmp(p.src, _selfId, CV_HOME_ID_LEN) == 0) return;
    if (!cvHomeVerify(p, _key)) { _state.rejected++; return; }

    /*
     * Replay check, per sender. Equal sequence numbers are refused as well as
     * lower ones: a repeated frame must not be able to re-assert an old state,
     * or a recording of "switch on" becomes a switch that cannot be turned off
     * while the attacker keeps replaying it.
     */
    CvHomePeer *known = _findPeer(p.src);
    if (known && p.seq <= known->lastSeq) { _state.rejected++; return; }

    char id[CV_HOME_ID_LEN];
    strncpy(id, p.src, sizeof(id) - 1);
    id[sizeof(id) - 1] = 0;
    _rememberPeer(id, mac, p.seq);
    _state.accepted++;

    switch (p.msgType) {
      case CV_HOME_MSG_ANNOUNCE:
        break;  // presence only; _rememberPeer already did the work
      case CV_HOME_MSG_STATE:
        if (_peerState) _peerState(id, p.field, p.value);
        break;
      case CV_HOME_MSG_COMMAND: {
        if (!(p.flags & CV_HOME_FLAG_TARGETED)) break;
        char target[CV_HOME_ID_LEN], field[CV_HOME_FIELD_LEN];
        if (!cvHomeSplitTarget(p.field, target, sizeof(target), field, sizeof(field))) break;
        if (strncmp(target, _selfId, CV_HOME_ID_LEN) != 0) break;  // addressed elsewhere
        if (_cmd) _cmd(field, p.value, id);
        break;
      }
      case CV_HOME_MSG_SCENE:
        if (_scene) _scene(p.field);
        break;
      default:
        break;
    }
  }

  /*
   * The transmit result is recorded rather than ignored.
   *
   * ESP-NOW tells us whether a unicast frame was acknowledged at the MAC layer,
   * and that is the only evidence a board has that its command landed. Without
   * counting it, a link that has silently stopped delivering looks exactly like
   * a link nobody happens to be using.
   */
  void _onSent(const uint8_t *, esp_now_send_status_t status) {
    if (status == ESP_NOW_SEND_SUCCESS) _state.delivered++;
  }

  static void _onRecvStatic(CV_HOME_RECV_ARG, const uint8_t *data, int len) {
    if (_instance) _instance->_onRecv(CV_HOME_RECV_MAC, data, len);
  }
  static void _onSentStatic(const uint8_t *mac, esp_now_send_status_t status) {
    if (_instance) _instance->_onSent(mac, status);
  }
};

inline CvHomeLink *CvHomeLink::_instance = nullptr;

#endif  // CV_HOME_LINK_H
