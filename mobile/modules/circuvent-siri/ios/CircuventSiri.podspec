require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "..", "..", "package.json")))

Pod::Spec.new do |s|
  s.name           = "CircuventSiri"
  s.version        = "1.0.0"
  s.summary        = "Siri / Shortcuts control for Circuvent devices"
  s.description    = "Exposes App Intents so Siri can control Circuvent devices without opening the app."
  s.author         = "Circuvent Technologies"
  s.homepage       = "https://circuvent.com"
  s.platforms      = { :ios => "13.4" }
  s.source         = { git: "" }
  s.static_framework = true

  s.dependency "ExpoModulesCore"

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_COMPILATION_MODE" => "wholemodule"
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
