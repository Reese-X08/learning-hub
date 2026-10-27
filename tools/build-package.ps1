# 构建便携包：把程序 + Node 运行时打成一个可直接发给别人的 zip
#
#   pwsh -File tools/build-package.ps1
#   pwsh -File tools/build-package.ps1 -NodeExe "C:\path\to\node.exe"
#
# 产物：学习中心-便携版.zip（根目录）
# 注意：包里不含 data/db.json，覆盖解压不会冲掉使用者的数据。

param(
  [string]$NodeExe = '',
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pkg = Get-Content 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Version) { $Version = $pkg.version }
Write-Host "构建版本 $Version"

$distRoot = Join-Path $root 'dist'
$app = Join-Path $distRoot '学习中心'

if (Test-Path $app) { Remove-Item $app -Recurse -Force }
New-Item -ItemType Directory -Force -Path $app | Out-Null

# ── 程序文件 ──
Copy-Item 'public' $app -Recurse
Copy-Item 'extension' $app -Recurse
Copy-Item 'lib' $app -Recurse
Copy-Item 'server.js', 'package.json', 'version.json', '启动.bat', 'LICENSE' $app -Force
Copy-Item 'templates\使用说明.txt', 'templates\更新说明.txt' $app -Force

# ── data：只放模板，不放 db.json ──
$dataDir = Join-Path $app 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Copy-Item 'templates\db.template.json' (Join-Path $dataDir 'db.template.json') -Force
Copy-Item 'templates\data-说明.txt' (Join-Path $dataDir '说明.txt') -Force

# ── Node 运行时 ──
if (-not $NodeExe) {
  if (Test-Path 'node\node.exe') {
    $NodeExe = Join-Path $root 'node\node.exe'
  }
}

if (-not $NodeExe) {
  $nodeVersion = '22.20.0'
  $url = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"
  $cache = Join-Path $env:TEMP "node-v$nodeVersion-win-x64.zip"
  $unpacked = Join-Path $env:TEMP "node-v$nodeVersion-win-x64"

  if (-not (Test-Path $cache)) {
    Write-Host "下载 Node $nodeVersion ..."
    Invoke-WebRequest -Uri $url -OutFile $cache
  }
  if (-not (Test-Path $unpacked)) {
    Expand-Archive -LiteralPath $cache -DestinationPath $env:TEMP -Force
  }
  $NodeExe = Join-Path $unpacked 'node.exe'
}

if (-not (Test-Path $NodeExe)) { throw "找不到 node.exe：$NodeExe" }

$nodeOut = Join-Path $app 'node'
New-Item -ItemType Directory -Force -Path $nodeOut | Out-Null
Copy-Item $NodeExe (Join-Path $nodeOut 'node.exe') -Force

# ── 打包 ──
$zip = Join-Path $root '学习中心-便携版.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }

if (Get-Command tar -ErrorAction SilentlyContinue) {
  tar -a -cf $zip -C $distRoot '学习中心'
} else {
  Compress-Archive -Path $app -DestinationPath $zip -CompressionLevel Optimal
}

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "完成：$zip（$size MB）"
Write-Host '下一步：到 GitHub 建一个 Release，把 zip 传上去；version.json 里的 url 改成这个 Release 地址。'
