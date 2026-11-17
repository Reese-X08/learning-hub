# 构建「代码更新包」：只含程序文件，不含 node/ 和 data/
#
#   pwsh -File tools/build-update-package.ps1
#
# 产物：学习中心-代码更新包.zip（约 1MB）
# 用法：解压到原来的「学习中心」文件夹，覆盖同名文件；node/ 和 data/ 保留不动。
# 作为独立更新器和应用内自更新的下载源；旧版本也可以手动覆盖。

param(
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pkg = Get-Content 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Version) { $Version = $pkg.version }
Write-Host "构建代码更新包 $Version"

$stage = Join-Path $root 'dist\代码更新包'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item 'public' $stage -Recurse
Copy-Item 'lib' $stage -Recurse
Copy-Item 'server.js', 'package.json', 'version.json', '启动.bat' $stage -Force
Copy-Item 'templates\使用说明.txt', 'templates\更新说明.txt' $stage -Force
Copy-Item 'templates\代码更新说明.txt' $stage -Force
Copy-Item 'updater.ps1', '更新.bat', '更新器说明.txt' $stage -Force

$zip = Join-Path $root '学习中心-代码更新包.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal

$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "完成：$zip（$size MB）"
Write-Host '这个包由更新器自动下载使用；手动覆盖时 node/ 和 data/ 不会被覆盖。'
