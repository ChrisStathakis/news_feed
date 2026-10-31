from PIL import Image
import os
IN = r"D:\projects\news_feed\memes\in"
OUT = r"D:\projects\news_feed\memes\work"
a = Image.open(os.path.join(IN, "img1.jpg"))
box = (400, 560, 820, 1000)
c = a.crop(box)
c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
c.save(os.path.join(OUT, "target_area.png"))
print(c.size, box)
