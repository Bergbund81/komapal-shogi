"""Generate 8 avatar SVGs (300x400, 縦4:横3) for the shogi app."""
import os, sys

OUT = sys.argv[1]
W, H = 300, 400


def frame(bg, deco, inner):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" rx="28" fill="{bg}"/>
  <circle cx="150" cy="175" r="128" fill="{deco}"/>
  <circle cx="38" cy="52" r="10" fill="#fff" opacity=".55"/>
  <circle cx="262" cy="70" r="6" fill="#fff" opacity=".55"/>
  <circle cx="250" cy="330" r="8" fill="#fff" opacity=".4"/>
{inner}
</svg>
'''


def human_face(skin="#FFDCC2", eye="#3A2A20", lashes=False, glasses=False, blush="#FF9BB0"):
    s = f'''  <rect x="132" y="232" width="36" height="40" fill="{skin}"/>
  <circle cx="150" cy="172" r="78" fill="{skin}"/>
  <ellipse cx="72" cy="180" rx="12" ry="18" fill="{skin}"/>
  <ellipse cx="228" cy="180" rx="12" ry="18" fill="{skin}"/>
  <ellipse cx="122" cy="182" rx="9" ry="11" fill="{eye}"/>
  <ellipse cx="178" cy="182" rx="9" ry="11" fill="{eye}"/>
  <circle cx="125" cy="178" r="3.2" fill="#fff"/>
  <circle cx="181" cy="178" r="3.2" fill="#fff"/>
  <ellipse cx="104" cy="208" rx="13" ry="7" fill="{blush}" opacity=".6"/>
  <ellipse cx="196" cy="208" rx="13" ry="7" fill="{blush}" opacity=".6"/>
  <path d="M136 214 Q150 228 164 214" fill="none" stroke="#B4553F" stroke-width="4" stroke-linecap="round"/>
'''
    if lashes:
        s += '''  <path d="M110 172 L104 166 M114 169 L110 162 M190 172 L196 166 M186 169 L190 162" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/>
'''
    if glasses:
        s += '''  <circle cx="122" cy="182" r="20" fill="none" stroke="#2E3A4A" stroke-width="4.5"/>
  <circle cx="178" cy="182" r="20" fill="none" stroke="#2E3A4A" stroke-width="4.5"/>
  <path d="M142 180 Q150 174 158 180 M102 178 L82 172 M198 178 L218 172" fill="none" stroke="#2E3A4A" stroke-width="4.5"/>
