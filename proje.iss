[Setup]
; Senin verdiðin tam yol burasý
SourceDir=C:\Users\MONSTER\Desktop\GÝTHUB-PROJECT\PZPUBLISHER

AppId={{C789B123-A456-4D89-9012-PZPUBLISHERALP}}
AppName=PZPUBLISHER
AppVersion=1.0.0
AppPublisher=Alp / TN Studio
DefaultDirName={autopf}\PZPUBLISHER
DefaultGroupName=PZPUBLISHER
OutputDir=dist\setup
OutputBaseFilename=PZPUBLISHER_Setup
; Ýkonun tam adý klasörde pzpublisherlogo.ico mu kontrol et
SetupIconFile=pzpublisherlogo.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Ana uygulama dosyalarý
Source: "dist\PZPUBLISHER-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Araçlar ve diðer dosyalar
Source: "tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "default_cover.jpg"; DestDir: "{app}"; Flags: ignoreversion
Source: "steam.png"; DestDir: "{app}"; Flags: ignoreversion
Source: "pzpublisherlogo.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\PZPUBLISHER"; Filename: "{app}\PZPUBLISHER.exe"; IconFilename: "{app}\pzpublisherlogo.ico"
Name: "{autodesktop}\PZPUBLISHER"; Filename: "{app}\PZPUBLISHER.exe"; IconFilename: "{app}\pzpublisherlogo.ico"; Tasks: desktopicon

