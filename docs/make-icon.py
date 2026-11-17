from PIL import Image, ImageDraw

S = 180
SCALE = S / 64.0

def s(v):
    return int(round(v * SCALE))

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

d.rounded_rectangle([s(4), s(6), s(4) + s(56) - 1, s(6) + s(52) - 1], radius=s(12), fill=(31, 111, 178, 255))

for x, y, w, alpha in ((13, 16, 30, 255), (13, 25, 38, 209), (13, 34, 22, 163)):
    d.rounded_rectangle(
        [s(x), s(y), s(x) + s(w) - 1, s(y) + s(4) - 1],
        radius=s(2),
        fill=(232, 242, 251, alpha),
    )

lines = [((22, 44), (32, 53)), ((32, 53), (42, 44))]
for (x1, y1), (x2, y2) in lines:
    d.line([s(x1), s(y1), s(x2), s(y2)], fill=(232, 242, 251, 255), width=s(4), joint="curve")
for x, y in ((22, 44), (32, 53), (42, 44)):
    r = s(4) // 2
    d.ellipse([s(x) - r, s(y) - r, s(x) + r, s(y) + r], fill=(232, 242, 251, 255))

img.save("assets/icon-180.png")
print("saved", img.size)
