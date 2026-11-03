param([Parameter(Mandatory=$true)][string]$ExportDir)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$animation=Get-Content -LiteralPath (Join-Path $ExportDir 'animation.draft.json') -Raw | ConvertFrom-Json
$placements=Get-Content -LiteralPath (Join-Path $ExportDir 'placements.draft.json') -Raw | ConvertFrom-Json
$layout=$placements.byAnimation.PSObject.Properties[$animation.id].Value
$character=[Drawing.Image]::FromFile((Join-Path $ExportDir 'character.png'))
$bitmap=[Drawing.Bitmap]::new(($character.Width+200),($character.Height+320))
$graphics=[Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([Drawing.Color]::FromArgb(183,190,199))
  $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TranslateTransform(100,160)
  $graphics.DrawImage($character,0,0,$character.Width,$character.Height)
  foreach($element in $animation.elements){
    $s=$layout.elements.PSObject.Properties[$element.id].Value
    $image=[Drawing.Image]::FromFile((Join-Path $ExportDir $element.src))
    $saved=$graphics.Save()
    try {
      $graphics.TranslateTransform(([float]$s.characterAnchor.x*$character.Width),([float]$s.characterAnchor.y*$character.Height))
      $graphics.RotateTransform([float]$s.rotation)
      if($s.flipX){$graphics.ScaleTransform(-1,1)}
      $w=[float]$s.scale*$character.Width
      $h=$w*$image.Height/$image.Width
      $graphics.DrawImage($image,([float](-$s.objectAnchor.x*$w)),([float](-$s.objectAnchor.y*$h)),[float]$w,[float]$h)
    } finally {$graphics.Restore($saved);$image.Dispose()}
  }
  $bitmap.Save((Join-Path $ExportDir 'preview.png'),[Drawing.Imaging.ImageFormat]::Png)
} finally {$graphics.Dispose();$bitmap.Dispose();$character.Dispose()}