'''
    return s


def girl():
    hair = "#7A4426"
    inner = f'''  <ellipse cx="150" cy="182" rx="100" ry="108" fill="{hair}"/>
  <path d="M52 180 Q44 300 86 330 L118 330 L112 200 Z" fill="{hair}"/>
  <path d="M248 180 Q256 300 214 330 L182 330 L188 200 Z" fill="{hair}"/>
  <path d="M62 400 Q66 296 150 288 Q234 296 238 400 Z" fill="#FF7FA8"/>
  <path d="M120 290 L150 318 L180 290 Z" fill="#fff"/>
  <circle cx="150" cy="350" r="6" fill="#fff"/>
{human_face(lashes=True)}  <path d="M70 168 Q74 84 150 82 Q226 84 230 168 Q206 128 178 138 Q164 112 146 134 Q112 118 70 168 Z" fill="{hair}"/>
  <path d="M206 92 L238 72 L240 112 Z" fill="#FF4F7B"/>
  <path d="M206 92 L196 56 L232 66 Z" fill="#FF4F7B"/>
  <circle cx="210" cy="90" r="9" fill="#E8335F"/>'''
    return frame("#FFE6EE", "#FFCADB", inner)


def boy():
    hair = "#2B2B33"
    inner = f'''  <path d="M60 400 Q64 296 150 288 Q236 296 240 400 Z" fill="#3D8BFF"/>
  <path d="M60 400 Q64 296 150 288 Q236 296 240 400 Z" fill="none"/>
  <rect x="62" y="336" width="176" height="14" fill="#FFD23F"/>
  <path d="M128 288 Q150 306 172 288" fill="none" stroke="#2A6BD1" stroke-width="6"/>
{human_face()}  <path d="M72 160 Q66 92 120 86 L112 66 L140 82 L150 58 L164 82 L192 66 L184 90 Q234 100 228 160 Q214 124 186 126 Q170 110 150 124 Q128 108 110 126 Q86 124 72 160 Z" fill="{hair}"/>'''
    return frame("#E3F0FF", "#C3DDFF", inner)


def papa():
    hair = "#3B3128"
    inner = f'''  <path d="M52 400 Q58 290 150 282 Q242 290 248 400 Z" fill="#33507A"/>
  <path d="M118 284 L150 330 L182 284 Z" fill="#fff"/>
  <path d="M143 300 L157 300 L162 370 L150 384 L138 370 Z" fill="#E2483D"/>
  <path d="M143 300 L157 300 L150 312 Z" fill="#B8342B"/>
{human_face(skin="#F6CDA8", glasses=True, blush="#F2998A")}  <path d="M74 156 Q70 88 150 84 Q232 88 226 156 Q222 124 200 118 Q150 128 104 112 Q82 124 74 156 Z" fill="{hair}"/>
  <path d="M120 236 Q150 252 180 236 Q176 250 150 254 Q124 250 120 236 Z" fill="{hair}" opacity=".35"/>'''
    return frame("#E5EEF3", "#C8DCE6", inner)


def mama():
    hair = "#5A2E1E"
    inner = f'''  <path d="M54 230 Q40 120 110 88 Q150 70 192 88 Q262 120 246 230 Q250 278 220 290 L80 290 Q50 278 54 230 Z" fill="{hair}"/>
  <path d="M58 400 Q62 292 150 286 Q238 292 242 400 Z" fill="#F07A3C"/>
  <path d="M106 296 Q150 340 194 296 L194 400 L106 400 Z" fill="#FFF4E0"/>
  <path d="M106 352 L194 352" stroke="#F07A3C" stroke-width="3" stroke-dasharray="6 6"/>
{human_face(lashes=True, blush="#FF8FA0")}  <path d="M76 170 Q78 90 150 86 Q222 90 226 170 Q214 120 160 112 Q150 140 108 132 Q86 140 76 170 Z" fill="{hair}"/>
  <circle cx="72" cy="206" r="6" fill="#FFD23F"/>
  <circle cx="228" cy="206" r="6" fill="#FFD23F"/>
  <path d="M136 214 Q150 228 164 214" fill="none" stroke="#D94A5A" stroke-width="5" stroke-linecap="round"/>'''
    return frame("#FFF0E0", "#FFDDB8", inner)


def dog():
    fur, light = "#E39A4C", "#FFF3E2"
    inner = f'''  <path d="M60 400 Q66 292 150 284 Q234 292 240 400 Z" fill="{fur}"/>
  <path d="M110 300 Q150 330 190 300 L186 400 L114 400 Z" fill="{light}"/>
  <path d="M100 290 Q150 310 200 290" fill="none" stroke="#2E7DD1" stroke-width="12" stroke-linecap="round"/>
  <circle cx="150" cy="312" r="10" fill="#FFD23F"/>
  <path d="M78 140 L70 58 L134 102 Z" fill="{fur}"/>
  <path d="M222 140 L230 58 L166 102 Z" fill="{fur}"/>
  <path d="M86 126 L82 76 L120 104 Z" fill="#F7C9A0"/>
  <path d="M214 126 L218 76 L180 104 Z" fill="#F7C9A0"/>
  <ellipse cx="150" cy="178" rx="84" ry="80" fill="{fur}"/>
  <path d="M86 200 Q90 260 150 262 Q210 260 214 200 Q196 170 150 172 Q104 170 86 200 Z" fill="{light}"/>
  <ellipse cx="116" cy="150" rx="12" ry="5" fill="{light}"/>
  <ellipse cx="184" cy="150" rx="12" ry="5" fill="{light}"/>
  <circle cx="118" cy="170" r="9" fill="#2B1E16"/><circle cx="182" cy="170" r="9" fill="#2B1E16"/>
  <circle cx="121" cy="167" r="3" fill="#fff"/><circle cx="185" cy="167" r="3" fill="#fff"/>
  <ellipse cx="150" cy="200" rx="15" ry="11" fill="#2B1E16"/>
  <path d="M150 211 L150 222 M150 222 Q138 234 128 224 M150 222 Q162 234 172 224" fill="none" stroke="#2B1E16" stroke-width="4" stroke-linecap="round"/>
  <path d="M142 230 Q150 250 158 230 Z" fill="#FF7A8A"/>
  <ellipse cx="102" cy="206" rx="11" ry="6" fill="#FF9BB0" opacity=".5"/>
  <ellipse cx="198" cy="206" rx="11" ry="6" fill="#FF9BB0" opacity=".5"/>'''
    return frame("#EAF6E4", "#CFEABF", inner)


def cat():
    fur = "#8E8E99"
    inner = f'''  <path d="M60 400 Q66 292 150 284 Q234 292 240 400 Z" fill="{fur}"/>
  <path d="M116 300 Q150 324 184 300 L180 400 L120 400 Z" fill="#F4F4F7"/>
  <path d="M104 292 Q150 312 196 292" fill="none" stroke="#E2483D" stroke-width="10" stroke-linecap="round"/>
  <circle cx="150" cy="312" r="9" fill="#FFD23F"/>
  <path d="M74 150 L80 60 L136 108 Z" fill="{fur}"/>
  <path d="M226 150 L220 60 L164 108 Z" fill="{fur}"/>
  <path d="M88 132 L90 82 L122 110 Z" fill="#FFB7C5"/>
  <path d="M212 132 L210 82 L178 110 Z" fill="#FFB7C5"/>
  <ellipse cx="150" cy="182" rx="88" ry="78" fill="{fur}"/>
  <path d="M138 110 L142 136 M150 106 L150 134 M162 110 L158 136" stroke="#6C6C78" stroke-width="5" stroke-linecap="round"/>
  <path d="M110 222 Q150 252 190 222 Q186 196 150 196 Q114 196 110 222 Z" fill="#F4F4F7"/>
  <ellipse cx="118" cy="176" rx="12" ry="14" fill="#9BD06A"/><ellipse cx="182" cy="176" rx="12" ry="14" fill="#9BD06A"/>
  <ellipse cx="118" cy="177" rx="4" ry="11" fill="#1E2A16"/><ellipse cx="182" cy="177" rx="4" ry="11" fill="#1E2A16"/>
  <circle cx="122" cy="171" r="3" fill="#fff"/><circle cx="186" cy="171" r="3" fill="#fff"/>
  <path d="M142 204 L158 204 L150 214 Z" fill="#FF8FA3"/>
  <path d="M150 214 Q142 226 134 220 M150 214 Q158 226 166 220" fill="none" stroke="#4A4A55" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M104 208 L64 200 M104 216 L66 222 M196 208 L236 200 M196 216 L234 222" stroke="#4A4A55" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="100" cy="196" rx="10" ry="5" fill="#FF9BB0" opacity=".5"/>
  <ellipse cx="200" cy="196" rx="10" ry="5" fill="#FF9BB0" opacity=".5"/>'''
    return frame("#F1ECFF", "#DCD2FF", inner)


def chicken():
    inner = '''  <path d="M128 94 Q120 58 146 66 Q150 40 172 58 Q194 50 186 84 Q200 92 180 104 L136 108 Z" fill="#E8333A"/>
  <path d="M58 400 Q50 300 80 230 Q86 110 150 104 Q214 110 220 230 Q250 300 242 400 Z" fill="#FFFFFF" stroke="#F0E6D8" stroke-width="3"/>
  <path d="M74 300 Q40 270 52 240 Q80 250 92 290 Z" fill="#FFFFFF" stroke="#E6DACA" stroke-width="3"/>
  <path d="M226 300 Q260 270 248 240 Q220 250 208 290 Z" fill="#FFFFFF" stroke="#E6DACA" stroke-width="3"/>
  <circle cx="122" cy="170" r="10" fill="#2B1E16"/><circle cx="178" cy="170" r="10" fill="#2B1E16"/>
  <circle cx="125" cy="166" r="3.5" fill="#fff"/><circle cx="181" cy="166" r="3.5" fill="#fff"/>
  <path d="M130 196 L170 196 L150 222 Z" fill="#FFB02E"/>
  <path d="M130 196 L170 196 L150 206 Z" fill="#FFC85C"/>
  <path d="M140 220 Q136 250 150 252 Q164 250 160 220 Z" fill="#E8333A"/>
  <ellipse cx="100" cy="200" rx="13" ry="7" fill="#FF9BB0" opacity=".55"/>
  <ellipse cx="200" cy="200" rx="13" ry="7" fill="#FF9BB0" opacity=".55"/>
  <path d="M110 340 Q150 356 190 340" fill="none" stroke="#F0E6D8" stroke-width="4" stroke-linecap="round"/>'''
    return frame("#FFF7D6", "#FFE99A", inner)


def penguin():
    inner = '''  <path d="M56 400 Q44 300 70 220 Q76 100 150 96 Q224 100 230 220 Q256 300 244 400 Z" fill="#26334A"/>
  <path d="M66 330 Q30 290 50 250 Q74 270 84 310 Z" fill="#26334A"/>
  <path d="M234 330 Q270 290 250 250 Q226 270 216 310 Z" fill="#26334A"/>
  <path d="M92 400 Q78 300 98 230 Q100 150 150 148 Q200 150 202 230 Q222 300 208 400 Z" fill="#FFFFFF"/>
  <path d="M92 210 Q96 140 150 138 Q204 140 208 210 Q190 186 150 190 Q110 186 92 210 Z" fill="#FFFFFF"/>
  <path d="M100 210 Q120 150 150 168 Q180 150 200 210" fill="none"/>
  <circle cx="124" cy="182" r="10" fill="#1A1A22"/><circle cx="176" cy="182" r="10" fill="#1A1A22"/>
  <circle cx="127" cy="178" r="3.5" fill="#fff"/><circle cx="179" cy="178" r="3.5" fill="#fff"/>
  <path d="M132 204 Q150 196 168 204 L150 222 Z" fill="#FF9A2E"/>
  <ellipse cx="104" cy="212" rx="12" ry="7" fill="#FF9BB0" opacity=".55"/>
  <ellipse cx="196" cy="212" rx="12" ry="7" fill="#FF9BB0" opacity=".55"/>
  <path d="M94 286 Q150 300 206 286" fill="none" stroke="#3FA7E0" stroke-width="12" stroke-linecap="round"/>
  <path d="M190 292 L204 340 L184 336 Z" fill="#3FA7E0"/>'''
    return frame("#E2F5FB", "#BFE7F5", inner)


AVATARS = {
    "girl": girl, "boy": boy, "papa": papa, "mama": mama,
    "dog": dog, "cat": cat, "chicken": chicken, "penguin": penguin,
}

os.makedirs(OUT, exist_ok=True)
for name, fn in AVATARS.items():
    with open(os.path.join(OUT, f"{name}.svg"), "w", encoding="utf-8") as f:
        f.write(fn())
print("done", len(AVATARS))
