param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputFile,[ValidateSet('true','false')][string]$RemoveWhite='false')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;
public static class AccessoryImage {
  public static void Prepare(string input,string output,bool removeWhite) {
    using(var source=new Bitmap(input)) using(var b=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppArgb)) {
      using(var g=Graphics.FromImage(b)){g.DrawImageUnscaled(source,0,0);}
      int w=b.Width,h=b.Height;
      if(w>8192||h>8192)throw new Exception("Image too large; use at most 8192 pixels per side");
      if(removeWhite){
        var seen=new bool[w*h];var q=new Queue<int>();
        Action<int,int> add=(x,y)=>{int i=y*w+x;if(seen[i])return;seen[i]=true;var c=b.GetPixel(x,y);if(c.A==0||(c.R>=235&&c.G>=235&&c.B>=235&&Math.Max(c.R,Math.Max(c.G,c.B))-Math.Min(c.R,Math.Min(c.G,c.B))<=20)){q.Enqueue(i);b.SetPixel(x,y,Color.Transparent);}};
        for(int x=0;x<w;x++){add(x,0);add(x,h-1);}for(int y=0;y<h;y++){add(0,y);add(w-1,y);}
        while(q.Count>0){int i=q.Dequeue(),x=i%w,y=i/w;if(x>0)add(x-1,y);if(x<w-1)add(x+1,y);if(y>0)add(x,y-1);if(y<h-1)add(x,y+1);}
      }
      int l=w,t=h,r=-1,bt=-1;bool transparent=false;
      for(int y=0;y<h;y++)for(int x=0;x<w;x++){var a=b.GetPixel(x,y).A;if(a<255)transparent=true;if(a>8){l=Math.Min(l,x);r=Math.Max(r,x);t=Math.Min(t,y);bt=Math.Max(bt,y);}}
      if(r<l)throw new Exception("No foreground survived background removal");
      if(!transparent)throw new Exception("Image has no transparency. Supply a cutout, or enable white-background removal for white backgrounds");
      int edgeForeground=0;
      for(int x=0;x<w;x++){if(b.GetPixel(x,0).A>8)edgeForeground++;if(b.GetPixel(x,h-1).A>8)edgeForeground++;}
      for(int y=0;y<h;y++){if(b.GetPixel(0,y).A>8)edgeForeground++;if(b.GetPixel(w-1,y).A>8)edgeForeground++;}
      if(edgeForeground>0.2*(2*w+2*h))throw new Exception("Foreground fills the frame edges. Use a complete isolated accessory or a shape guide; clipped artwork cannot be exported");
      int cw=r-l+1,ch=bt-t+1;float scale=Math.Min(488f/cw,488f/ch);
      using(var result=new Bitmap(512,512,PixelFormat.Format32bppArgb))using(var g=Graphics.FromImage(result)){
        g.Clear(Color.Transparent);g.InterpolationMode=InterpolationMode.HighQualityBicubic;
        float dw=cw*scale,dh=ch*scale;
        g.DrawImage(b,new RectangleF((512-dw)/2,(512-dh)/2,dw,dh),new RectangleF(l,t,cw,ch),GraphicsUnit.Pixel);
        result.Save(output,ImageFormat.Png);
      }
      Console.WriteLine("Prepared 512x512 transparent PNG; inspect cutout edges before publishing.");
    }
  }
}
'@
[AccessoryImage]::Prepare($InputFile,$OutputFile,($RemoveWhite -eq 'true'))
