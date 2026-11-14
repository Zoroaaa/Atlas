# 生成 Android release 签名密钥（本地执行；密码不落盘、不经网络）
# 用法：powershell -ExecutionPolicy Bypass -File mobile\scripts\generate-signing-key.ps1
param(
  [string]$OutDir = "$env:USERPROFILE\.atlas-signing",
  [string]$Alias = "atlas"
)

$ErrorActionPreference = "Stop"

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if ($keytool) {
  $keytoolPath = $keytool.Source
} else {
  $candidate = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Recurse -Filter keytool.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $candidate) {
    throw "未找到 keytool。请安装 JDK 17+ 并确保 keytool 在 PATH 中。"
  }
  $keytoolPath = $candidate.FullName
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$keystore = Join-Path $OutDir "atlas-release.p12"

if (Test-Path $keystore) {
  throw "密钥库已存在：$keystore。覆盖会导致已安装应用无法升级，请先备份并移走。"
}

$secure = Read-Host "设置密钥库密码（建议 16 位以上，需自行备份）" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if (-not $plain -or $plain.Length -lt 6) {
  throw "密码至少 6 位。"
}

# 通过环境变量传参，避免密码出现在命令行历史与进程参数中
$env:ATLAS_STORE_PASS = $plain
try {
  & $keytoolPath -genkeypair -v `
    -keystore $keystore `
    -storetype PKCS12 `
    -alias $Alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10950 `
    -storepass:env ATLAS_STORE_PASS `
    -keypass:env ATLAS_STORE_PASS `
    -dname "CN=Atlas, O=Atlas, OU=Mobile, C=CN"
} finally {
  Remove-Item Env:ATLAS_STORE_PASS -ErrorAction SilentlyContinue
}

$base64File = Join-Path $OutDir "atlas-release.p12.base64.txt"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)) |
  Set-Content -Path $base64File -Encoding ascii -NoNewline

Write-Host ""
Write-Host "密钥库：$keystore"
Write-Host "Base64：$base64File"
Write-Host ""
Write-Host "接下来在 GitHub 仓库 Settings -> Secrets and variables -> Actions 添加 4 个 Secrets："
Write-Host "  ANDROID_KEYSTORE_BASE64   = base64 文件内容"
Write-Host "  ANDROID_KEYSTORE_PASSWORD = 刚才设置的密码"
Write-Host "  ANDROID_KEY_ALIAS         = $Alias"
Write-Host "  ANDROID_KEY_PASSWORD      = 与 ANDROID_KEYSTORE_PASSWORD 相同"
Write-Host ""
Write-Host "务必备份 $OutDir。密钥丢失后，已安装的应用将无法覆盖升级，只能卸载重装。"
