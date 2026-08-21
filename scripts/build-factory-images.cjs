#!/usr/bin/env node
/**
 * Build full-flash "factory" images for every firmware.
 *
 * WHY THIS EXISTS
 *
 * `publish-firmware.cjs` uploads the OTA image: the application partition
 * alone. That is the right thing to send a running device, and it is useless
 * for a dead one. A blank or erased ESP32 has no bootloader and no partition
 * table, so there is nothing to receive an update — the app image cannot even
 * be addressed, let alone run.
 *
 * We found this the hard way, with a reader that could not be revived from
 * anything published. The OTA pipeline looked complete right up to the moment
 * somebody needed it to do the one thing it could not do.
 *
 * A factory image is bootloader + partition table + boot_app0 + application
 * merged into a single file that is written at offset 0, so recovery is:
 *
 *     esptool --chip esp32 write_flash 0x0 <type>-<ver>-factory.bin
 *
 * WHY THE OFFSETS ARE NOT HARDCODED FROM MEMORY
 *
 * The bootloader sits at 0x1000 on the original ESP32 and at 0x0 on the S3 and
 * C3. Getting that wrong produces a file that flashes without complaint and
 * then does not boot, which is the worst possible failure for a recovery tool:
 * you only discover it on the bench, with the one device you were trying to
 * save. So the offset comes from the chip reported by PlatformIO's own board
 * manifest, and every merged image is checked for the ESP image magic byte at
 * the offset the bootloader is supposed to occupy.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const firmwareDir = path.join(root, "firmware");
const outDir = path.join(root, ".factory-images");

/**
 * Where the second-stage bootloader lives, by chip.
 *
 * The ESP32 leaves 4 KB at the start of flash; the later parts do not. This is
 * a property of the silicon, not a convention, which is why it is keyed on the
 * chip rather than on the board name — several boards share a chip.
 */
const BOOTLOADER_OFFSET = {
  esp32: 0x1000,
  esp32s2: 0x1000,
  esp32s3: 0x0,
  esp32c2: 0x0,
  esp32c3: 0x0,
  esp32c6: 0x0,
  esp32h2: 0x0,
};

const PARTITIONS_OFFSET = 0x8000;
const BOOT_APP0_OFFSET = 0xe000;
const APP_OFFSET = 0x10000;

/** The ESP image format starts with this byte. Used to prove an offset is right. */
const ESP_IMAGE_MAGIC = 0xe9;

