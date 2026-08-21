# Reviving a device from a factory image

## The gap this closes

`publish-firmware.cjs` uploads the **OTA image** — the application partition on
its own. That is the right thing to send a running device, and it is useless for
a dead one. An erased ESP32 has no bootloader and no partition table, so there
is nothing left to receive an update; the app image cannot even be addressed,
let alone run.

This was found the hard way. A reader went quiet, and everything published for
it was an OTA image that could not have revived it. The pipeline looked complete
right up to the moment somebody needed it to do the one thing it could not do.

A **factory image** is bootloader + partition table + boot_app0 + application,
merged into one file written at offset 0. It turns recovery into one command.

## Flashing one

```bash
pip install esptool          # once, if you do not already have it

esptool --chip esp32 --port /dev/tty.usbserial-XXXX --baud 921600 \
        write_flash 0x0 rfid-only-1.2.0-factory.bin
```

On macOS the port is usually `/dev/tty.usbserial-*` or `/dev/tty.SLAB_USBtoUART`;
on Windows it is a `COM` port. `ls /dev/tty.*` before and after plugging the
board in is the quickest way to identify it.

**Match the chip.** `--chip esp32`, `esp32s3` and `esp32c3` are not
interchangeable, and the factory index records which each image is for. Passing
the wrong one either fails outright or writes an image the ROM will not boot.

If the board does not enter download mode by itself, hold **BOOT/IO0**, tap
**EN/RST**, then release BOOT.

### Erasing first

Usually unnecessary — `write_flash 0x0` overwrites everything the image covers.
Erase only when you want the device to forget who it is:

```bash
esptool --chip esp32 --port <port> erase_flash
```

That wipes NVS as well, which means the Wi-Fi credentials, the device id and the
device key all go. See below, because that has consequences.

## What survives a reflash, and what does not

Credentials live in the NVS namespace `circuvent`, under `ssid`, `pass`, `id`,
`key`, `broker`, `api` and `token`.

| Action | NVS | Result |
|---|---|---|
| `write_flash 0x0 <factory>` | kept | Device reboots on the new firmware and reconnects as itself. Nothing to redo |
| `erase_flash` then flash | gone | Device comes up unclaimed, raises its setup hotspot and must be set up again |

**Prefer flashing without erasing.** Keeping NVS is what makes a reflash a
non-event: the device returns as the same id, with its terminal registration,
history and account link untouched.

## If NVS was erased

The device is a blank unit again. It will raise a `Circuvent-Setup-…` Wi-Fi
hotspot; connect any phone or laptop to it and the captive portal takes the
Wi-Fi credentials and claims it to an account.

It will come back with a **new device id**. The old row still exists and still
owns the history, so anything keyed on the old id has to be re-pointed — for an
attendance reader that is the terminal registration:

```
DELETE /attendance/terminals/<old-device-id>
POST   /attendance/terminals   { siteId, deviceId: "<new-id>", name: "Entrance" }
```

The register, the people and the cards are keyed on the **site**, not the
terminal, so none of that is affected.

### A note on reissuing keys

`POST /admin/devices/:id/reissue-key` exists and looks like the obvious move
when a device will not connect. Check `key_rotations` first.

If it is `0` the device is still holding a key the broker accepts, and rotating
it **guarantees** the device cannot reconnect without a reflash. On a unit that
is merely unplugged or out of range, that converts a recoverable situation into
an unrecoverable one.

## Building the images

```bash
node scripts/build-factory-images.cjs              # all of them
node scripts/build-factory-images.cjs rfid-only    # just one
node scripts/build-factory-images.cjs --no-build   # merge what is already built
```

Output lands in `.factory-images/`, which is gitignored — a set is ~35 MB and is
reproducible from a build, the same reasoning that keeps OTA images out of the
repo. `publish-firmware.cjs --commit` uploads them alongside the OTA images when
the directory exists, so a release with factory images is one extra command
rather than a separate process.

### Why the offsets are not written down from memory

The second-stage bootloader sits at `0x1000` on the original ESP32 and at `0x0`
on the S3 and C3. Getting that wrong produces a file that flashes without
complaint and then does not boot — the worst possible failure for a recovery
tool, because you discover it on the bench with the one device you were trying
to save.

So the offset is taken from the chip in PlatformIO's own board manifest rather
than guessed from the board name, and every merged image is checked twice before
it is accepted:

- the ESP image magic byte (`0xE9`) is where the ROM will look for it, and
- the first 256 bytes of the application match the file they came from, at
  `0x10000`.

The second check matters because the first only proves the bootloader landed. An
image with a good bootloader and a misplaced app boots far enough to look alive
and then fails, which is harder to diagnose than a board that does nothing.

## Where they are

```
https://pub-d7f0dba2b9e5487092a2a1de50a12a2c.r2.dev/fw/<type>-<version>-factory.bin
https://pub-d7f0dba2b9e5487092a2a1de50a12a2c.r2.dev/fw/factory-index.json
```

`factory-index.json` lists every image with its type, version and **chip**, which
is the parameter you need for `--chip` and the one that is not in the filename.
