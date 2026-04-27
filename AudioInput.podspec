Pod::Spec.new do |s|
  s.name = 'AudioInput'
  s.version = '2.2.0'
  s.summary = 'Audio input capture plugin for Capacitor'
  s.license = 'MIT'
  s.homepage = 'https://github.com/edimuj/cordova-plugin-audioinput'
  s.author = 'Edin Mujkanovic'
  s.source = { :git => 'https://github.com/edimuj/cordova-plugin-audioinput', :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.swift'
  s.ios.deployment_target  = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
  s.frameworks = 'AVFoundation', 'AudioToolbox', 'CoreAudio', 'Accelerate'
end
