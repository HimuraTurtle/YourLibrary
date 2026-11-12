# Suwayomi 漫画服务器管理脚本
# 用法: powershell -ExecutionPolicy Bypass -File scripts\suwayomi.ps1 -Action start|stop|status
param([ValidateSet('start','stop','status')] [string]$Action = 'status')

$port = 4567

function Find-Suwayomi {
  $proj = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
  $dirs = @('C:\BOT-ATRI\Suwayomi', (Join-Path $proj 'vendor\suwayomi'), (Join-Path $env:USERPROFILE 'Suwayomi'))
  foreach ($d in $dirs) {
    if (Test-Path $d) {
      $jar = Get-ChildItem $d -Recurse -Filter 'Suwayomi-Server*.jar' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($jar) {
        $java = Get-ChildItem $d -Recurse -Filter 'java.exe' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'jre[\\/]bin' } | Select-Object -First 1
        if (-not $java) { $c = Get-Command java -ErrorAction SilentlyContinue; if ($c) { $java = @{ FullName = $c.Source } } }
        if ($java) { return @{ Jar = $jar.FullName; Java = $java.FullName; Dir = $d } }
      }
    }
  }
  return $null
}

switch ($Action) {
  'start' {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { Write-Output "Suwayomi 已在运行 (PID $($conn[0].OwningProcess))"; exit 0 }
    $s = Find-Suwayomi
    if (-not $s) { Write-Output '未找到 Suwayomi，请先运行 setup.bat'; exit 1 }
    $log = Join-Path $s.Dir 'server.log'
    $err = Join-Path $s.Dir 'server.err.log'
    Start-Process -FilePath $s.Java -ArgumentList '-jar', "`"$($s.Jar)`"" -WorkingDirectory $s.Dir -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err
    Write-Output "Suwayomi 已启动 (http://127.0.0.1:$port)"
  }
  'stop' {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { Stop-Process -Id $conn[0].OwningProcess -Force; Write-Output 'Suwayomi 已停止' }
    else { Write-Output 'Suwayomi 未在运行' }
  }
  'status' {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { Write-Output "运行中 (PID $($conn[0].OwningProcess), 端口 $port)" }
    else { Write-Output '未运行' }
  }
}
