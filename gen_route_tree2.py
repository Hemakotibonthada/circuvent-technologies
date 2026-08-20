import sys

with open("api_routes_list.txt", encoding="utf-8") as f:
    lines = [l.strip() for l in f if l.strip()]

routes = []
for l in lines:
    l2 = l.replace("\\", "/")
    assert l2.startswith("src/app/api/")
    rest = l2[len("src/app/api/"):]
    assert rest.endswith("/route.ts")
    rest = rest[: -len("/route.ts")]
    routes.append(rest)

assert len(routes) == 150, len(routes)

groups = {}
order = []
for r in routes:
    seg = r.split("/")[0]
    if seg not in groups:
        groups[seg] = []
        order.append(seg)
    sub = r[len(seg):]
    if sub.startswith("/"):
        sub = sub[1:]
    groups[seg].append(sub)

def word(n):
    return "route" if n == 1 else "routes"

out = []
total = len(routes)
out.append("src/app/api/                                            150 route.ts files")
out.append("|                                                        26 top-level groups")

n_groups = len(order)
for gi, g in enumerate(order):
    is_last_group = gi == n_groups - 1
    conn = "`--" if is_last_group else "|--"
    subs = groups[g]
    subs_sorted = sorted(subs)
    n = len(subs)
    if n == 1 and subs[0] == "":
        label = f"{g}/route.ts"
        pad2 = max(1, 70 - len(conn) - 1 - len(label))
        out.append(f"{conn} {label}{' ' * pad2}1 {word(1)}")
    else:
        label = f"{g}/"
        pad2 = max(1, 70 - len(conn) - 1 - len(label))
        out.append(f"{conn} {label}{' ' * pad2}{n} {word(n)}")
        cont = "    " if is_last_group else "|   "
        n_subs = len(subs_sorted)
        for si, s in enumerate(subs_sorted):
            is_last_sub = si == n_subs - 1
            sconn = "`--" if is_last_sub else "|--"
            leaf = "route.ts" if s == "" else f"{s}/route.ts"
            out.append(f"{cont}{sconn} {leaf}")
    if not is_last_group:
        out.append("|")

text = "\n".join(out)
# replace ascii connectors with box-drawing chars
text = text.replace("|--", "├──").replace("`--", "└──").replace("|   ", "│   ")
lines_out = text.split("\n")
fixed = []
for l in lines_out:
    if l == "|":
        l = "│"
    fixed.append(l)
text = "\n".join(fixed)

with open("route_tree.txt", "w", encoding="utf-8") as f:
    f.write(text + "\n")

# width check
maxw = 0
bad = []
all_lines = text.split("\n")
for i, l in enumerate(all_lines):
    w = len(l)
    if w > maxw:
        maxw = w
    if w > 88:
        bad.append((i, w, l))

print("max width:", maxw)
print("bad lines:", len(bad))
for b in bad[:20]:
    print(b)
print("total lines:", len(all_lines))

# sanity: recount leaf lines containing route.ts
leaf_count = sum(1 for l in all_lines if "route.ts" in l)
print("leaf route.ts mentions:", leaf_count)
