$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskThemes = node tests/scene-preview.test.mjs --preview | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw '场景测试未通过' }
$taskBitmap = New-Object System.Drawing.Bitmap(1000, 660)
$taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
$taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$taskGraphics.Clear([System.Drawing.Color]::FromArgb(247, 247, 239))
$taskFont = New-Object System.Drawing.Font('Microsoft YaHei', 13)
try {
  for ($taskIndex = 0; $taskIndex -lt $taskThemes.Count; $taskIndex++) {
    $taskTheme = $taskThemes[$taskIndex]
    $taskX = 15 + ($taskIndex % 2) * 495
    $taskY = 15 + [Math]::Floor($taskIndex / 2) * 325
    $taskGraphics.DrawString($taskTheme.name, $taskFont, [System.Drawing.Brushes]::DarkSlateGray, $taskX, $taskY)
    $taskState = $taskGraphics.Save()
    try {
      $taskGraphics.SetClip((New-Object System.Drawing.RectangleF($taskX, ($taskY + 32), 480, 270)))
      $taskGraphics.TranslateTransform($taskX, ($taskY + 32))
      $taskGraphics.ScaleTransform(0.5, 0.5)
      $taskSkyRect = New-Object System.Drawing.Rectangle(0, 0, 960, 540)
      $taskSky = New-Object System.Drawing.Drawing2D.LinearGradientBrush($taskSkyRect, [System.Drawing.Color]::White, [System.Drawing.Color]::Black, [single]90)
      try {
        $taskBlend = New-Object System.Drawing.Drawing2D.ColorBlend(3)
        $taskBlend.Colors = [System.Drawing.Color[]]@($taskTheme.sky | ForEach-Object { [System.Drawing.ColorTranslator]::FromHtml($_) })
        $taskBlend.Positions = [single[]]@(0, 0.55, 1)
        $taskSky.InterpolationColors = $taskBlend
        $taskGraphics.FillRectangle($taskSky, $taskSkyRect)
      } finally { $taskSky.Dispose() }
      foreach ($taskLayer in $taskTheme.layers) {
        $taskStart = 0; $taskEnd = 1; $taskStep = 1
        if ($taskLayer.repeat) { $taskStart = -$taskLayer.repeat; $taskEnd = 960 + $taskLayer.repeat; $taskStep = $taskLayer.repeat }
        for ($taskOffset = $taskStart; $taskOffset -lt $taskEnd; $taskOffset += $taskStep) {
          foreach ($taskShape in $taskLayer.shapes) {
            $taskColor = [System.Drawing.Color]::FromArgb([int]($taskShape.alpha * 255), [int](($taskShape.color -shr 16) -band 255), [int](($taskShape.color -shr 8) -band 255), [int]($taskShape.color -band 255))
            $taskBrush = New-Object System.Drawing.SolidBrush($taskColor)
            try {
              if ($taskShape.kind -eq 'rect') {
                $taskGraphics.FillRectangle($taskBrush, [single]($taskShape.x + $taskOffset), [single]$taskShape.y, [single]$taskShape.width, [single]$taskShape.height)
              } else {
                $taskGraphics.FillEllipse($taskBrush, [single]($taskShape.x + $taskOffset - $taskShape.width / 2), [single]($taskShape.y - $taskShape.height / 2), [single]$taskShape.width, [single]$taskShape.height)
              }
            } finally { $taskBrush.Dispose() }
          }
        }
      }
    } finally { $taskGraphics.Restore($taskState) }
  }
  $taskBitmap.Save((Join-Path (Get-Location) 'docs/scene-themes-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $taskFont.Dispose(); $taskGraphics.Dispose(); $taskBitmap.Dispose() }
