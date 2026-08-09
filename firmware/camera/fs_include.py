"""
Gives SD_MMC the include path for FS.

WHY THIS FILE EXISTS

SD_MMC.h opens with `#include <FS.h>`. Both libraries ship with the Arduino
framework and the dependency finder resolves both, but it registers them as
siblings rather than nesting FS under SD_MMC, so neither is handed the other's
include directory. Building SD_MMC.cpp then fails with

    SD_MMC.h:21:10: fatal error: FS.h: No such file or directory

from inside a framework header, which reads like a corrupt toolchain and is
really one missing -I.

The obvious fixes do not work. Listing FS in `lib_deps` changes nothing —
it was already being found. Putting the path in `build_flags` as
`-I${platformio.packages_dir}/...` looks right and silently produces

    -IC:/.../platforms/espressif32/builder/Usersv-hbonthada.platformiopackages/...

because the interpolated Windows path carries backslashes and the flag string
is split with shell rules that eat them, leaving a relative path assembled
from the fragments. The result compiles the same failure while appearing to
have been fixed, which is worse than not trying.

Asking the platform where the package actually lives sidesteps the quoting
entirely, and works the same on Windows, macOS and Linux.
"""
import os

Import("env")  # noqa: F821  (injected by PlatformIO)

framework = env.PioPlatform().get_package_dir("framework-arduinoespressif32")
if framework:
    fs_src = os.path.join(framework, "libraries", "FS", "src")
    if os.path.isdir(fs_src):
        env.Append(CPPPATH=[fs_src])
    else:
        print("[cv] warning: FS library not found at %s" % fs_src)
else:
    print("[cv] warning: arduino framework package not found; SD_MMC may not build")
