require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RoomScan"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/jere0/react-native-room-scan"
  s.license      = package["license"]
  s.authors      = { "Jeremy" => "jere0208@gmail.com" }
  s.platforms    = { :ios => "16.0" }
  s.source       = { :git => "https://github.com/jere0/react-native-room-scan.git", :tag => s.version.to_s }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.frameworks   = "RoomPlan", "ARKit", "QuickLook"
  s.swift_version = "5.0"

  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
