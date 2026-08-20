import re

lines = [l.rstrip("\n") for l in open("route_methods.txt", encoding="utf-8")]
admin = []
for l in lines:
    parts = l.split("\t")
    if len(parts) != 2:
        continue
    path, methods = parts
    if "api\\admin\\" in path:
        sub = path.split("api\\admin\\", 1)[1].replace("\\route.ts", "")
        admin.append((sub, methods))

print("total admin routes:", len(admin))
for sub, methods in admin:
    print(sub, "|", methods)