function ini(dir) {
  const p = path.join(dir, "platformio.ini");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function field(text, name) {
  const m = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\S+)`, "m"));
  return m ? m[1] : null;
}

/** Every firmware project with a platformio.ini, and the version it declares. */
function projects() {
  return fs
    .readdirSync(firmwareDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => {
      const dir = path.join(firmwareDir, e.name);
      const cfg = ini(dir);
      if (!cfg) return null;
      const sketch = fs.readdirSync(dir).find((f) => f.endsWith(".ino"));
      if (!sketch) return null;
      const src = fs.readFileSync(path.join(dir, sketch), "utf8");
      const ver = src.match(/^\s*#\s*define\s+CV_FW_VERSION\s+"([^"]+)"/m);
      const type = src.match(/CircuventDevice\s+\w+\s*\(\s*"([^"]+)"/);
      return {
        name: e.name,
        dir,
        env: (cfg.match(/^\[env:([^\]]+)\]/m) || [])[1] || e.name,
        board: field(cfg, "board"),
        version: ver ? ver[1] : null,
        type: type ? type[1] : e.name,
      };
    })
    .filter(Boolean);
}

/**
 * The chip a board is built around, from PlatformIO's own board manifest.
 *
 * Asked rather than inferred from the board name: `esp32s3camlcd` and
 * `esp32-s3-devkitc-1` are the same chip under two unrelated names, and a
 * pattern that happens to catch both today is a pattern that will miss the
 * next one silently.
 */
function chipFor(board) {
  const home = pioHome();
  const roots = [
    path.join(home, "platforms", "espressif32", "boards"),
    path.join(home, "platforms", "espressif32@src-*", "boards"),
  ];
  for (const r of roots) {
    const p = path.join(r, `${board}.json`);
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      return j.build?.mcu || null;
    }
  }
  return null;
}

/** boot_app0.bin ships with the Arduino core; it is identical for every project. */
function findBootApp0() {
  const base = path.join(pioHome(), "packages");
  if (!fs.existsSync(base)) return null;
  for (const pkg of fs.readdirSync(base)) {
    if (!pkg.startsWith("framework-arduinoespressif32")) continue;
    const p = path.join(base, pkg, "tools", "partitions", "boot_app0.bin");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function pioHome() {
  return process.env.PLATFORMIO_CORE_DIR || path.join(require("node:os").homedir(), ".platformio");
}

/**
 * The esptool PlatformIO itself uses, rather than whatever is on PATH.
 *
 * There is usually nothing on PATH — esptool is vendored inside the PlatformIO
 * package tree and never installed globally. Taking it from there also means
 * the merge is done by the same version that produced the images, and it makes
 * this script work unchanged on a machine where `pip install esptool` was never
 * run, which is every machine that has only ever used PlatformIO.
 */
function esptoolCommand() {
  const vendored = path.join(pioHome(), "packages", "tool-esptoolpy", "esptool.py");
  if (fs.existsSync(vendored)) return { cmd: pythonExe(), pre: [vendored] };
  return { cmd: "esptool", pre: [] };
}

function pythonExe() {
  for (const c of ["python", "python3"]) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return c;
    } catch { /* try the next one */ }
  }
  throw new Error("no python on PATH to run the vendored esptool.py");
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Prove the merged image is bootable rather than merely present.
 *
 * A wrong bootloader offset still produces a plausible file of a plausible
 * size. The only cheap way to tell the difference is to look for the image
 * magic where the ROM will look for it — if it is not there, the chip will
 * find nothing and sit in a boot loop, and we would rather know now.
 */
function verify(file, chip, appFile) {
  const off = BOOTLOADER_OFFSET[chip];
  const fd = fs.openSync(file, "r");
  try {
    const magic = Buffer.alloc(1);
    fs.readSync(fd, magic, 0, 1, off);
    if (magic[0] !== ESP_IMAGE_MAGIC) {
      throw new Error(
        `merged image has 0x${magic[0].toString(16)} at 0x${off.toString(16)}, expected 0x${ESP_IMAGE_MAGIC.toString(16)} — the bootloader is not where the ${chip} ROM will look for it`
      );
    }

    /*
     * The magic byte only proves the bootloader landed. It says nothing about
     * the application, and an image with a good bootloader and a misplaced app
     * boots far enough to look alive and then fails — which is harder to
     * diagnose than a board that does nothing at all. So the first bytes of the
     * app are compared against the file they came from, at the offset the
     * partition table points at.
     */
    const app = fs.readFileSync(appFile);
    const head = Buffer.alloc(256);
    fs.readSync(fd, head, 0, 256, APP_OFFSET);
    if (!head.equals(app.subarray(0, 256))) {
      throw new Error(`the application is not at 0x${APP_OFFSET.toString(16)} in the merged image`);
    }
  } finally {
    fs.closeSync(fd);
  }
}

function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const skipBuild = process.argv.includes("--no-build");
  fs.mkdirSync(outDir, { recursive: true });

  const bootApp0 = findBootApp0();
  if (!bootApp0) {
    console.error("boot_app0.bin not found — build at least one project first so the Arduino core is installed.");
    process.exit(1);
  }

  const list = projects().filter((p) => only.length === 0 || only.includes(p.name));
  const done = [];
  const failed = [];

  for (const p of list) {
    try {
      if (!p.version) throw new Error("no CV_FW_VERSION in the sketch");
      const chip = chipFor(p.board);
      if (!chip) throw new Error(`unknown board '${p.board}' — no manifest in the PlatformIO core`);
      if (!(chip in BOOTLOADER_OFFSET)) throw new Error(`no bootloader offset known for chip '${chip}'`);

      if (!skipBuild) {
        process.stdout.write(`building ${p.name} … `);
        run("pio", ["run", "-e", p.env], p.dir);
      }

      const build = path.join(p.dir, ".pio", "build", p.env);
      const app = path.join(build, "firmware.bin");
      const boot = path.join(build, "bootloader.bin");
      const parts = path.join(build, "partitions.bin");
      for (const f of [app, boot, parts]) {
        if (!fs.existsSync(f)) throw new Error(`missing ${path.basename(f)} after build`);
      }

      const out = path.join(outDir, `${p.type}-${p.version}-factory.bin`);
      const esp = esptoolCommand();
      run(esp.cmd, [
        ...esp.pre,
        "--chip", chip, "merge_bin", "-o", out,
        "--flash_mode", "dio", "--flash_size", "4MB",
        String(BOOTLOADER_OFFSET[chip]), boot,
        String(PARTITIONS_OFFSET), parts,
        String(BOOT_APP0_OFFSET), bootApp0,
        String(APP_OFFSET), app,
      ], p.dir);

      verify(out, chip, app);
      const kb = Math.round(fs.statSync(out).size / 1024);
      console.log(`ok  ${p.type}-${p.version}-factory.bin  ${kb} KB  (${chip}, bootloader @ 0x${BOOTLOADER_OFFSET[chip].toString(16)})`);
      done.push({ ...p, chip, out });
    } catch (err) {
      console.log(`FAILED ${p.name}: ${err.message.split("\n")[0]}`);
      failed.push(p.name);
    }
  }

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify(
      { builtAt: new Date().toISOString(), images: done.map((d) => ({ type: d.type, version: d.version, chip: d.chip, file: path.basename(d.out) })) },
      null,
      2
    )
  );

  console.log(`\n${done.length} built, ${failed.length} failed`);
  if (failed.length) { console.log(`failed: ${failed.join(", ")}`); process.exit(1); }
}

main();
