import sys
from PIL import Image, ImageDraw
src,x0,y0,x1,y1,z,out=sys.argv[1],*map(int,sys.argv[2:7]),sys.argv[7]
step=int(sys.argv[8]) if len(sys.argv)>8 else 25
im=Image.open(src).crop((x0,y0,x1,y1)); im=im.resize((im.width*z,im.height*z),Image.LANCZOS)
d=ImageDraw.Draw(im)
for x in range((x0//step+1)*step,x1,step): d.line([((x-x0)*z,0),((x-x0)*z,im.height)],fill=(255,255,0) if x%(2*step)==0 else (140,140,0)); d.text(((x-x0)*z+2,2),str(x),fill=(255,255,0))
for y in range((y0//step+1)*step,y1,step): d.line([(0,(y-y0)*z),(im.width,(y-y0)*z)],fill=(255,255,0) if y%(2*step)==0 else (140,140,0)); d.text((2,(y-y0)*z+2),str(y),fill=(255,255,0))
im.save(out); print(im.size)
