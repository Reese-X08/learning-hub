# 构建「自动更新器」：一个独立的小程序，不需要手动覆盖
#
#   pwsh -File tools/build-updater-package.ps1
#
# 产物：学习中心-自动更新器.zip（约 20KB）
# 用法：解压后双击 更新.bat；如果不在学习中心目录里，按提示选择目录。

param(
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pkg = Get-Content 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Version) { $Version = $pkg.version }
Write-Host "构建自动更新器 $Version"

$stage = Join-Path $root 'dist\自动更新器'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item '更新.bat', 'updater.ps1', '更新器说明.txt' $stage -Force

$zip = Join-Path $root '学习中心-自动更新器.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal

$size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Host "完成：$zip（$size KB）"
Write-Host '解压后双击 更新.bat；更新器会自动检查、下载、替换、重启。'
