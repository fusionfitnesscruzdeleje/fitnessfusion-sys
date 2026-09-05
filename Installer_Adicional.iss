[Setup]
AppName=Fusion Fitness Adicional
AppVersion=3.0
DefaultDirName={pf}\FusionFitnessAdicional
DefaultGroupName=Fusion Fitness Adicional
UninstallDisplayIcon={app}\FusionFitnessAdicional.exe
Compression=lzma2
SolidCompression=yes
OutputDir=.\Output
OutputBaseFilename=Instalador_FusionFitness_Adicional
PrivilegesRequired=admin

[Files]
Source: "backend\dist\FusionFitnessAdicional\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Fusion Fitness Adicional"; Filename: "{app}\FusionFitnessAdicional.exe"
Name: "{commondesktop}\Fusion Fitness Adicional"; Filename: "{app}\FusionFitnessAdicional.exe"

[Run]
Filename: "{app}\FusionFitnessAdicional.exe"; Description: "Lanzar Fusion Fitness Adicional"; Flags: nowait postinstall skipifsilent
