# Suwayomi 首次配置：探测现有安装 -> 缺失则下载 -> 启动 -> 写入应用配置
$ErrorActionPreference = 'Continue'
$port = 4567
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Split-Path -Parent $root

function Find-SuwayomiDir {
  $dirs = @('C:\BOT-ATRI\Suwayomi', (Join-Path $proj 'vendor\suwayomi'), (Join-Path $env:USERPROFILE 'Suwayomi'))
  foreach ($d in $dirs) {
    if (Test-Path $d) {
      $jar = Get-ChildItem $d -Recurse -Filter 'Suwayomi-Server*.jar' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($jar) { return $d }
    }
  }
  return $null
}

$dir = Find-SuwayomiDir
if ($dir) {
  Write-Output "已找到 Suwayomi: $dir"
} else {
  Write-Output '未找到 Suwayomi，尝试下载...'
  try {
    $api = Invoke-RestMethod -Uri 'https://api.github.com/repos/Suwayomi/Suwayomi-Server/releases/latest' -Headers @{ 'User-Agent' = 'your-library' } -TimeoutSec 20
    $asset = $api.assets | Where-Object { $_.name -match 'windows-x64\.zip$' } | Select-Object -First 1
    if ($asset) {
      $dest = Join-Path $proj 'vendor\suwayomi'
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      $zip = Join-Path $dest $asset.name
      Write-Output "下载 $($asset.name) (约 150MB，请耐心等待)..."
      Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
      Write-Output '解压中...'
      Expand-Archive -Path $zip -DestinationPath $dest -Force
      $dir = Find-SuwayomiDir
    }
  } catch {
    Write-Output "下载失败: $($_.Exception.Message)"
    Write-Output '请手动下载 Suwayomi-Server (https://github.com/Suwayomi/Suwayomi-Server/releases) 并解压到 C:\BOT-ATRI\Suwayomi'
  }
}

if (-not $dir) {
  Write-Output '[跳过] 未找到 Suwayomi，漫画功能暂不可用（书籍/论文不受影响）'
} else {
  # 启动
  & (Join-Path $root 'suwayomi.ps1') -Action start
  # 等待监听
  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { $ok = $true; break }
  }
  if ($ok) { Write-Output "Suwayomi 已就绪: http://127.0.0.1:$port" }
  else { Write-Output "Suwayomi 未在 $port 端口监听，请检查 server.log" }

  # 写入应用配置
  $settingsPath = Join-Path $proj 'electron\settings.json'
  if (Test-Path $settingsPath) {
    $sj = Get-Content $settingsPath -Raw | ConvertFrom-Json
    $sj.suwayomiUrl = "http://127.0.0.1:$port"
    $sj | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
    Write-Output '已写入应用配置 (suwayomiUrl)'
  }
}
