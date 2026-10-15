$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskRows = node tests/platform-material.test.mjs --preview | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw '平台材质测试失败，不能生成预览' }
$taskSource = [System.Drawing.Bitmap]::FromFile((Join-Path (Get-Location) 'src/assets/editor/moss-platform.png'))
$taskPreview = New-Object System.Drawing.Bitmap(1050, 1100)
$taskGraphics = [System.Drawing.Graphics]::FromImage($taskPreview)
$taskGraphics.Clear([System.Drawing.Color]::FromArgb(232, 242, 223))
$taskGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$taskFont = New-Object System.Drawing.Font('Arial', 13)
$taskPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(35, 145, 114), 1)
$taskPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
$taskAttributes = New-Object System.Drawing.Imaging.ImageAttributes
$taskAttributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
try {
  foreach ($taskRow in $taskRows) {
    $taskLabelY = $taskRow.surface - 55
    if ($taskRow.label.Contains('custom')) { $taskLabelY = $taskRow.surface - 110 }
    $taskGraphics.DrawString($taskRow.label, $taskFont, [System.Drawing.Brushes]::DarkSlateGray, 35, $taskLabelY)
    foreach ($taskPart in $taskRow.slices) {
      $taskRect = New-Object System.Drawing.Rectangle([int]$taskPart.sx, [int]$taskPart.sy, [int]$taskPart.sw, [int]$taskPart.sh)
      $taskTile = $taskSource.Clone($taskRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try {
        if ($taskPart.flipX) { $taskTile.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
        $taskPoints = [System.Drawing.PointF[]]@(
          (New-Object System.Drawing.PointF([single]$taskPart.x, [single]$taskPart.y)),
          (New-Object System.Drawing.PointF([single]($taskPart.x + $taskPart.drawWidth), [single]$taskPart.y)),
          (New-Object System.Drawing.PointF([single]$taskPart.x, [single]($taskPart.y + $taskPart.height)))
        )
        $taskCrop = New-Object System.Drawing.RectangleF(0, 0, [single]$taskTile.Width, [single]$taskTile.Height)
        $taskGraphics.DrawImage($taskTile, $taskPoints, $taskCrop, [System.Drawing.GraphicsUnit]::Pixel, $taskAttributes)
      } finally { $taskTile.Dispose() }
    }
    $taskGraphics.DrawLine($taskPen, [single]35, [single]$taskRow.surface, [single]995, [single]$taskRow.surface)
  }
  $taskPreview.Save((Join-Path (Get-Location) 'docs/platform-material-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $taskAttributes.Dispose(); $taskPen.Dispose(); $taskFont.Dispose()
  $taskGraphics.Dispose(); $taskPreview.Dispose(); $taskSource.Dispose()
}
