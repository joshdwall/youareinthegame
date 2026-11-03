$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=$PSScriptRoot
$rig=Get-Content -LiteralPath (Join-Path $root 'character-rig.json') -Raw | ConvertFrom-Json
$width=1280;$height=1120;$ox=285;$oy=390;$cw=$rig.width;$ch=$rig.height
$b=[Drawing.Bitmap]::new($width,$height)
$g=[Drawing.Graphics]::FromImage($b)
$g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([Drawing.Color]::FromArgb(225,232,239))
$ink=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(34,60,83))
$accent=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(163,42,66))
$line=[Drawing.Pen]::new([Drawing.Color]::FromArgb(107,125,143),1.3)
$dash=[Drawing.Pen]::new([Drawing.Color]::FromArgb(163,42,66),2);$dash.DashStyle=[Drawing.Drawing2D.DashStyle]::Dash
$font=[Drawing.Font]::new('Segoe UI',15)
$title=[Drawing.Font]::new('Segoe UI',23)
$small=[Drawing.Font]::new('Segoe UI',12)
$svg=[Collections.Generic.List[string]]::new()
$svg.Add('<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Character anchors, cowboy hat placement and bandana coverage" viewBox="0 0 1280 1120"><rect width="1280" height="1120" fill="#e1e8ef"/>')
function Text([string]$s,[float]$x,[float]$y,[int]$size=20){
  $f=$font;if($size -eq 31){$f=$title};if($size -eq 16){$f=$small}
  $g.DrawString($s,$f,$ink,$x,$y)
  $escaped=[Security.SecurityElement]::Escape($s)
  $svg.Add("<text x='$x' y='$($y+$size)' font-family='Segoe UI, sans-serif' font-size='$size' fill='#223c53'>$escaped</text>")
}
Text 'Placement template / Mushroom Platypus' 45 35 31
Text 'Bill landmarks, mouth / mustache, eyes and the live cowboy hat placement' 47 87 20
$basePath=Join-Path $root $rig.image
$base=[Drawing.Image]::FromFile($basePath)
$g.DrawImage($base,$ox,$oy,$cw,$ch)
$baseData=[Convert]::ToBase64String([IO.File]::ReadAllBytes($basePath))
$svg.Add("<image href='data:image/png;base64,$baseData' x='$ox' y='$oy' width='$cw' height='$ch'/>")
$hatPath=Join-Path $root $rig.reference.hatImage
$hat=[Drawing.Image]::FromFile($hatPath)
$placement=$rig.presetPlacements.head
$hw=[float]$placement.scale*$cw;$hh=$hw*$hat.Height/$hat.Width
$hx=$ox+[float]$placement.characterAnchor.x*$cw-$hw*[float]$placement.objectAnchor.x
$hy=$oy+[float]$placement.characterAnchor.y*$ch-$hh*[float]$placement.objectAnchor.y
$attributes=[Drawing.Imaging.ImageAttributes]::new();$matrix=[Drawing.Imaging.ColorMatrix]::new();$matrix.Matrix33=0.38;$attributes.SetColorMatrix($matrix)
$g.DrawImage($hat,[Drawing.Rectangle]::new([int]$hx,[int]$hy,[int]$hw,[int]$hh),0,0,$hat.Width,$hat.Height,[Drawing.GraphicsUnit]::Pixel,$attributes)
$hatData=[Convert]::ToBase64String([IO.File]::ReadAllBytes($hatPath))
$svg.Add("<image href='data:image/png;base64,$hatData' x='$hx' y='$hy' width='$hw' height='$hh' opacity='.38'/>")
$points=[Drawing.PointF[]]@($rig.regions.bandana.polygon | ForEach-Object {[Drawing.PointF]::new(($ox+[float]$_.x*$cw),($oy+[float]$_.y*$ch))})
$shade=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(34,163,42,66));$g.FillPolygon($shade,$points);$g.DrawPolygon($dash,$points)
$pointString=($points | ForEach-Object {"$($_.X),$($_.Y)"}) -join ' '
$svg.Add("<polygon points='$pointString' fill='#a32a42' fill-opacity='.13' stroke='#a32a42' stroke-width='2' stroke-dasharray='7 5'/>")
$labels=@(
  @('head','hat center',1040,220),
  @('handL','handL',50,450),@('handR','handR',1040,450),
  @('eye-left','eye-left',50,550),@('eye-right','eye-right',1040,550),
  @('eyes','eyes center',1040,670),
  @('bill-top','bill-top',50,700),@('mouth','mouth / mustache',1040,790),
  @('bill-bottom','bill-bottom',50,910)
)
foreach($entry in $labels){
  $a=$rig.anchors.PSObject.Properties[$entry[0]].Value
  $x=$ox+[float]$a.x*$cw;$y=$oy+[float]$a.y*$ch;$lx=[float]$entry[2];$ly=[float]$entry[3]
  $edge=$lx-10;if($lx -lt $ox){$edge=$lx+190}
  $g.DrawLine($line,$x,$y,$edge,($ly+12));$g.FillEllipse($accent,($x-5),($y-5),10,10)
  $svg.Add("<line x1='$x' y1='$y' x2='$edge' y2='$($ly+12)' stroke='#6b7d8f' stroke-width='1.3'/><circle cx='$x' cy='$y' r='5' fill='#a32a42'/>")
  Text $entry[1] $lx $ly 20
}
Text '105% character width' 1040 254 16
Text 'Live cowboy reference' 1040 279 16
Text 'Bandana coverage' 1040 920 20
Text 'Starts at bill-top; covers the mouth; extends below bill-bottom.' 50 1005 20
Text 'Eyes are approximate. Mouth and hat follow live cowboy placements checked 2026-11-03.' 50 1042 16
$svg.Add('</svg>')
[IO.File]::WriteAllText((Join-Path $root 'placement-template.svg'),($svg -join "`n"),[Text.UTF8Encoding]::new($false))
$b.Save((Join-Path $root 'placement-template.png'),[Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$b.Dispose();$base.Dispose();$hat.Dispose();$attributes.Dispose();$shade.Dispose();$font.Dispose();$title.Dispose();$small.Dispose();$ink.Dispose();$accent.Dispose();$line.Dispose();$dash.Dispose()
Write-Output 'Updated PNG and SVG templates from character-rig.json.'
