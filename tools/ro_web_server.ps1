param(
  [int]$Port = 8000,
  [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "RO_WEB server: http://127.0.0.1:$Port/"
Write-Host "Root: $Root"
Write-Host "Press Ctrl+C to stop."

$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.webp'='image/webp'; '.jpg'='image/jpeg';
  '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'
}

function Send-Response([Net.Sockets.NetworkStream]$Stream, [int]$Status, [string]$Reason, [byte[]]$Body, [string]$ContentType) {
  $header = "HTTP/1.1 $Status $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache, no-store, must-revalidate`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
  $Stream.Flush()
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      while (($line = $reader.ReadLine()) -ne $null -and $line -ne '') { }
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
      $parts = $requestLine.Split(' ')
      if ($parts.Length -lt 2 -or ($parts[0] -ne 'GET' -and $parts[0] -ne 'HEAD')) {
        Send-Response $stream 405 'Method Not Allowed' ([Text.Encoding]::UTF8.GetBytes('405 Method Not Allowed')) 'text/plain; charset=utf-8'
        continue
      }
      $rawPath = $parts[1].Split('?')[0]
      $relative = [Uri]::UnescapeDataString($rawPath).TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      $full = [IO.Path]::GetFullPath((Join-Path $Root $relative))
      if (-not ($full.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) {
        Send-Response $stream 403 'Forbidden' ([Text.Encoding]::UTF8.GetBytes('403 Forbidden')) 'text/plain; charset=utf-8'
        continue
      }
      if (Test-Path $full -PathType Container) { $full = Join-Path $full 'index.html' }
      if (-not (Test-Path $full -PathType Leaf)) {
        Send-Response $stream 404 'Not Found' ([Text.Encoding]::UTF8.GetBytes('404 Not Found')) 'text/plain; charset=utf-8'
        continue
      }
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $body = if ($parts[0] -eq 'HEAD') { [byte[]]::new(0) } else { [IO.File]::ReadAllBytes($full) }
      Send-Response $stream 200 'OK' $body $contentType
    } catch {
      try { Send-Response $stream 500 'Server Error' ([Text.Encoding]::UTF8.GetBytes("500 Server Error`n$($_.Exception.Message)")) 'text/plain; charset=utf-8' } catch { }
    } finally {
      if ($reader) { $reader.Dispose() }
      if ($stream) { $stream.Dispose() }
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
