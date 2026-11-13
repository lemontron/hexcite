#!/bin/bash
set -eo pipefail

cd "$(dirname "$0")/.."

# Use the installed Xcode when xcode-select points at the standalone command line tools.
if [[ -z ${DEVELOPER_DIR:-} ]]; then
  selected=$(xcode-select -p 2>/dev/null || true)
  xcode_dir=/Applications/Xcode.app/Contents/Developer
  if [[ ( -z $selected || $selected == */CommandLineTools ) && -d $xcode_dir ]]; then
    export DEVELOPER_DIR=$xcode_dir
  fi
fi

# Select an available physical iPhone. An optional device ID resolves ambiguity.
device=$(xcrun xcdevice list --timeout 5 | /usr/bin/ruby -rjson -e '
  phones = JSON.parse(STDIN.read).select do |device|
    device["available"] && !device["simulator"] &&
      device["platform"] == "com.apple.platform.iphoneos" &&
      device["modelCode"].to_s.start_with?("iPhone")
  end
  phones.select! { |phone| phone["identifier"] == ARGV.first } unless ARGV.empty?
  abort "No matching iPhone is available. Connect and unlock your iPhone." if phones.empty?
  if phones.size > 1
    warn "Multiple iPhones are available. Run npm run ios -- <device ID>."
    phones.each { |phone| warn "  #{phone["name"]} (#{phone["modelName"]}): #{phone["identifier"]}" }
    exit 1
  end
  puts phones.first.fetch("identifier")
' -- "$@")

# Infer the team only when the valid Apple Development identities agree.
team=${DEVELOPMENT_TEAM:-}
if [[ -z $team ]]; then
  identities=$(security find-identity -v -p codesigning)
  if [[ $identities == *'"Apple Development:'* ]]; then
    team=$(security find-certificate -a -c 'Apple Development:' -p | /usr/bin/ruby -ropenssl -e '
      teams = STDIN.read.scan(/-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/m).map do |pem|
        certificate = OpenSSL::X509::Certificate.new(pem)
        fingerprint = OpenSSL::Digest::SHA1.hexdigest(certificate.to_der).upcase
        next unless ARGV.first.include?(fingerprint)
        certificate.subject.to_a.find { |name, _| name == "OU" }&.at(1)
      end.compact.uniq
      puts teams.first if teams.size == 1
    ' -- "$identities")
  fi
fi

# Build the web game and copy it into the native project before compiling.
npm run build
./node_modules/.bin/cap sync ios

derived_data=ios/DerivedData
build_args=(-quiet -project ios/App/App.xcodeproj -scheme Hexcite -configuration Debug
  -destination "id=$device" -derivedDataPath "$derived_data"
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration)
if [[ -n $team ]]; then
  build_args+=("DEVELOPMENT_TEAM=$team")
fi
xcodebuild "${build_args[@]}" build

# Read the bundle ID from the signed build so we launch the app we installed.
app="$derived_data/Build/Products/Debug-iphoneos/Hexcite.app"
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")
xcrun devicectl device install app --device "$device" "$app"
xcrun devicectl device process launch --terminate-existing --device "$device" "$bundle_id"
