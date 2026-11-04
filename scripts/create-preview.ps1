param([ValidateSet(1,2,3)][int]$Variant = 2, [string]$Output = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (!$Output) { $Output = Join-Path $PSScriptRoot "../docs/images/previews/preview-$Variant.png" }
$background = [Drawing.Image]::FromFile((Join-Path $PSScriptRoot "../docs/images/previews/background-$Variant.png"))
$shotName = if ($Variant -eq 3) { 'arguments' } else { 'tasks' }
$shot = [Drawing.Image]::FromFile((Join-Path $PSScriptRoot "../docs/images/$shotName.png"))
$canvas = [Drawing.Bitmap]::new(1672,941)
$g = [Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#061923'))
$title = [Drawing.Font]::new('Georgia',112,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
$tagline = [Drawing.Font]::new('Georgia',34,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
$shadow = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(40,20,25,25))
$border = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#bdb6aa'))
try {
    $g.DrawImage($background,[Drawing.Rectangle]::new(0,0,1672,941))
    $g.DrawString('Ciupaga',$title,$ink,48,18)
    $g.DrawString("Run your everyday tasks.`nKeep the console close.",$tagline,$ink,780,46)
    $x=780; $y=155; $width=830
    if ($Variant -eq 3) { $width=740; $x=870 }
    $height=[int][Math]::Round($shot.Height*$width/$shot.Width)
    $g.FillRectangle($shadow,$x+7,$y+9,$width,$height+30)
    $chrome=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#f1ece3'))
    $g.FillRectangle($chrome,$x,$y,$width,30)
    $chrome.Dispose()
    for($i=0;$i -lt 3;$i++) {
        $dot=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml(@('#ff6057','#ffbd2e','#28c840')[$i]))
        $g.FillEllipse($dot,$x+15+22*$i,$y+9,12,12)
        $dot.Dispose()
    }
    $g.DrawImage($shot,[Drawing.Rectangle]::new($x,$y+30,$width,$height))
    $g.DrawRectangle($border,$x,$y,$width,$height+30)
    $canvas.Save([IO.Path]::GetFullPath($Output),[Drawing.Imaging.ImageFormat]::Png)
} finally {
    $border.Dispose(); $shadow.Dispose(); $title.Dispose(); $tagline.Dispose(); $ink.Dispose()
    $g.Dispose(); $canvas.Dispose(); $shot.Dispose(); $background.Dispose()
}
