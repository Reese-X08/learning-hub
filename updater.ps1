param(
  [string]$App = '',
  [int]$Port = 0,
  [string]$ServerHost = '',
  [string]$Zip = '',
  [switch]$Check,
  [switch]$NoOpen,
  [switch]$AllowHttp
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'https://github.com/Reese-X08/learning-hub'
$VersionUrls = @(
  'https://raw.githubusercontent.com/Reese-X08/learning-hub/main/version.json',
  'https://cdn.jsdelivr.net/gh/Reese-X08/learning-hub@main/version.json',
  'https://fastly.jsdelivr.net/gh/Reese-X08/learning-hub@main/version.json'
)

function Write-Step {
  param([string]$Message)
  Write-Host ('[更新] ' + $Message) -ForegroundColor Cyan
}

function Write-Note {
  param([string]$Message)
  Write-Host ('[提示] ' + $Message) -ForegroundColor Yellow
}

function Write-Bad {
  param([string]$Message)
  Write-Host ('[错误] ' + $Message) -ForegroundColor Red
}

function Normalize-Version {
  param($Value)
  if ($null -eq $Value) { return '' }
  return (([string]$Value).Trim() -replace '^[vV]', '')
}

function Get-VersionParts {
  param($Value)
  $text = Normalize-Version $Value
  $core = ($text -split '[-+]')[0]
  $parts = @()
  foreach ($piece in ($core -split '\.')) {
    $number = 0
    $digits = ($piece -replace '\D.*$', '')
    if (-not [int]::TryParse($digits, [ref]$number)) { $number = 0 }
    $parts += $number
  }
  return $parts
}

function Compare-Version {
  param($Left, $Right)
  $a = Get-VersionParts $Left
  $b = Get-VersionParts $Right
  $count = [Math]::Max($a.Count, $b.Count)
  for ($i = 0; $i -lt $count; $i++) {
    $x = 0
    $y = 0
    if ($i -lt $a.Count) { $x = $a[$i] }
    if ($i -lt $b.Count) { $y = $b[$i] }
    if ($x -gt $y) { return 1 }
    if ($x -lt $y) { return -1 }
  }
  return 0
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Test-AppDir {
  param([string]$Dir)
  if (-not $Dir) { return $false }
  return ((Test-Path (Join-Path $Dir 'server.js')) -and (Test-Path (Join-Path $Dir 'package.json')))
}

function Resolve-AppDir {
  if ($App) {
    if (Test-AppDir $App) { return (Resolve-Path -LiteralPath $App).Path }
    throw ('这个路径不像学习中心：' + $App)
  }

  $parent = Split-Path -Parent $PSScriptRoot
  $candidates = @(
    $PSScriptRoot,
    (Get-Location).Path,
    (Join-Path $PSScriptRoot '学习中心'),
    (Join-Path (Get-Location) '学习中心')
  )
  if ($parent) { $candidates += (Join-Path $parent '学习中心') }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-AppDir $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  try {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = '请选择「学习中心」文件夹（里面有 server.js）'
    $dialog.ShowNewFolderButton = $false
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      return $dialog.SelectedPath
    }
  } catch {
    Write-Note '无法打开文件夹选择框，改为手动输入。'
  }

  $answer = Read-Host '请输入「学习中心」文件夹路径（可以直接把文件夹拖进这个窗口）'
  if ($answer) { return $answer.Trim().Trim('"').Trim("'") }
  return ''
}

function Read-BatSetting {
  param([string]$Name, [string]$File, [string]$Default)
  if (-not (Test-Path -LiteralPath $File)) { return $Default }
  $text = Get-Content -LiteralPath $File -Raw -Encoding UTF8
  $pattern = '(?im)^\s*set\s+"?' + [regex]::Escape($Name) + '=([^"\r\n]+)"?'
  $match = [regex]::Match($text, $pattern)
  if ($match.Success) { return $match.Groups[1].Value.Trim() }
  return $Default
}

function Get-ServerPort {
  if ($Port -gt 0) { return $Port }
  if ($env:PORT) {
    $value = 0
    if ([int]::TryParse([string]$env:PORT, [ref]$value)) { return $value }
  }
  $localPort = Read-BatSetting 'PORT' (Join-Path $App 'local.bat') ''
  if ($localPort) {
    $value = 0
    if ([int]::TryParse($localPort, [ref]$value)) { return $value }
  }
  $batPort = Read-BatSetting 'PORT' (Join-Path $App '启动.bat') '4173'
  $value = 0
  if ([int]::TryParse($batPort, [ref]$value)) { return $value }
  return 4173
}

function Get-ServerHost {
  if ($ServerHost) { return $ServerHost }
  if ($env:HOST) { return [string]$env:HOST }
  $localHost = Read-BatSetting 'HOST' (Join-Path $App 'local.bat') ''
  if ($localHost) { return $localHost }
  $batHost = Read-BatSetting 'HOST' (Join-Path $App '启动.bat') '127.0.0.1'
  if ($batHost) { return $batHost }
  return '127.0.0.1'
}

function Get-HealthHost {
  param([string]$BindHost)
  if ($BindHost -eq '0.0.0.0') { return '127.0.0.1' }
  if ($BindHost -eq '::') { return '::1' }
  return $BindHost
}

function Get-ApiUrl {
  param([string]$HostName, [int]$ServerPort)
  if ($HostName.Contains(':') -and -not $HostName.StartsWith('[')) {
    $HostName = '[' + $HostName + ']'
  }
  return ('http://' + $HostName + ':' + $ServerPort + '/api/version')
}

function Get-RunningPid {
  param([int]$ServerPort)
  try {
    $connection = Get-NetTCPConnection -State Listen -LocalPort $ServerPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
  } catch {
    # 老系统没有 Get-NetTCPConnection 时退回 netstat
  }
  try {
    $lines = & netstat.exe -ano -p tcp 2>$null
    foreach ($line in $lines) {
      if ($line -notmatch 'LISTENING') { continue }
      $columns = $line.Trim() -split '\s+'
      if ($columns.Count -lt 5) { continue }
      $localAddress = $columns[1]
      if ($localAddress -match (':' + $ServerPort + '$')) {
        $pidValue = 0
        if ([int]::TryParse($columns[$columns.Count - 1], [ref]$pidValue)) { return $pidValue }
      }
    }
  } catch {
    return 0
  }
  return 0
}

function Get-NodePath {
  $bundled = Join-Path $App 'node\node.exe'
  if (Test-Path -LiteralPath $bundled) { return $bundled }
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return ''
}

function Start-HubServer {
  $node = Get-NodePath
  if (-not $node) { throw '找不到 Node 运行时（node\node.exe 或 PATH 里的 node.exe）' }
  $Env:PORT = [string]$Port
  $Env:HOST = $ServerHost
  $Env:UPDATE_RESTARTED = '1'
  return (Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $App -WindowStyle Hidden -PassThru)
}

function Test-PortOpen {
  param([string]$HostName, [int]$ServerPort)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect($HostName, $ServerPort, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(400)) { return $false }
    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-ApiVersion {
  param([string]$Expected, [int]$Seconds)
  $hostName = Get-HealthHost $ServerHost
  $url = Get-ApiUrl $hostName $Port
  $tries = [Math]::Max(1, [int]($Seconds * 4))
  for ($i = 0; $i -lt $tries; $i++) {
    if (-not (Test-PortOpen $hostName $Port)) {
      Start-Sleep -Milliseconds 250
      continue
    }
    try {
      $info = Invoke-RestMethod -Uri $url -TimeoutSec 2 -UseBasicParsing
      if ((Normalize-Version $info.version) -eq (Normalize-Version $Expected)) { return $true }
    } catch {
      # 端口开了但 HTTP 还没准备好
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Open-LearningHub {
  $url = 'http://127.0.0.1:' + $Port + '/'
  $browsers = @()
  $x86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  if ($x86) {
    $browsers += (Join-Path $x86 'Microsoft\Edge\Application\msedge.exe')
    $browsers += (Join-Path $x86 'Google\Chrome\Application\chrome.exe')
  }
  if ($Env:ProgramFiles) {
    $browsers += (Join-Path $Env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    $browsers += (Join-Path $Env:ProgramFiles 'Google\Chrome\Application\chrome.exe')
  }
  foreach ($browser in $browsers) {
    if ($browser -and (Test-Path -LiteralPath $browser)) {
      Start-Process -FilePath $browser -ArgumentList ('--app=' + $url)
      return
    }
  }
  Start-Process $url
}

function Restore-Plan {
  param($Plan)
  foreach ($item in $Plan.files) {
    $target = Join-Path $Plan.appDir $item.path
    $backup = Join-Path $Plan.backupDir $item.path
    if ($item.existed) {
      if (Test-Path -LiteralPath $backup) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $backup -Destination $target -Force
      }
    } else {
      Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    }
  }
}

function Write-ApplyError {
  param([string]$Version, [string]$Message)
  $payload = [pscustomobject]@{
    version = $Version
    message = $Message
    at = (Get-Date).ToString('o')
  }
  Write-Utf8NoBom (Join-Path $App 'data\update-error.json') ($payload | ConvertTo-Json -Depth 4)
}

try {
  $App = Resolve-AppDir
  if (-not $App) { throw '没有找到学习中心文件夹。请把更新器解压到学习中心文件夹里，或运行后选择该文件夹。' }
  $App = (Resolve-Path -LiteralPath $App).Path.TrimEnd('\')

  $localPkg = Get-Content -LiteralPath (Join-Path $App 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $localVersion = Normalize-Version $localPkg.version
  if (-not $localVersion) { throw '读不到当前版本号（package.json）' }

  $Port = Get-ServerPort
  $ServerHost = Get-ServerHost

  Write-Host ''
  Write-Host '  Learning Hub Updater' -ForegroundColor White
  Write-Host ('  目录：' + $App)
  Write-Host ('  当前版本：v' + $localVersion)
  Write-Host ''

  $best = $null
  if ($Zip) {
    if (-not (Test-Path -LiteralPath $Zip)) { throw ('找不到更新包：' + $Zip) }
    Write-Step ('使用本地更新包：' + $Zip)
  } else {
    $urls = New-Object 'System.Collections.Generic.List[string]'
    if ($env:UPDATE_URL) { $urls.Add([string]$env:UPDATE_URL) }
    $stateFile = Join-Path $App 'data\update-state.json'
    if (Test-Path -LiteralPath $stateFile) {
      try {
        $state = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($state.customUrl) { $urls.Add([string]$state.customUrl) }
      } catch {
        # 旧的检查状态坏了也没关系
      }
    }
    foreach ($url in $VersionUrls) { $urls.Add($url) }

    $results = @()
    foreach ($url in ($urls | Select-Object -Unique)) {
      try {
        $info = Invoke-RestMethod -Uri $url -TimeoutSec 15 -UseBasicParsing -Headers @{ 'User-Agent' = 'learning-hub-updater' }
        $version = Normalize-Version $info.version
        if ($version) {
          $results += [pscustomobject]@{ version = $version; info = $info; source = $url }
        }
      } catch {
        Write-Note ('线路不可用：' + $url)
      }
    }

    if ($results.Count -eq 0) { throw '连不上更新服务器，请检查网络后重试。' }
    $best = $results[0]
    foreach ($result in $results) {
      if ((Compare-Version $result.version $best.version) -gt 0) { $best = $result }
    }

    Write-Host ('  最新版本：v' + $best.version)
    if ($Check) {
      if ((Compare-Version $best.version $localVersion) -gt 0) {
        Write-Step '有新版本可用。'
      } else {
        Write-Step '已经是最新版本。'
      }
      exit 0
    }
    if ((Compare-Version $best.version $localVersion) -le 0) {
      Write-Step '已经是最新版本，不需要更新。'
      exit 0
    }
  }

  $codeUrl = ''
  if ($best) {
    if ($best.info.codeUrl) { $codeUrl = [string]$best.info.codeUrl }
    elseif ($best.info.url) { $codeUrl = [string]$best.info.url }
  }
  if (-not $codeUrl -or $codeUrl -notmatch '(?i)\.zip(\?|$)') {
    $codeUrl = $Repo + '/releases/latest/download/learning-hub-code.zip'
  }
  if (-not $AllowHttp -and $codeUrl -notmatch '^https://' -and $codeUrl -notmatch '^http://(127\.0\.0\.1|localhost)(:\d+)?/') {
    throw ('更新包地址不是 HTTPS：' + $codeUrl)
  }

  $cacheDir = Join-Path $App 'data\updater-cache'
  New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
  $zipPath = $Zip
  if (-not $zipPath) {
    $zipPath = Join-Path $cacheDir ('learning-hub-' + $best.version + '.zip')
    Write-Step ('下载 v' + $best.version + ' 代码包...')
    Invoke-WebRequest -Uri $codeUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 90
  }

  $zipFile = Get-Item -LiteralPath $zipPath
  if ($zipFile.Length -lt 1024) { throw '更新包太小，可能下载失败。' }
  if ($zipFile.Length -gt 30MB) { throw '更新包太大，已中止。' }
  $head = [System.IO.File]::ReadAllBytes($zipPath)
  if ($head.Length -lt 4 -or $head[0] -ne 0x50 -or $head[1] -ne 0x4B) { throw '下载到的不是 zip 文件。' }

  $stage = Join-Path $App 'data\updater-stage'
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Write-Step '解压更新包...'
  Expand-Archive -LiteralPath $zipPath -DestinationPath $stage -Force

  $sourceRoot = $stage
  if (-not (Test-AppDir $sourceRoot)) {
    $nested = Join-Path $stage '学习中心'
    if (Test-AppDir $nested) { $sourceRoot = $nested } else { throw '更新包里找不到 server.js。' }
  }

  $newPkg = Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $newVersion = Normalize-Version $newPkg.version
  if (-not $newVersion) { throw '更新包里的 package.json 没有版本号。' }
  if ($best -and (Compare-Version $newVersion $best.version) -ne 0) {
    throw ('更新包版本 v' + $newVersion + ' 和更新源提示的 v' + $best.version + ' 不一致。')
  }
  if ((Compare-Version $newVersion $localVersion) -le 0) {
    Write-Step ('更新包里是 v' + $newVersion + '，不比当前 v' + $localVersion + ' 新。')
    exit 0
  }
  $newMeta = Get-Content -LiteralPath (Join-Path $sourceRoot 'version.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ((Normalize-Version $newMeta.version) -ne $newVersion) {
    throw '更新包里的 version.json 和 package.json 版本不一致。'
  }

  $serverStopped = $false
  $oldPid = Get-RunningPid $Port
  $wasRunning = $oldPid -gt 0
  if ($oldPid -gt 0) {
    $oldProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $oldPid) -ErrorAction SilentlyContinue
    if (-not $oldProcess -or $oldProcess.CommandLine -notmatch 'server\.js') {
      throw ('端口 ' + $Port + ' 被别的程序占用（PID ' + $oldPid + '），请先关掉它。')
    }
    Write-Step ('停止旧服务（PID ' + $oldPid + '）...')
    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    $serverStopped = $true
    $stopHost = Get-HealthHost $ServerHost
    for ($i = 0; $i -lt 40; $i++) {
      if (-not (Test-PortOpen $stopHost $Port)) { break }
      Start-Sleep -Milliseconds 250
    }
    if (Test-PortOpen $stopHost $Port) { throw '旧服务没有退出，更新已中止。' }
  }

  $files = @()
  Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
    $relative = $relative.Replace('\', '/')
    $top = ($relative -split '/')[0]
    if (@('data', 'node', '.git') -contains $top) { return }
    if (@('local.bat', '启动.bat', '更新.bat', 'updater.ps1', 'update-plan.json') -contains $relative) { return }
    $files += [pscustomobject]@{ rel = $relative; full = $_.FullName }
  }

  if ($files.Count -eq 0) { throw '更新包里没有可替换的程序文件。' }
  $files = $files | Sort-Object @{ Expression = { if ($_.rel -eq 'package.json') { 2 } elseif ($_.rel -eq 'version.json') { 3 } else { 1 } } }, rel

  $backupDir = Join-Path $App ('data\update-backup\' + $newVersion)
  if (Test-Path -LiteralPath $backupDir) { Remove-Item -LiteralPath $backupDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

  $planFiles = @()
  foreach ($file in $files) {
    $target = Join-Path $App $file.rel
    $existed = Test-Path -LiteralPath $target
    $planFiles += [pscustomobject]@{ path = $file.rel; existed = $existed }
    if ($existed) {
      $backup = Join-Path $backupDir $file.rel
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -LiteralPath $target -Destination $backup -Force
    }
  }

  $plan = [pscustomobject]@{
    version = $newVersion
    fromVersion = $localVersion
    appDir = $App
    backupDir = $backupDir
    files = $planFiles
    source = 'updater'
  }
  $planFile = Join-Path $App 'data\update-plan.json'
  Write-Utf8NoBom $planFile ($plan | ConvertTo-Json -Depth 6)

  Write-Step ('替换文件（' + $files.Count + ' 个）...')
  try {
    foreach ($file in $files) {
      $target = Join-Path $App $file.rel
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $file.full -Destination $target -Force
    }
  } catch {
    Restore-Plan $plan
    Remove-Item -LiteralPath $planFile -Force -ErrorAction SilentlyContinue
    throw ('替换文件失败：' + $_.Exception.Message)
  }

  # 更新器自己这几个文件不在替换清单里（可能正被运行占用），但旧版本里可能没有它们：
  # 更新成功后尽力补一份，失败也不影响主程序。
  foreach ($extra in @('updater.ps1', '更新.bat', '更新器说明.txt')) {
    $sourceExtra = Join-Path $sourceRoot $extra
    if (-not (Test-Path -LiteralPath $sourceExtra)) { continue }
    try {
      Copy-Item -LiteralPath $sourceExtra -Destination (Join-Path $App $extra) -Force -ErrorAction Stop
    } catch {
      Write-Note ('没能更新 ' + $extra + '，可忽略：' + $_.Exception.Message)
    }
  }

  Write-Step ('启动 v' + $newVersion + '...')
  $newProcess = $null
  $started = $false
  try {
    $newProcess = Start-HubServer
    $started = Wait-ApiVersion $newVersion 15
  } catch {
    $started = $false
  }

  if (-not $started) {
    if ($newProcess) { Stop-Process -Id $newProcess.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
    Restore-Plan $plan
    Remove-Item -LiteralPath $planFile -Force -ErrorAction SilentlyContinue
    Write-ApplyError $newVersion ('新版本 v' + $newVersion + ' 启动失败，已恢复 v' + $localVersion + '。请稍后重试或下载完整包。')
    Write-Bad '新版本启动失败，正在恢复上一版...'
    $oldProcess2 = Start-HubServer
    Wait-ApiVersion $localVersion 8 | Out-Null
    throw '更新失败，已恢复上一版。'
  }

  Remove-Item -LiteralPath $planFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  Write-Step ('更新完成：v' + $localVersion + ' -> v' + $newVersion)

  if (-not $NoOpen) {
    Open-LearningHub
    Write-Note '已打开新窗口；旧窗口如果没自动刷新，可以直接关掉。'
  }
  exit 0
} catch {
  Write-Bad $_.Exception.Message
  if ($serverStopped -and -not (Test-PortOpen (Get-HealthHost $ServerHost) $Port)) {
    Write-Note '正在重新启动原来的服务...'
    try {
      Start-HubServer | Out-Null
      Wait-ApiVersion $localVersion 8 | Out-Null
    } catch {
      Write-Bad '原来的服务也没能启动，请双击 启动.bat 重试。'
    }
  }
  Write-Host ''
  Write-Host '更新没有完成。你可以重新运行 更新.bat，或直接下载完整包。' -ForegroundColor Yellow
  exit 1
}
